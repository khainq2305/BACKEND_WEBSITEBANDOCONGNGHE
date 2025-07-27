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
async function getGhnCodesFromLocalDb({ province = null, district, ward }) {
  if (!dbConnection) throw new Error('GHN Service: DB chưa kết nối.');

  const GHN_PROVIDER_ID = 1;

  let localProvId = null;
  let localDistId = null;

  let ghnProvId = null;
  let ghnDistId = null;
  let ghnWardCode = null;

  // ───────────── HUYỆN ─────────────
  const isDistrictId = typeof district === 'number';
  const [distRes] = isDistrictId
    ? await dbConnection.query(
        `SELECT pd.providerDistrictCode, pd.districtId, pd.provinceId 
         FROM providerdistricts pd 
         WHERE pd.providerId = ? AND pd.districtId = ? LIMIT 1`,
        [GHN_PROVIDER_ID, district]
      )
    : await dbConnection.query(
        `SELECT pd.providerDistrictCode, pd.districtId, pd.provinceId 
         FROM providerdistricts pd 
         JOIN districts d ON pd.districtId = d.id 
         WHERE pd.providerId = ? AND d.name = ? LIMIT 1`,
        [GHN_PROVIDER_ID, district]
      );

  if (!distRes?.length) throw new Error(`GHN: Không tìm thấy mã huyện cho '${district}'`);

  ghnDistId = distRes[0].providerDistrictCode;
  localDistId = distRes[0].districtId;
  localProvId = distRes[0].provinceId;

  // ───────────── TỈNH ─────────────
  const [provRes] = await dbConnection.query(
    `SELECT pp.providerProvinceCode 
     FROM providerprovinces pp 
     WHERE pp.providerId = ? AND pp.provinceId = ? LIMIT 1`,
    [GHN_PROVIDER_ID, localProvId]
  );

  if (!provRes?.length) throw new Error(`GHN: Không tìm thấy mã tỉnh từ huyện ${district}`);
  ghnProvId = provRes[0].providerProvinceCode;

  // ───────────── XÃ ─────────────
  if (ward) {
    const isWardId = typeof ward === 'number';
    const [wardRes] = isWardId
      ? await dbConnection.query(
          `SELECT pw.providerWardCode 
           FROM providerwards pw 
           WHERE pw.providerId = ? AND pw.wardId = ? AND pw.districtId = ? LIMIT 1`,
          [GHN_PROVIDER_ID, ward, localDistId]
        )
      : await dbConnection.query(
          `SELECT pw.providerWardCode 
           FROM providerwards pw 
           JOIN wards w ON pw.wardId = w.id 
           WHERE pw.providerId = ? AND w.name = ? AND pw.districtId = ? LIMIT 1`,
          [GHN_PROVIDER_ID, ward, localDistId]
        );

    if (wardRes?.length) ghnWardCode = wardRes[0].providerWardCode;
  }

  return {
    ghnProvId,
    ghnDistId,
    ghnWardCode,
  };
}



/* ------------------------------------------------------------------ *
 * 2️⃣ Service mặc định – lấy service_id (Cho tuyến FROM_SHOP -> TO_CUSTOMER)
 * ------------------------------------------------------------------ */
async function getDefaultService({ toDistrict }) {
    if (!toDistrict) {
        console.error('GHN: Thiếu toDistrict khi gọi getDefaultService.');
        throw new Error('GHN: Thiếu mã huyện nhận để tra service');
    }

    try {
        const payload = {
            shop_id: Number(GHN_SHOP_ID),
            from_district: Number(SHOP_DISTRICT_CODE),  // Mã GHN huyện của shop (kho)
            to_district: Number(toDistrict),            // Mã GHN huyện nhận
        };

        console.log('[GHN getDefaultService] Request Payload:', payload);

        const response = await axios.post(
            'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services',
            payload,
            { headers, timeout: 5000 }
        );

        const data = response?.data;

        console.log('[GHN getDefaultService] Response Data:', data);

        if (!data || !Array.isArray(data.data) || data.data.length === 0) {
            console.error('[GHN getDefaultService] Không có dịch vụ khả dụng từ API.');
            throw new Error('GHN: Không tìm thấy dịch vụ khả dụng.');
        }

        const firstService = data.data[0];
        if (!firstService.service_type_id) {
            console.error('[GHN getDefaultService] Dữ liệu trả về không có service_type_id:', firstService);
            throw new Error('GHN: Phản hồi không hợp lệ – thiếu service_type_id.');
        }

        console.log(`[GHN getDefaultService] service_type_id được chọn: ${firstService.service_type_id}`);
        return firstService.service_type_id;

    } catch (err) {
        const errData = err?.response?.data;
        console.error('[GHN getDefaultService API error]', errData || err.message);
        throw new Error(`GHN: Lỗi khi lấy dịch vụ mặc định: ${errData?.message || err.message}`);
    }
}


