// drivers/ghnService.js
// ===============================================================
// Driver: Giao Hàng Nhanh (GHN)
// Trả về { fee: number, leadTime: number|null } – leadTime = số ngày
// ===============================================================

const axios = require('axios');
const NodeCache = require('node-cache');
const cache = new NodeCache({ stdTTL: 86_400 }); // 24 h

const mysql = require('mysql2/promise');
// const { Op } = require('sequelize'); // Giữ lại nếu bạn có thể dùng Op (Sequelize-like), nếu không sẽ dùng LIKE/raw SQL cho tìm kiếm tên

const {
    GHN_TOKEN,
    GHN_SHOP_ID,
    SHOP_DISTRICT_CODE, // GHN DistrictID của kho lấy hàng (từ .env)
    SHOP_WARD_CODE,     // GHN WardCode của kho lấy hàng (từ .env)
    // Các biến môi trường khác của shop như SHOP_NAME, SHOP_PHONE, SHOP_ADDRESS, SHOP_PROVINCE_CODE
    // sẽ được truyền trực tiếp qua payload từ OrderController
} = process.env;

const headers = { Token: GHN_TOKEN, 'Content-Type': 'application/json' };

// Kết nối DB (một lần duy nhất khi module được tải)
let dbConnection;
(async () => {
    try {
        dbConnection = await mysql.createConnection({
            host: process.env.DB_HOST,
            port: +process.env.DB_PORT || 3306,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: process.env.DB_NAME,
            charset: 'utf8mb4',
        });
        console.log('GHN Service: Đã kết nối DB.');
    } catch (error) {
        console.error('GHN Service: Lỗi kết nối DB:', error.message);
        // Có thể thoát ứng dụng hoặc xử lý lỗi khác tùy vào yêu cầu của bạn
    }
})();


/* ---------- Helper cho hàm chuẩn hóa (Giống hệt trong importGhn.js) ---------- */
const deAccent = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const stripProv = t => t
    .replace(/^(Tỉnh|Tinh)\s+/i, '')
    .replace(/^(Thành phố|Thanh pho|TP)\s+/i, '');
const stripDist = t => t
    .replace(/^(Quận|Quan|Huyện|Huyen|Thị xã|Thi xa|TP|TX)\s+/i, '');
const stripWard = t => t
    .replace(/^(Phường|Phuong|Xã|Xa|Thị trấn|Thi tran)\s+/i, '');

// Đảm bảo hàm norm luôn nhận và trả về chuỗi. Vẫn cần để chuẩn hóa tên trước khi query
// mặc dù không dùng cột normalizedName, nhưng có thể cần để khớp tên chính xác hơn.
const norm = t => deAccent(stripDist(stripProv(stripWard(String(t || '')))))
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();


/* ------------------------------------------------------------------ *
 * 1️⃣ Helpers: tra & cache ProvinceID / DistrictID / WardCode TỪ LOCAL DB
 * ------------------------------------------------------------------ */

/**
 * Tra cứu GHN ProvinceID, DistrictID, WardCode từ database cục bộ.
 * Ưu tiên tra cứu theo ID nội bộ (nếu là số), sau đó theo tên gốc.
 *
 * @param {object} params
 * @param {number|string} params.province – ID hoặc tên tỉnh nội bộ
 * @param {number|string} params.district – ID hoặc tên huyện nội bộ
 * @param {number|string} params.ward – ID hoặc tên xã nội bộ (có thể null)
 * @returns {Promise<{ ghnProvId: number|null, ghnDistId: number|null, ghnWardCode: string|null }>}
 */
