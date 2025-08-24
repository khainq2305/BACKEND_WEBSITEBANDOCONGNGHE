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
    console.log('[GHN Service] Đã kết nối DB thành công.');
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
  console.log("===== [GHN getFee] DEBUG =====");
  console.log("Input params:", {
    toProvince, toDistrict, toWard,
    weight, length, width, height,
    serviceCode, orderValue
  });

  // 💥 Lấy mã GHN từ DB nội bộ
  const { ghnProvId: pid, ghnDistId: did, ghnWardCode: wcd } =
    await getGhnCodesFromLocalDb({ province: toProvince, district: toDistrict, ward: toWard });

  console.log("[GHN getFee] Mapping local DB:", { pid, did, wcd });

  if (!did) {
    throw new Error("GHN: Không tìm thấy mã huyện GHN để tính phí.");
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
    console.log("[GHN getFee] Payload gọi /available-services:", svcPayload);

    const { data: svcRes } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services",
      svcPayload,
      { headers, timeout: 5000 }
    );

    console.log("[GHN getFee] Response /available-services:", JSON.stringify(svcRes, null, 2));

    if (!svcRes?.data?.length) throw new Error("Không có dịch vụ khả dụng.");
    const matched = svcRes.data.find(s => s.service_id === Number(serviceCode));
    const svc = matched || svcRes.data[0];
    service_type_id = svc.service_type_id;
    actualServiceId = svc.service_id;

    console.log("[GHN getFee] Chọn dịch vụ:", { service_type_id, actualServiceId });
  } catch (err) {
    console.error("[GHN getFee] Lỗi khi lấy service_type_id:", err?.response?.data || err.message);
    throw new Error(`GHN: Lỗi khi lấy service_type_id: ${err?.response?.data?.message || err.message}`);
  }

  // ⚖️ Bổ sung debug trọng lượng
  const volumetricWeight = Math.floor((length * width * height) / 5000);
  const chargeableWeight = Math.max(weight, volumetricWeight);

  console.log("[GHN getFee] Weight thực tế:", weight, "gram");
  console.log("[GHN getFee] Volumetric weight:", volumetricWeight, "gram");
  console.log("[GHN getFee] GHN chargeable weight:", chargeableWeight, "gram");

  // B2: Gọi API /fee
  let fee = 0;
  let feeData;
  try {
    const feePayload = {
      from_district_id: Number(SHOP_DISTRICT_CODE),
      service_type_id: Number(service_type_id),
      to_district_id: Number(did),
      to_ward_code: wcd,
      weight: chargeableWeight, // ⚡ dùng trọng lượng chargeable
      length: Math.max(1, length),
      width: Math.max(1, width),
      height: Math.max(1, height),
      insurance_value: Number(orderValue || 0),
      coupon: null,
    };

    console.log("[GHN getFee] Payload gửi GHN /fee:", feePayload);

    const { data: res } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/fee",
      feePayload,
      { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 }
    );

    feeData = res;
    console.log("[GHN getFee] Response /fee:", JSON.stringify(feeData, null, 2));

    if (feeData?.code !== 200) throw new Error(feeData?.message || "Lỗi không rõ khi tính phí.");
    fee = feeData?.data?.total || 0;
    if (fee === 0) console.warn("[GHN getFee] ⚠️ Phí = 0.");
  } catch (err) {
    console.error("[GHN getFee] LỖI API /fee:", err?.response?.data || err.message);
    throw new Error(`GHN: Lỗi khi tính phí: ${err?.response?.data?.message || err.message}`);
  }

  // B3: Ước lượng thời gian giao
  let leadTime = null;
  if (feeData?.data?.expected_delivery_time) {
    try {
      const etd = new Date(feeData.data.expected_delivery_time).getTime();
      const now = Date.now();
      const diffSec = Math.floor((etd - now) / 1000);
      if (diffSec > 0) leadTime = Math.max(1, Math.ceil(diffSec / 86400));
      console.log("[GHN getFee] leadTime tính được:", leadTime);
    } catch (e) {
      console.warn("[GHN getFee] Lỗi xử lý expected_delivery_time:", e.message);
    }
  }

  if (!leadTime) {
    const fallback = 3;
    leadTime = fallback;
    console.warn(`[GHN getFee] ⚠️ Fallback leadTime: ${fallback} ngày`);
  }

  console.log("===== [GHN getFee] OUTPUT =====", {
    fee, leadTime, service_type_id: actualServiceId
  });

  return { fee, leadTime, service_type_id: actualServiceId };
}

