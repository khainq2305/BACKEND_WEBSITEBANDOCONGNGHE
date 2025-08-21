// drivers/ghnService.js
const axios = require('axios');
const mysql = require('mysql2/promise');

const {
  GHN_TOKEN,
  GHN_SHOP_ID,
  SHOP_DISTRICT_CODE,
  SHOP_WARD_CODE,
} = process.env;

const headers = { Token: GHN_TOKEN, 'Content-Type': 'application/json' };

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
    // console.log('[GHN Service] Đã kết nối DB thành công.');
  } catch (error) {
    console.error('[GHN Service] Lỗi kết nối DB:', error.message);
  }
})();

// Helper chuẩn hóa tên địa chỉ (không dùng cho các query bằng ID)
const deAccent = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const stripProv = t => t.replace(/^(Tỉnh|Tinh|Thành phố|Thanh pho|TP)\s+/i, '');
const stripDist = t => t.replace(/^(Quận|Quan|Huyện|Huyen|Thị xã|Thi xa|TP|TX)\s+/i, '');
const stripWard = t => t.replace(/^(Phường|Phuong|Xã|Xa|Thị trấn|Thi tran)\s+/i, '');
const norm = t => deAccent(stripDist(stripProv(stripWard(String(t || '')))))
  .replace(/[^\w\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

// --- Tra cứu mã địa chỉ từ LOCAL DB ---
async function getGhnCodesFromLocalDb({ province, district, ward }) {
  if (!dbConnection) throw new Error('GHN Service: DB chưa kết nối.');
  const GHN_PROVIDER_ID = 1;
  
  let localDistId;
  let localProvId;

  // Tra cứu huyện trước (ưu tiên tra cứu bằng ID nội bộ)
  const isDistrictId = typeof district === 'number';
  let distRes;
  if (isDistrictId) {
    [distRes] = await dbConnection.query(
      `SELECT pd.providerDistrictCode, pd.districtId, pd.provinceId 
       FROM providerdistricts pd WHERE pd.providerId = ? AND pd.districtId = ? LIMIT 1`,
      [GHN_PROVIDER_ID, district]
    );
  } else {
    // Fallback tìm bằng tên (có thể cần thêm logic tìm kiếm fuzzy hơn)
    [distRes] = await dbConnection.query(
      `SELECT pd.providerDistrictCode, pd.districtId, pd.provinceId 
       FROM providerdistricts pd JOIN districts d ON pd.districtId = d.id 
       WHERE pd.providerId = ? AND d.name = ? LIMIT 1`,
      [GHN_PROVIDER_ID, district]
    );
  }

  if (!distRes || distRes.length === 0) {
    throw new Error(`GHN: Không tìm thấy mã huyện cho '${district}' trong DB nội bộ.`);
  }

  const ghnDistId = distRes[0].providerDistrictCode;
  localDistId = distRes[0].districtId;
  localProvId = distRes[0].provinceId;

  // Lấy mã tỉnh GHN từ ID tỉnh nội bộ
  const [provRes] = await dbConnection.query(
    `SELECT pp.providerProvinceCode FROM providerprovinces pp 
     WHERE pp.providerId = ? AND pp.provinceId = ? LIMIT 1`,
    [GHN_PROVIDER_ID, localProvId]
  );

  if (!provRes || provRes.length === 0) {
    throw new Error(`GHN: Không tìm thấy mã tỉnh cho ID nội bộ ${localProvId} trong DB.`);
  }
  const ghnProvId = provRes[0].providerProvinceCode;

  // Lấy mã xã GHN (nếu có)
  let ghnWardCode = null;
  if (ward) {
    const isWardId = typeof ward === 'number';
    let wardRes;
    if (isWardId) {
      [wardRes] = await dbConnection.query(
        `SELECT pw.providerWardCode FROM providerwards pw 
         WHERE pw.providerId = ? AND pw.wardId = ? AND pw.districtId = ? LIMIT 1`,
        [GHN_PROVIDER_ID, ward, localDistId]
      );
    } else {
      [wardRes] = await dbConnection.query(
        `SELECT pw.providerWardCode FROM providerwards pw 
         JOIN wards w ON pw.wardId = w.id WHERE pw.providerId = ? AND w.name = ? AND pw.districtId = ? LIMIT 1`,
        [GHN_PROVIDER_ID, ward, localDistId]
      );
    }
    if (wardRes && wardRes.length > 0) {
      ghnWardCode = wardRes[0].providerWardCode;
    } else {
      console.warn(`GHN: Không tìm thấy mã xã cho '${ward}' thuộc huyện '${localDistId}'.`);
    }
  }

  return { ghnProvId, ghnDistId, ghnWardCode };
}

// --- Tính phí và thời gian giao hàng (Chiều xuôi: Shop -> Khách) ---
async function getFee({
  toProvince, toDistrict, toWard,
  weight, length, width, height,
  serviceCode,
  orderValue = 0,
}) {
  // 💥 Bước quan trọng: Lấy mã GHN từ ID nội bộ ngay tại đây
  const { ghnProvId: pid, ghnDistId: did, ghnWardCode: wcd } = await getGhnCodesFromLocalDb({
    province: toProvince,
    district: toDistrict,
    ward: toWard,
  });

  if (!did) {
    throw new Error('GHN: Không tìm thấy mã huyện GHN để tính phí.');
  }

  // B1: Lấy service_type_id
  let service_type_id = null;
  let actualServiceId = null;
  try {
    const svcPayload = {
      shop_id: Number(GHN_SHOP_ID),
      from_district: Number(SHOP_DISTRICT_CODE),
      to_district: Number(did),
    };
    const { data: svcRes } = await axios.post('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services', svcPayload, { headers, timeout: 5000 });
    if (!svcRes?.data?.length) throw new Error('Không có dịch vụ khả dụng.');
    const matched = svcRes.data.find(s => s.service_id === Number(serviceCode));
    const svc = matched || svcRes.data[0];
    service_type_id = svc.service_type_id;
    actualServiceId = svc.service_id;
  } catch (err) {
    console.error('[GHN getFee] Lỗi khi lấy service_type_id:', err?.response?.data || err.message);
    throw new Error(`GHN: Lỗi khi lấy service_type_id: ${err?.response?.data?.message || err.message}`);
  }

  // B2: Gọi API /fee
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
    const response = await axios.post('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee', feePayload, { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 });
    feeData = response.data;
    if (feeData?.code !== 200) throw new Error(feeData?.message || 'Lỗi không rõ khi tính phí.');
    fee = feeData?.data?.total || 0;
    if (fee === 0) console.warn('[GHN getFee] Phí = 0.');
  } catch (err) {
    console.error('[GHN getFee] LỖI API /fee:', err?.response?.data || err.message);
    throw new Error(`GHN: Lỗi khi tính phí: ${err?.response?.data?.message || err.message}`);
  }

  // B3: Ước lượng thời gian giao (leadTime)
  let leadTime = null;
  if (feeData?.data?.expected_delivery_time) {
    try {
      const diff = Number(feeData.data.expected_delivery_time) - Math.floor(Date.now() / 1000);
      if (diff > 0) leadTime = Math.max(1, Math.ceil(diff / 86400));
    } catch (e) {
      console.warn('[GHN getFee] Lỗi xử lý expected_delivery_time:', e.message);
    }
  }
  if (!leadTime) {
    const fallback = 3;
    leadTime = fallback;
    console.warn(`[GHN getFee] Fallback leadTime: ${fallback} ngày`);
  }

  return { fee, leadTime };
}

// --- Lấy service mặc định (dùng trong bookPickup) ---
async function getDefaultService({ toProvince, toDistrict }) {
  // 💥 Lấy mã GHN từ ID nội bộ ngay tại đây
  const { ghnProvId: pid, ghnDistId: did } = await getGhnCodesFromLocalDb({
    province: toProvince,
    district: toDistrict,
    ward: null,
  });

  if (!pid || !did) {
    throw new Error('GHN: Không tìm thấy mã tỉnh/huyện GHN từ DB nội bộ.');
  }

  try {
    const payload = {
      shop_id: Number(GHN_SHOP_ID),
      from_district: Number(SHOP_DISTRICT_CODE),
      to_district: Number(did),
    };
    const response = await axios.post('https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services', payload, { headers, timeout: 5000 });
    if (!response?.data?.data?.length) {
      throw new Error('GHN: Không tìm thấy dịch vụ khả dụng.');
    }
    return response.data.data[0].service_type_id;
  } catch (err) {
    const errData = err?.response?.data;
    console.error('[GHN getDefaultService] LỖI API:', errData || err.message);
    throw new Error(`GHN: Lỗi khi lấy dịch vụ mặc định: ${errData?.message || err.message}`);
  }
}

// --- Tạo vận đơn lấy hàng (Chiều ngược: Khách -> Shop) ---
async function bookPickup(payload) {
  // 💥 Lấy mã GHN của địa chỉ lấy hàng (của khách) từ ID nội bộ
  const { ghnDistId: fromDistrictGhnCode, ghnWardCode: fromWardGhnCode } = await getGhnCodesFromLocalDb({
    province: payload.from_province_id,
    district: payload.from_district_id,
    ward: payload.from_ward_id,
  });

  if (!fromDistrictGhnCode || !fromWardGhnCode) {
    throw new Error(`GHN: Không tìm thấy mã huyện hoặc phường/xã GHN hợp lệ cho địa chỉ lấy hàng.`);
  }

  // Lấy service_type_id cho tuyến lấy hàng
  let serviceTypeId;
  try {
    serviceTypeId = await getDefaultService({
      toProvince: payload.from_province_id,
      toDistrict: payload.from_district_id,
    });
    if (!serviceTypeId) {
      throw new Error("Không có dịch vụ GHN khả dụng cho tuyến lấy hàng này.");
    }
  } catch (err) {
    console.error("GHN bookPickup: Lỗi khi lấy serviceTypeId:", err.message);
    throw new Error(`GHN: Lỗi khi xác định dịch vụ lấy hàng: ${err.message}`);
  }
  
  // Tạo payload và gọi API tạo đơn
  const createOrderPayload = {
    service_type_id: serviceTypeId,
    required_note: 'KHONGCHOXEMHANG',
    payment_type_id: 1, // 1 = Shop trả phí
    from_name: payload.from_name,
    from_phone: payload.from_phone,
    from_address: payload.from_address,
    from_ward_code: fromWardGhnCode,
    from_district_id: Number(fromDistrictGhnCode),
    to_name: payload.to_name,
    to_phone: payload.to_phone,
    to_address: payload.to_address,
    to_ward_code: payload.to_ward_code,
    to_district_id: Number(payload.to_district_id),
    weight: payload.weight,
    length: Math.max(1, payload.length),
    width: Math.max(1, payload.width),
    height: Math.max(1, payload.height),
    cod_amount: 0,
    client_order_code: payload.client_order_code,
    content: payload.content,
  };

  try {
    const { data: responseData } = await axios.post(
      'https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create',
      createOrderPayload,
      { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 10000 }
    );
    if (responseData?.code !== 200 || !responseData.data?.order_code) {
      throw new Error(`GHN: Lỗi từ API tạo vận đơn: ${responseData?.message || 'Không rõ'}`);
    }
    const { order_code, label } = responseData.data;
    return { trackingCode: order_code, labelUrl: label };
  } catch (error) {
    console.error("GHN bookPickup] LỖI khi tạo đơn hàng:", error?.response?.data || error.message);
    throw new Error("GHN: Lỗi khi tạo đơn lấy hàng. " + (error?.response?.data?.message || error.message));
  }
}

module.exports = {
  getDefaultService,
  getFee,
  getGhnCodesFromLocalDb,
  bookPickup,
};