async function getGhnCodesFromLocalDb({ province, district, ward }) {
    if (!dbConnection) {
        console.error('GHN Service: DB chưa kết nối hoặc kết nối lỗi.');
        throw new Error('GHN Service: DB chưa kết nối hoặc kết nối lỗi.');
    }

    // Lấy providerId của GHN. Có thể cần query từ bảng ShippingProvider để lấy ID của 'ghn' nếu không cố định.
    const GHN_PROVIDER_ID = 1; // ⭐ QUAN TRỌNG: Đảm bảo ID này đúng với bảng `shipping_providers` cho GHN

    let localProvId = null;
    let localDistId = null;

    let ghnProvId = null;
    let ghnDistId = null;
    let ghnWardCode = null;

    // --- Tra cứu Province (Lấy ID tỉnh nội bộ và ID GHN) ---
    let provRes;
    const initialProvinceName = String(province || '');
    if (typeof province === 'number') { // Nếu truyền ID tỉnh nội bộ
        [provRes] = await dbConnection.query(
            `SELECT pp.providerProvinceCode, pp.provinceId FROM providerprovinces pp WHERE pp.providerId = ? AND pp.provinceId = ?`,
            [GHN_PROVIDER_ID, province]
        );
    } else { // Nếu truyền tên tỉnh nội bộ (string) - CHỈ DÙNG TÊN GỐC
        [provRes] = await dbConnection.query(
            `SELECT pp.providerProvinceCode, pp.provinceId FROM providerprovinces pp JOIN provinces p ON pp.provinceId = p.id WHERE pp.providerId = ? AND p.name = ?`,
            [GHN_PROVIDER_ID, initialProvinceName]
        );
        // KHÔNG SỬ DỤNG normalizedName Ở ĐÂY
    }
    if (provRes && provRes.length > 0) {
        ghnProvId = provRes[0].providerProvinceCode;
        localProvId = provRes[0].provinceId;
    } else {
        console.error(`GHN: Không tìm thấy mã tỉnh cho '${initialProvinceName}' (hoặc ID: ${province}) trong DB.`);
        throw new Error(`GHN: Không tìm thấy mã tỉnh cho '${initialProvinceName}' trong DB.`);
    }

    // --- Tra cứu District (Lấy ID huyện nội bộ và ID GHN) ---
    let distRes;
    const initialDistrictName = String(district || '');
    if (typeof district === 'number') { // Nếu truyền ID huyện nội bộ
        [distRes] = await dbConnection.query(
            `SELECT pd.providerDistrictCode, pd.districtId FROM providerdistricts pd WHERE pd.providerId = ? AND pd.districtId = ? AND pd.provinceId = ?`,
            [GHN_PROVIDER_ID, district, localProvId]
        );
    } else { // Nếu truyền tên huyện nội bộ (string) - CHỈ DÙNG TÊN GỐC
        [distRes] = await dbConnection.query(
            `SELECT pd.providerDistrictCode, pd.districtId FROM providerdistricts pd JOIN districts d ON pd.districtId = d.id WHERE pd.providerId = ? AND d.name = ? AND pd.provinceId = ?`,
            [GHN_PROVIDER_ID, initialDistrictName, localProvId]
        );
        // KHÔNG SỬ DỤNG normalizedName Ở ĐÂY
    }
    if (distRes && distRes.length > 0) {
        ghnDistId = distRes[0].providerDistrictCode;
        localDistId = distRes[0].districtId;
    } else {
        console.error(`GHN: Không tìm thấy mã huyện cho '${initialDistrictName}' (tỉnh ${initialProvinceName}) trong DB.`);
        throw new Error(`GHN: Không tìm thấy mã huyện cho '${initialDistrictName}' (tỉnh ${initialProvinceName}) trong DB.`);
    }

    // --- Tra cứu Ward (Lấy mã xã GHN - có thể null) ---
    if (ward) { // Chỉ tra cứu nếu có truyền ward
        let wardRes;
        const initialWardName = String(ward || '');
        if (typeof ward === 'number') { // Nếu truyền ID xã nội bộ
            [wardRes] = await dbConnection.query(
                `SELECT pw.providerWardCode FROM providerwards pw WHERE pw.providerId = ? AND pw.wardId = ? AND pw.districtId = ?`,
                [GHN_PROVIDER_ID, ward, localDistId]
            );
        } else { // Nếu truyền tên xã nội bộ (string) - CHỈ DÙNG TÊN GỐC
            [wardRes] = await dbConnection.query(
                `SELECT pw.providerWardCode FROM providerwards pw JOIN wards w ON pw.wardId = w.id WHERE pw.providerId = ? AND w.name = ? AND pw.districtId = ?`,
                [GHN_PROVIDER_ID, initialWardName, localDistId]
            );
            // KHÔNG SỬ DỤNG normalizedName Ở ĐÂY
        }
        if (wardRes && wardRes.length > 0) {
            ghnWardCode = wardRes[0].providerWardCode;
        } else {
            console.warn(`GHN: Không tìm thấy mã xã cho '${initialWardName}' (huyện ${initialDistrictName}, tỉnh ${initialProvinceName}) trong DB. Có thể ảnh hưởng đến phí.`);
        }
    }

    console.log(`[GHN DB Mapping] Mapped codes: GHN Prov ID: ${ghnProvId}, GHN Dist ID: ${ghnDistId}, GHN Ward Code: ${ghnWardCode || 'N/A'}`);
    return { ghnProvId, ghnDistId, ghnWardCode };
}