/**
 * Lấy thời gian giao hàng dự kiến GHN (API /leadtime)
 */
async function getLeadTime({ toProvince, toDistrict, toWard, serviceCode }) {
  console.log("===== [GHN getLeadTime] INPUT =====");
  console.log({ toProvince, toDistrict, toWard, serviceCode });

  // Lấy mapping từ DB nội bộ
  const { ghnProvId: pid, ghnDistId: did, ghnWardCode: wcd } =
    await getGhnCodesFromLocalDb({ province: toProvince, district: toDistrict, ward: toWard });

  if (!did || !wcd) {
    throw new Error("GHN: Không tìm thấy mã huyện/xã GHN để lấy leadTime.");
  }

  // B1: Lấy service_id
  let actualServiceId = null;
  try {
    const svcPayload = {
      shop_id: Number(GHN_SHOP_ID),
      from_district: Number(SHOP_DISTRICT_CODE),
      to_district: Number(did),
    };

    const { data: svcRes } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services",
      svcPayload,
      { headers, timeout: 5000 }
    );

    if (!svcRes?.data?.length) throw new Error("Không có dịch vụ khả dụng.");
    const matched = svcRes.data.find((s) => s.service_id === Number(serviceCode));
    actualServiceId = matched ? matched.service_id : svcRes.data[0].service_id;
  } catch (err) {
    console.error("[GHN getLeadTime] Lỗi /available-services:", err?.response?.data || err.message);
    throw new Error(`GHN: Lỗi khi lấy service_id: ${err?.response?.data?.message || err.message}`);
  }

  // B2: Gọi API /leadtime
  let leadTime = null;
  try {
    const payload = {
      shop_id: Number(GHN_SHOP_ID),
      from_district_id: Number(SHOP_DISTRICT_CODE),
      from_ward_code: String(SHOP_WARD_CODE),
      to_district_id: Number(did),
      to_ward_code: String(wcd),
      service_id: Number(actualServiceId),
    };

    console.log("[GHN getLeadTime] payload:", payload);

    const { data: res } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/leadtime",
      payload,
      { headers, timeout: 5000 }
    );

    if (res?.code !== 200) throw new Error(res?.message || "Lỗi khi lấy leadtime.");

    const unixTs = res.data?.leadtime; // unix timestamp (seconds)
    if (unixTs) {
      leadTime = new Date(unixTs * 1000); // convert ra Date object
    }
  } catch (err) {
    console.error("[GHN getLeadTime] LỖI API /leadtime:", err?.response?.data || err.message);
    leadTime = null;
  }

  return { leadTime, service_id: actualServiceId };
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
// drivers/ghnService.js

// services/client/drivers/ghnService.js