/* ------------------------------------------------------------------ *
 * 3️⃣ Fee & Lead-time (Cho tuyến FROM_SHOP -> TO_CUSTOMER)
 * ------------------------------------------------------------------ */
/**
 * Tính phí và thời gian giao hàng (leadTime) GHN
 * @param {Object} params
 * @param {number|string} params.toProvince – ID hoặc tên tỉnh nội bộ
 * @param {number|string} params.toDistrict – ID hoặc tên huyện nội bộ
 * @param {number|string} params.toWard – ID hoặc tên xã nội bộ
 * @param {number} params.weight – trọng lượng (gram)
 * @param {number} params.length – chiều dài (cm)
 * @param {number} params.width – chiều rộng (cm)
 * @param {number} params.height – chiều cao (cm)
 * @param {number} params.serviceCode – GHN service_id (tùy chọn)
 * @param {number} params.orderValue – giá trị đơn hàng để bảo hiểm (tùy chọn)
 * @returns {Promise<{ fee: number, leadTime: number }>}
 */
async function getFee({
  toProvince, toDistrict, toWard,
  weight, length, width, height,
  serviceCode,
  orderValue = 0,
}) {
  const { ghnProvId: pid, ghnDistId: did, ghnWardCode: wcd } = await getGhnCodesFromLocalDb({
    province: toProvince,
    district: toDistrict,
    ward: toWard,
  });

  if (!pid || !did) {
    console.error(`[GHN getFee] Không tìm thấy mã tỉnh/huyện GHN. Province: ${toProvince}, District: ${toDistrict}`);
    throw new Error('GHN: Không tìm thấy mã tỉnh/huyện GHN.');
  }

  let service_type_id = null;
  let actualServiceId = null;

  // 🔹 B1: Lấy service_type_id tương ứng
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

    if (!svcRes?.data?.length) throw new Error('Không có dịch vụ khả dụng.');

    const matched = svcRes.data.find(s => s.service_id === Number(serviceCode));
    const svc = matched || svcRes.data[0];
    service_type_id = svc.service_type_id;
    actualServiceId = svc.service_id;

    console.log(`[GHN getFee] Chọn service_type_id: ${service_type_id}, service_id: ${actualServiceId}`);
  } catch (err) {
    console.error('[GHN getFee] Lỗi lấy service_type_id:', err?.response?.data || err.message);
    throw new Error(`GHN: Lỗi khi lấy service_type_id: ${err?.response?.data?.message || err.message}`);
  }

  // 🔹 B2: Gọi API tính phí
  let fee = 0;
  let feeData;
  try {
    const feePayload = {
      from_district_id: Number(SHOP_DISTRICT_CODE),
      service_type_id: Number(service_type_id),
      to_district_id: Number(did),
      to_ward_code: wcd,
      weight, length, width, height,
      insurance_value: Number(orderValue || 0),
      coupon: null,
    };

    const response = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee',
      feePayload,
      { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 }
    );

    feeData = response.data;

    if (feeData?.code !== 200) throw new Error(feeData?.message || 'Lỗi không rõ khi tính phí.');

    fee = feeData?.data?.total || 0;
    if (fee === 0) console.warn('[GHN getFee] Phí = 0 – kiểm tra địa chỉ/kích thước.');
  } catch (err) {
    console.error('[GHN getFee] Lỗi API /fee:', err?.response?.data || err.message);
    throw new Error(`GHN: Lỗi khi tính phí: ${err?.response?.data?.message || err.message}`);
  }

  // 🔹 B3: Ước lượng leadTime
  let leadTime = null;
  try {
    const now = Math.floor(Date.now() / 1000);
    const expectedTime = Number(feeData?.data?.expected_delivery_time || 0);

    if (expectedTime > now) {
      const diff = expectedTime - now;
      leadTime = Math.max(1, Math.ceil(diff / 86400));
      console.log(`[GHN getFee] leadTime từ expected_delivery_time: ${leadTime} ngày`);
    }
  } catch (e) {
    console.warn('[GHN getFee] Lỗi xử lý expected_delivery_time:', e.message);
  }

  // 🔹 Fallback: gọi /leadtime nếu chưa có
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
      }
    } catch (e) {
      console.warn('[GHN getFee] Lỗi khi gọi /leadtime:', e?.response?.data || e.message);
    }
  }

  // 🔹 Fallback cuối cùng nếu tất cả đều fail
  if (!leadTime) {
    const fallback = 3;
    leadTime = fallback;
    console.warn(`[GHN getFee] Fallback leadTime: ${fallback} ngày`);
  }

  return { fee, leadTime };
}