/* ------------------------------------------------------------------ *
 * 2️⃣ Service mặc định – lấy service_id (Cho tuyến FROM_SHOP -> TO_CUSTOMER)
 * ------------------------------------------------------------------ */
async function getDefaultService({ toProvince, toDistrict }) {
    // Lấy GHN IDs từ DB cục bộ
    const { ghnProvId: pid, ghnDistId: did } = await getGhnCodesFromLocalDb({
        province: toProvince,
        district: toDistrict,
        ward: null // Không cần ward cho getDefaultService
    });

    if (!pid || !did) {
        console.error(`[GHN getDefaultService] Lỗi: Không tìm thấy mã tỉnh/huyện GHN từ DB cho địa chỉ nhận. Tỉnh nhận: ${toProvince}, Huyện nhận: ${toDistrict}`);
        throw new Error('GHN: Không tìm thấy mã tỉnh/huyện từ DB cho địa chỉ nhận.');
    }

    try {
        const payload = {
            shop_id: Number(GHN_SHOP_ID),
            from_district: Number(SHOP_DISTRICT_CODE), // Lấy SHOP_DISTRICT_CODE từ .env
            to_district: Number(did),
        };
        console.log('[GHN getDefaultService] Request Payload:', JSON.stringify(payload, null, 2));

        const { data } = await axios.post(
            'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services',
            payload,
            { headers, timeout: 5000 }
        );
        console.log('[GHN getDefaultService] Response Data:', JSON.stringify(data, null, 2));

        if (!data?.data?.length) {
            console.error('[GHN getDefaultService] Phản hồi API không chứa dịch vụ nào:', JSON.stringify(data, null, 2));
            throw new Error('GHN: Không tìm thấy dịch vụ khả dụng.');
        }

        return data?.data?.[0]?.service_id || null;
    } catch (error) {
        console.error('[GHN getDefaultService API error]', error?.response?.data || error.message);
        throw new Error(`GHN: Lỗi khi lấy dịch vụ mặc định: ${error?.response?.data?.message || error.message}`);
    }
}

/* ------------------------------------------------------------------ *
 * 3️⃣ Fee & Lead-time (Cho tuyến FROM_SHOP -> TO_CUSTOMER)
 * ------------------------------------------------------------------ */