async function bookPickup(payload) {
  // 1. Mapping mã GHN từ DB
  const { ghnDistId: fromDistrictGhnCode, ghnWardCode: fromWardGhnCode } =
    await getGhnCodesFromLocalDb({
      province: payload.from_province_id,
      district: payload.from_district_id,
      ward: payload.from_ward_id,
    });

  if (!fromDistrictGhnCode || !fromWardGhnCode) {
    throw new Error(
      "GHN: Không tìm thấy mã huyện/phường GHN hợp lệ cho địa chỉ lấy hàng."
    );
  }

  // ✅ Validate ward/district bằng GHN master-data
  try {
    const { data: wardRes } = await axios.get(
      `https://online-gateway.ghn.vn/shiip/public-api/master-data/ward?district_id=${fromDistrictGhnCode}`,
      { headers }
    );
    const foundWard = wardRes?.data?.find((w) => w.WardCode == fromWardGhnCode);
    if (!foundWard) {
      throw new Error(
        `GHN: WardCode ${fromWardGhnCode} không tồn tại trong district ${fromDistrictGhnCode}`
      );
    }
  } catch (err) {
    console.error("[GHN bookPickup] Validate ward/district lỗi:", err.message);
    throw err;
  }

  // 2. Lấy service_type_id
  let serviceTypeId;
  try {
    serviceTypeId = await getDefaultService({
      toProvince: payload.from_province_id,
      toDistrict: payload.from_district_id,
    });
    if (!serviceTypeId) throw new Error("Không có dịch vụ GHN khả dụng.");
  } catch (err) {
    console.error("GHN bookPickup: Lỗi khi lấy serviceTypeId:", err.message);
    throw new Error(`GHN: Lỗi khi xác định dịch vụ lấy hàng: ${err.message}`);
  }

  // 3. Ai trả phí (1 = shop, 2 = customer)
  const paymentTypeId = payload.situation === "customer_pays" ? 2 : 1;
  const paidBy = paymentTypeId === 2 ? "customer" : "shop";

  // 4. Payload tạo đơn GHN
  const createOrderPayload = {
    service_type_id: serviceTypeId,
    required_note: "KHONGCHOXEMHANG",
    payment_type_id: paymentTypeId,
    from_name: payload.from_name,
    from_phone: payload.from_phone,
    from_address: payload.from_address,
    from_ward_code: fromWardGhnCode,
    from_district_id: Number(fromDistrictGhnCode),
    to_name: payload.to_name,
    to_phone: payload.to_phone,
 to_address: buildFullAddress(
  payload.to_address,
  payload.wardName,
  payload.districtName,
  payload.provinceName
),

    to_ward_code: payload.to_ward_code,
    to_district_id: Number(payload.to_district_id),
weight: Math.max(1, payload.weight), // DB lưu gram → truyền thẳng

length: Math.max(1, payload.length),        // cm
width: Math.max(1, payload.width),          // cm
height: Math.max(1, payload.height),        // cm

    cod_amount: 0,
    client_order_code: payload.client_order_code,
    content: payload.items
  ? payload.items.map(it => `${it.productName} x${it.quantity}`).join(", ")
  : (payload.content || "Đơn hàng từ Cyberzone"),

  };

  try {
    // 5. Tạo đơn
    console.log("[GHN bookPickup] Payload gửi GHN:", createOrderPayload);

    const { data: responseData } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create",
      createOrderPayload,
      { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 10000 }
    );

    console.log("[GHN bookPickup] Response GHN:", responseData);

    if (responseData?.code !== 200 || !responseData.data?.order_code) {
      throw new Error(
        `GHN: API tạo vận đơn lỗi: ${responseData?.message || "Không rõ"}`
      );
    }

    const { order_code, expected_delivery_time, total_fee, service_fee } =
      responseData.data;

    // Log rõ ràng 2 loại phí để bạn dễ phân biệt
    console.log("[GHN bookPickup] total_fee (đúng):", total_fee);
    console.log("[GHN bookPickup] service_fee (tối thiểu):", service_fee);

    // 6. Lấy token để in label PDF
    const { data: tokenRes } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/a5/gen-token",
      { order_codes: [order_code] },
      { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 }
    );

    if (tokenRes?.code !== 200 || !tokenRes.data?.token) {
      throw new Error(
        `GHN: Không tạo được token cho label - ${tokenRes?.message}`
      );
    }

    const labelUrl = `https://online-gateway.ghn.vn/a5/public-api/printA5?token=${tokenRes.data.token}`;

    // 7. Trả kết quả
    return {
      trackingCode: order_code,
      labelUrl, // ✅ luôn là URL PDF in label
      shippingFee: Number(total_fee) || 0, // 💥 luôn lấy total_fee
      expectedDelivery: expected_delivery_time || null,
      paidBy,
    };
  } catch (error) {
    console.error("[GHN bookPickup] Lỗi:", error?.response?.data || error.message);
    throw new Error(
      "GHN: Lỗi khi tạo đơn lấy hàng. " +
        (error?.response?.data?.message || error.message)
    );
  }
}