/* ------------------------------------------------------------------ *
 * 4️⃣ Book Pickup (Tạo vận đơn lấy hàng)
 * ------------------------------------------------------------------ */
async function bookPickup(payload) {
  const {
    from_name,
    from_phone,
    from_address,
    from_ward_code,       // ✅ mapping sẵn, không còn từ ID nữa
    from_district_id,     // ✅ mapping sẵn, là GHN District ID
    to_name,
    to_phone,
    to_address,
    to_ward_code,
    to_district_id,
    weight,
    length,
    width,
    height,
    client_order_code,
    content,
  } = payload;

  // 🔄 Lấy service_type_id cho tuyến vận chuyển (KH đến SHOP)
  let serviceTypeId;
  try {
    serviceTypeId = await getDefaultService({
      toProvince: null, // ✅ Không cần nếu chỉ dùng district
      toDistrict: from_district_id, // GHN district code đã mapping
    });

    if (!serviceTypeId) {
      throw new Error("Không có dịch vụ GHN khả dụng cho tuyến lấy hàng này.");
    }
  } catch (err) {
    console.error("GHN bookPickup: Lỗi khi lấy serviceTypeId:", err.message);
    throw new Error(`GHN: Lỗi khi xác định dịch vụ lấy hàng: ${err.message}`);
  }

  // 🚀 Tạo payload tạo đơn hàng
  const createOrderPayload = {
    service_type_id: serviceTypeId,
    required_note: 'KHONGCHOXEMHANG',
    payment_type_id: 1,

    from_name,
    from_phone,
    from_address,
    from_ward_code,         // ✅ GHN mã xã
    from_district_id,       // ✅ GHN mã huyện

    to_name,
    to_phone,
    to_address,
    to_ward_code,
    to_district_id: Number(to_district_id),

    weight,
    length: Math.max(1, length),
    width: Math.max(1, width),
    height: Math.max(1, height),

    cod_amount: 0,
    client_order_code,
    content,
  };

  console.log('[GHN bookPickup] Create Order Request Payload:', JSON.stringify(createOrderPayload, null, 2));

  try {
    const { data: responseData } = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create',
      createOrderPayload,
      {
        headers: {
          'Content-Type': 'application/json',
          Token: GHN_TOKEN,
          ShopId: GHN_SHOP_ID,
        },
        timeout: 10000,
      }
    );

    console.log('[GHN bookPickup] Create Order Response Data:', JSON.stringify(responseData, null, 2));

    if (responseData?.code !== 200 || !responseData.data?.order_code) {
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
    getGhnCodesFromLocalDb,
    bookPickup, // ⭐ Đảm bảo hàm này được export
};