async function getFee({
    toProvince, toDistrict, toWard,
    weight, length, width, height,
    serviceCode, // = service_id
      orderValue = 0, // ✅ thêm dòng này để fix lỗi
}) {
    const { ghnProvId: pid, ghnDistId: did, ghnWardCode: wcd } = await getGhnCodesFromLocalDb({
        province: toProvince,
        district: toDistrict,
        ward: toWard
    });

    if (!pid || !did) {
        console.error(`[GHN getFee] Lỗi: Không tìm thấy mã tỉnh/huyện GHN từ DB cho địa chỉ nhận. Tỉnh nhận: ${toProvince}, Huyện nhận: ${toDistrict}`);
        throw new Error('GHN: Không tìm thấy mã tỉnh/huyện từ DB cho địa chỉ nhận.');
    }

    // 🔹 B1: Lấy service_type_id
    let service_type_id = null;
    try {
        const { data: svcRes } = await axios.post(
            'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services',
            {
                shop_id: Number(GHN_SHOP_ID),
                from_district: Number(SHOP_DISTRICT_CODE),
                to_district: Number(did),
            },
            { headers, timeout: 5000 }
        );

        if (!svcRes?.data?.length) {
            console.error('[GHN getFee] Không tìm thấy dịch vụ GHN khả dụng khi lấy service_type_id.');
            throw new Error('GHN: Không tìm thấy dịch vụ nào.');
        }

       const serviceMatch = svcRes.data.find(s => s.service_id === Number(serviceCode));
let actualServiceId;
if (serviceMatch) {
    service_type_id = serviceMatch.service_type_id;
    actualServiceId = serviceMatch.service_id;
} else {
    // fallback nếu không có serviceCode phù hợp
    service_type_id = svcRes.data[0].service_type_id;
    actualServiceId = svcRes.data[0].service_id;
}
console.log(`[GHN getFee] Selected service_type_id: ${service_type_id}, actualServiceId: ${actualServiceId}`);


        console.log(`[GHN getFee] Selected service_type_id: ${service_type_id} (từ service_id: ${serviceCode})`);
    } catch (e) {
        console.error('[GHN getFee] Lỗi khi lấy service_type_id:', e?.response?.data || e.message);
        throw new Error(`GHN: Lỗi khi lấy service_type_id: ${e?.response?.data?.message || e.message}`);
    }

    // 🔹 B2: Gọi /fee
    let fee = 0;
    let feeData;
    try {
        const feePayload = {
            from_district_id: Number(SHOP_DISTRICT_CODE),
            service_type_id: Number(service_type_id),
            to_district_id: Number(did),
            to_ward_code: wcd,
            weight, length, width, height,
            insurance_value: 0,
            coupon: null,
        };

        const response = await axios.post(
            'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee',
            feePayload,
            { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 }
        );

        feeData = response.data;
        console.log('[GHN getFee] Fee Calculation Response Data:', JSON.stringify(feeData, null, 2));

        if (feeData?.code !== 200) {
            throw new Error(`GHN: API tính phí trả về lỗi: ${feeData?.message || 'Không rõ'}`);
        }

        fee = feeData?.data?.total || 0;
        if (fee === 0) {
            console.warn(`[GHN getFee] Phí = 0 – địa chỉ hoặc kích thước có thể không hợp lệ.`);
        }
    } catch (e) {
        console.error('[GHN getFee] Lỗi khi gọi API tính phí:', e?.response?.data || e.message);
        throw new Error(`GHN: Lỗi khi tính phí: ${e?.response?.data?.message || e.message}`);
    }

    // 🔹 B3: Ước lượng thời gian giao (leadTime)
    let leadTime = null;

try {
    const now = Math.floor(Date.now() / 1000);

    // Nếu GHN trả expected_delivery_time → dùng
 const expectedTime = Number(feeData?.data?.expected_delivery_time || 0);

    if (expectedTime && expectedTime > 0) {
        const diffSec = expectedTime - now;
        if (diffSec > 0) {
            leadTime = Math.max(1, Math.ceil(diffSec / 86400));
            console.log(`[GHN getFee] leadTime từ expected_delivery_time: ${leadTime} ngày`);
        }
    }
} catch (e) {
    console.warn('[GHN getFee] Lỗi xử lý expected_delivery_time:', e.message);
}

if (!leadTime) {
    // ❌ GHN đéo trả → giả lập leadtime = +3 ngày từ thời điểm hiện tại
    const fallbackDays = 3;
    leadTime = fallbackDays;
    console.warn(`[GHN getFee] GHN không trả thời gian giao hàng. Gán cứng leadTime = ${fallbackDays} ngày.`);
}


    // Nếu không có expected_delivery_time, gọi thêm API /leadtime
    if (!leadTime) {
        try {
            const leadtimePayload = {
                from_district_id: Number(SHOP_DISTRICT_CODE),
                from_ward_code: SHOP_WARD_CODE,
                to_district_id: Number(did),
                to_ward_code: wcd,
           service_id: Number(actualServiceId),

            };

            const { data: ltData } = await axios.post(
                'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/leadtime',
                leadtimePayload,
                { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 5000 }
            );

            const seconds = Number(ltData?.data?.leadtime || 0);
            if (seconds > 0) {
                leadTime = Math.max(1, Math.ceil(seconds / 86400));
                console.log(`[GHN getFee] leadTime từ /leadtime: ${leadTime} ngày`);
            } else {
                console.warn('[GHN getFee] leadtime = 0 hoặc không có – fallback.');
            }
        } catch (e) {
            console.warn('[GHN getFee] Lỗi khi gọi /leadtime:', e?.response?.data || e.message);
        }
    }

    // Fallback cuối cùng
  if (!leadTime) {
    try {
        console.log('[GHN getFee] using SHOP_WARD_CODE:', SHOP_WARD_CODE);
        if (!SHOP_WARD_CODE) throw new Error('SHOP_WARD_CODE không tồn tại');

        if (!wcd) throw new Error('to_ward_code (wcd) null → GHN không trả leadtime');

        const { data: ltData } = await axios.post(
            'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/leadtime',
            {
                from_district_id: Number(SHOP_DISTRICT_CODE),
                from_ward_code: SHOP_WARD_CODE,
                to_district_id: Number(did),
                to_ward_code: wcd,
               service_id: Number(actualServiceId),

            },
            { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 5000 }
        );

        const seconds = Number(ltData?.data?.leadtime || 0);
        if (seconds > 0) {
            leadTime = Math.max(1, Math.ceil(seconds / 86400));
            console.log(`[GHN getFee] leadTime từ /leadtime: ${leadTime} ngày`);
        } else {
            console.warn('[GHN getFee] /leadtime trả về 0 – fallback.');
        }
    } catch (e) {
        console.warn('[GHN getFee] Lỗi khi gọi /leadtime:', e?.response?.data || e.message);
    }
}


    return { fee, leadTime };
}