// --- LẤY DỊCH VỤ GỬI TẠI BƯU CỤC (DROP-OFF) ---
// --- LẤY DỊCH VỤ GỬI TẠI BƯU CỤC (DROP-OFF) + GỢI Ý BƯU CỤC GẦN NHẤT ---
async function getDropoffServices({
  toProvince, toDistrict, toWard,
  weight,
  length = 10, width = 10, height = 10,
  orderValue = 0,
  userLat, userLng // 👈 truyền lat/lng địa chỉ KH nếu có
}) {
  // utils tính khoảng cách Haversine
  function getDistanceKm(lat1, lng1, lat2, lng2) {
    const R = 6371; // km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(lat1 * Math.PI / 180) *
      Math.cos(lat2 * Math.PI / 180) *
      Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  try {
    // 1) Tính phí tham chiếu cho tuyến khách -> shop
    const { fee, leadTime } = await getFee({
      toProvince,
      toDistrict,
      toWard,
      weight,
      length,
      width,
      height,
      serviceCode: null,
      orderValue
    });

    // 2) Lấy danh sách bưu cục GHN từ DB + API
    let dropoffPoints = [];
    try {
      const { ghnDistId, ghnWardCode } = await getGhnCodesFromLocalDb({
        province: toProvince,
        district: toDistrict,
        ward: toWard
      });

      if (ghnDistId) {
        // ✅ gọi hàm mới getStations thay vì axios trực tiếp
        const stations = await getStations({
          districtId: ghnDistId,
          wardCode: ghnWardCode
        });

        dropoffPoints = stations.map(st => {
          let distanceKm = null;
          if (userLat && userLng && st.lat && st.lng) {
            distanceKm = getDistanceKm(userLat, userLng, st.lat, st.lng);
          }
          return {
            ...st,
            distanceKm
          };
        });

        // Sắp xếp theo khoảng cách (nếu có lat/lng)
        dropoffPoints.sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));
        // Chỉ lấy 5 bưu cục gần nhất
        dropoffPoints = dropoffPoints.slice(0, 5);
      }
    } catch (e) {
      console.warn('[GHN getDropoffServices] getStations warn:', e?.response?.data || e.message);
    }

    // 3) Trả về option drop-off chuẩn hóa
    return [
      {
        code: 'GHN_DROPOFF',
        name: 'GHN - Gửi tại bưu cục',
        fee: Number(fee || 0),
        leadTime: leadTime ?? null,
        dropoffPoints
      }
    ];
  } catch (e) {
    console.error('[GHN getDropoffServices] error:', e?.response?.data || e.message);
    return [];
  }
}

// --- LẤY DANH SÁCH BƯU CỤC GHN ---
async function getStations({ districtId, wardCode, offset = 0, limit = 50 }) {
  try {
    const payload = {
      district_id: Number(districtId),
      ward_code: wardCode ? String(wardCode) : undefined,
      offset,
      limit,
    };

    console.log("[GHN getStations] Payload:", payload);

    const { data: res } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/station/get",
      payload,
      { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 }
    );

    if (res?.code !== 200) {
      throw new Error(res?.message || "GHN: Lỗi khi lấy danh sách bưu cục.");
    }

    const stations = res?.data?.stations || [];

    return stations.map(st => ({
      id: st.station_id,
      code: st.code,
      name: st.name,
      address: st.address,
      phone: st.phone,
      lat: st?.location?.lat ?? null,
      lng: st?.location?.lng ?? null,
      workTime: st?.work_time ?? null,
    }));
  } catch (err) {
    console.error("[GHN getStations] Error:", err?.response?.data || err.message);
    throw new Error("GHN: Không lấy được danh sách bưu cục.");
  }
}

async function createDropoffOrder(payload) {
  const { ghnDistId: fromDistrictGhnCode, ghnWardCode: fromWardGhnCode } =
    await getGhnCodesFromLocalDb({
      province: payload.from_province_id,
      district: payload.from_district_id,
      ward: payload.from_ward_id,
    });

  if (!fromDistrictGhnCode || !fromWardGhnCode) {
    throw new Error("GHN: Không tìm thấy mã huyện hoặc xã hợp lệ cho địa chỉ KH.");
  }

  // 🔥 Lấy service_type_id chính xác từ GHN
  const { data: serviceRes } = await axios.post(
    "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services",
    {
      shop_id: Number(GHN_SHOP_ID),
      from_district: Number(fromDistrictGhnCode),
      to_district: Number(payload.to_district_id),
    },
    { headers, timeout: 8000 }
  );

  const service = serviceRes?.data?.[0];
  if (!service) {
    throw new Error("GHN: Không tìm thấy dịch vụ khả dụng cho drop-off.");
  }

  const createOrderPayload = {
    service_type_id: service.service_type_id,
    payment_type_id: payload.situation === "customer_pays" ? 2 : 1,
    required_note: "KHONGCHOXEMHANG",
    pick_option: "post_office", // 💥 bắt buộc cho drop-off

    from_name: payload.from_name,
    from_phone: payload.from_phone,
    from_address: payload.from_address,
    from_ward_code: fromWardGhnCode,
    from_district_id: Number(fromDistrictGhnCode),

    to_name: payload.to_name,
    to_phone: payload.to_phone,
   to_address: buildFullAddress(
  payload.to_address,
  payload.wardName,
  payload.districtName,
  payload.provinceName
),

    to_ward_code: payload.to_ward_code,
    to_district_id: Number(payload.to_district_id),

    weight: Math.max(1, payload.weight),
    length: Math.max(1, payload.length),
    width: Math.max(1, payload.width),
    height: Math.max(1, payload.height),

    cod_amount: 0,
    client_order_code: payload.client_order_code,
content: payload.items
  ? payload.items.map(it => `${it.productName} x${it.quantity}`).join(", ")
  : (payload.content || "Đơn hàng từ Cyberzone"),

  };

  const { data: responseData } = await axios.post(
    "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create",
    createOrderPayload,
    { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 10000 }
  );

  console.log("[GHN createDropoffOrder] Response:", JSON.stringify(responseData, null, 2));

  if (responseData?.code !== 200 || !responseData.data?.order_code) {
    throw new Error(`GHN: Lỗi khi tạo đơn dropoff: ${responseData?.message}`);
  }

  return {
    trackingCode: responseData.data.order_code,
    labelUrl: responseData.data.label,
    totalFee: responseData.data.total_fee || 0,
    expectedDelivery: responseData.data.expected_delivery_time || null,
  };
}
async function getServiceForOrder({ fromDistrict, toDistrict, headers, shopId }) {
  try {
    const { data: res } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/available-services",
      {
        shop_id: Number(shopId),
        from_district: Number(fromDistrict),
        to_district: Number(toDistrict),
      },
      { headers, timeout: 5000 }
    );

    if (!res?.data?.length) {
      throw new Error("GHN: Không có dịch vụ khả thi cho tuyến này.");
    }

    console.log("[getServiceForOrder] Services:", res.data);

    // ✅ Trả về đúng object gồm service_id + service_type_id
    return {
      service_id: res.data[0].service_id,
      service_type_id: res.data[0].service_type_id,
    };
  } catch (err) {
    const errData = err?.response?.data || err.message;
    console.error("[getServiceForOrder] Lỗi:", errData);
    throw new Error("GHN: Không lấy được dịch vụ khả thi.");
  }
}
function buildFullAddress(street, wardName, districtName, provinceName) {
  return [street, wardName, districtName, provinceName]
    .filter(Boolean)   // bỏ undefined / null / ""
    .join(", ");
}


async function createDeliveryOrder(payload) {
  const { ghnDistId: toDistrictGhnCode, ghnWardCode: toWardGhnCode } =
    await getGhnCodesFromLocalDb({
      province: payload.to_province_id,
      district: payload.to_district_id,
      ward: payload.to_ward_id,
    });

  if (!toDistrictGhnCode || !toWardGhnCode) {
    throw new Error("GHN: Không tìm thấy mã huyện/phường GHN hợp lệ cho địa chỉ KH.");
  }

  // ✅ Lấy service_id và service_type_id bằng hàm riêng
  const { service_id, service_type_id } = await getServiceForOrder({
    fromDistrict: SHOP_DISTRICT_CODE,
    toDistrict: toDistrictGhnCode,
    headers,
    shopId: GHN_SHOP_ID,
  });

  const createOrderPayload = {
    payment_type_id: payload.situation === "customer_pays" ? 2 : 1,
    required_note: payload.required_note || "KHONGCHOXEMHANG",

    // From: SHOP
    from_name: payload.from_name,
    from_phone: payload.from_phone,
    from_address: payload.from_address,
    from_ward_code: String(SHOP_WARD_CODE),
    from_district_id: Number(SHOP_DISTRICT_CODE),

    // To: CUSTOMER
    to_name: payload.to_name,
    to_phone: payload.to_phone,
   to_address: buildFullAddress(
  payload.to_address,     // địa chỉ chi tiết user nhập
  payload.wardName,       // tên xã
  payload.districtName,   // tên huyện
  payload.provinceName    // tên tỉnh
),

    to_ward_code: String(toWardGhnCode),
    to_district_id: Number(toDistrictGhnCode),

    // Dịch vụ GHN
    service_id: Number(service_id),
    service_type_id: Number(service_type_id),

    // Hàng hóa
    weight: Math.max(1, payload.weight),
    length: Math.max(1, payload.length),
    width: Math.max(1, payload.width),
    height: Math.max(1, payload.height),

    cod_amount: payload.cod_amount || 0,
    client_order_code: payload.client_order_code,
content: payload.items
  ? payload.items.map(it => `${it.productName} x${it.quantity}`).join(", ")
  : "Đơn hàng từ Cyberzone",

  };

  console.log("[GHN createDeliveryOrder] Payload gửi GHN:", createOrderPayload);

  const { data: responseData } = await axios.post(
    "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/create",
    createOrderPayload,
    { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 10000 }
  );

  if (responseData?.code !== 200 || !responseData.data?.order_code) {
    throw new Error(`GHN: Lỗi khi tạo vận đơn: ${responseData?.message}`);
  }

  // In nhãn
  const { data: tokenRes } = await axios.post(
    "https://online-gateway.ghn.vn/shiip/public-api/v2/a5/gen-token",
    { order_codes: [responseData.data.order_code] },
    { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 }
  );

  const labelUrl = `https://online-gateway.ghn.vn/a5/public-api/printA5?token=${tokenRes.data.token}`;

  return {
    trackingCode: responseData.data.order_code,
    labelUrl,
    shippingFee: responseData.data.total_fee || 0,
    expectedDelivery: responseData.data.expected_delivery_time || null,
  };
}