/* ------------------------------------------------------------------ *
 * 4️⃣ Book Pickup (Tạo vận đơn lấy hàng)
 * ------------------------------------------------------------------ */
async function bookPickup(payload) {
    const {
        from_name, from_phone, from_address, from_ward_id, from_district_id, from_province_id, // Nhận ID nội bộ của địa chỉ khách
        to_name, to_phone, to_address, to_ward_code, to_district_id, to_province_id, // Nhận mã GHN của shop (hoặc sẽ map)
        weight, length, width, height,
        client_order_code, content,
    } = payload;

    // Lấy mã GHN của địa chỉ lấy hàng (của khách) từ ID nội bộ
    const { ghnDistrictId: fromDistrictGhnCode, ghnWardCode: fromWardGhnCode } = await getGhnCodesFromLocalDb({
        province: from_province_id,
        district: from_district_id,
        ward: from_ward_id,
    });

    if (isNaN(fromDistrictGhnCode) || !fromWardGhnCode) { // Mã huyện phải là số, mã phường/xã không undefined
        throw new Error(`GHN: Không tìm thấy mã huyện hoặc phường/xã GHN hợp lệ cho địa chỉ lấy hàng: Huyện ID ${from_district_id}, Xã ID ${from_ward_id}.`);
    }

    // Lấy service_type_id cho tuyến lấy hàng (từ khách về shop)
    let serviceTypeId;
    try {
        // GHN's getDefaultService expects toDistrict/toProvince as the destination of the service
        // For pickup, the "from" address is the customer's.
        // The service is from the customer's district to the shop's district.
        serviceTypeId = await getDefaultService({
            toProvince: from_province_id, // Truyền ID nội bộ của tỉnh khách hàng để getDefaultService map ra mã GHN
            toDistrict: from_district_id, // Truyền ID nội bộ của huyện khách hàng để getDefaultService map ra mã GHN
        });
        if (!serviceTypeId) {
            throw new Error("Không có dịch vụ GHN khả dụng cho tuyến lấy hàng này.");
        }
    } catch (err) {
        console.error("GHN bookPickup: Lỗi khi lấy serviceTypeId:", err.message);
        throw new Error(`GHN: Lỗi khi xác định dịch vụ lấy hàng: ${err.message}`);
    }

    try {
        const createOrderPayload = {
            service_type_id: serviceTypeId,
            required_note: 'KHONGCHOXEMHANG', // Yêu cầu không cho xem hàng
            payment_type_id: 1, // 1 = Shop trả phí

            // Địa chỉ lấy hàng (từ địa chỉ khách hàng)
            from_name: from_name,
            from_phone: from_phone,
            from_address: from_address,
            from_ward_code: fromWardGhnCode, // Mã phường/xã GHN của khách hàng
            from_district_id: fromDistrictGhnCode, // Mã huyện GHN của khách hàng
            // from_province_id: ghnProvId, // GHN create order không yêu cầu from_province_id

            // Địa chỉ trả về (kho của shop)
            to_name: to_name,
            to_phone: to_phone,
            to_address: to_address,
            to_ward_code: to_ward_code, // Mã phường/xã GHN của shop (từ .env)
            to_district_id: Number(to_district_id), // Mã huyện GHN của shop (từ .env)
            // to_province_id: Number(to_province_id), // GHN create order không yêu cầu to_province_id

            weight,
            length: Math.max(1, length), // Đảm bảo min là 1
            width: Math.max(1, width),   // Đảm bảo min là 1
            height: Math.max(1, height), // Đảm bảo min là 1

            cod_amount: 0, // Đơn trả hàng thường không có COD
            client_order_code: client_order_code,
            content: content,
            // Các trường khác như insurance_value, items nếu cần
        };
        console.log('[GHN bookPickup] Create Order Request Payload:', JSON.stringify(createOrderPayload, null, 2));


        const { data: responseData } = await axios.post(
            'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create',
            createOrderPayload,
            {
                headers: {
                    'Content-Type': 'application/json',
                    Token: GHN_TOKEN,
                    ShopId: GHN_SHOP_ID,
                },
                timeout: 10000 // Tăng timeout cho API tạo đơn hàng
            }
        );
        console.log('[GHN bookPickup] Create Order Response Data:', JSON.stringify(responseData, null, 2));


        if (responseData?.code !== 200 || !responseData.data?.order_code) {
            console.error(`[GHN bookPickup] API tạo vận đơn trả về lỗi: Code ${responseData?.code}, Message: ${responseData?.message}`);
            throw new Error(`GHN: Lỗi từ API tạo vận đơn: ${responseData?.message || 'Không rõ'}`);
        }

        const { order_code, label } = responseData.data;
        return { trackingCode: order_code, labelUrl: label };

    } catch (error) {
        console.error("GHN bookPickup Error:", error?.response?.data || error.message);
        throw new Error("GHN: Lỗi khi tạo đơn lấy hàng. " + (error?.response?.data?.message || error.message));
    }
}


// Export các hàm/class cần thiết
module.exports = {
    getDefaultService,
    getFee,
    bookPickup, // ⭐ Đảm bảo hàm này được export
};