// --- LẤY PDF LABEL CHO MÃ VẬN ĐƠN GHN ---
async function getLabel(trackingCode) {
  try {
    // 1. Lấy token cho order_code
    const { data: tokenRes } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/a5/gen-token",
      { order_codes: [trackingCode] },
      { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 }
    );

    if (tokenRes?.code !== 200 || !tokenRes.data?.token) {
      throw new Error(`GHN: Không tạo được token cho label - ${tokenRes?.message}`);
    }

    const token = tokenRes.data.token;

    // 2. Tạo link in PDF (A5)
    const pdfUrl = `https://online-gateway.ghn.vn/a5/public-api/printA5?token=${token}`;

    return pdfUrl;
  } catch (err) {
    console.error("[GHN getLabel] Error:", err.response?.data || err.message);
    throw err;
  }
}
async function getTrackingByClientCode(clientOrderCode) {
  try {
    const { data: res } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail-by-client-code",
      { client_order_code: String(clientOrderCode) },
      { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 }
    );

    if (res?.code !== 200 || !res.data) {
      throw new Error(res?.message || "GHN: Không lấy được chi tiết đơn hàng.");
    }

    // Chuẩn hóa log tracking
    const logs = (res.data.log || []).map(l => ({
      time: l.updated_date,
      status: l.status,
      note: l.note || null
    }));

    return {
      orderCode: res.data.order_code,
      clientOrderCode: res.data.client_order_code,
      status: res.data.status,
      logs
    };
  } catch (err) {
    console.error("[GHN getTrackingByClientCode] Error:", err.response?.data || err.message);
    throw new Error("GHN: Không thể lấy tracking bằng client_order_code.");
  }
}

async function getTrackingByOrderCode(orderCode) {
  try {
    const { data: res } = await axios.post(
      "https://online-gateway.ghn.vn/shiip/public-api/v2/shipping-order/detail",
      { order_code: String(orderCode) },
      { headers: { ...headers, ShopId: GHN_SHOP_ID }, timeout: 8000 }
    );

    if (res?.code !== 200 || !res.data) {
      throw new Error(res?.message || "GHN: Không lấy được chi tiết đơn hàng.");
    }

    const logs = (res.data.log || []).map(l => ({
      time: l.updated_date,
      status: l.status,
      note: l.note || null
    }));

    return {
      orderCode: res.data.order_code,
      clientOrderCode: res.data.client_order_code,
      status: res.data.status,
      logs
    };
  } catch (err) {
    console.error("[GHN getTrackingByOrderCode] Error:", err.response?.data || err.message);
    throw new Error("GHN: Không thể lấy tracking bằng order_code.");
  }
}


module.exports = {
  getDefaultService,
  getFee,
  createDropoffOrder, // <-- thêm dòng này
  getGhnCodesFromLocalDb,
  bookPickup,
  createDeliveryOrder,
  getLeadTime,   
  getStations,
   getLabel,   // 👈 thêm dòng này
   getTrackingByClientCode,  // 👈 thêm
  getTrackingByOrderCode,    // 👈 thêm
   getDropoffServices,
};