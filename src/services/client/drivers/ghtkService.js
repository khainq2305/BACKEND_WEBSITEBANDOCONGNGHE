
const axios     = require('axios');
const NodeCache = require('node-cache');
const cache     = new NodeCache({ stdTTL: 86_400 });
const mysql = require('mysql2/promise'); 
const PARTNER_CODE = "S22856075"; // mã do GHTK cấp cho shop của bạn

const {
  GHTK_TOKEN,
  SHOP_PROVINCE,
  SHOP_DISTRICT,
} = process.env;

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
    console.log('[GHTK Service] Đã kết nối DB thành công.');
  } catch (error) {
    console.error('[GHTK Service] Lỗi kết nối DB:', error.message);
  }
})();

/** GHTK chỉ có một service mặc định */
function getDefaultService() {
  return 'ghtk';
}

/**
 * stripPrefix: xoá tiền tố “Huyện”, “Quận”, “Phường”, … và loại bỏ dấu
 */
function stripPrefix(name = '') {
  const nameStr = String(name);
  return nameStr
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(Huyen|Quan|Thanh.?pho|Thi.?xa|TX)\s+/i, '')
    .replace(/^(Phuong|Xa|Thi.?tran|TT)\s+/i, '')
    .trim();
}

/**
 * Tra cứu tên tỉnh/huyện/xã từ ID nội bộ.
 * @param {number} provinceId ID tỉnh nội bộ
 * @param {number} districtId ID huyện nội bộ
 * @param {number} wardId ID xã nội bộ
 * @returns {{ provinceName: string, districtName: string, wardName: string }}
 */
async function getNamesFromLocalDb({ provinceId, districtId, wardId }) {
    if (!dbConnection) throw new Error('GHTK Service: DB chưa kết nối.');

    const [provinceRes] = await dbConnection.query(
        `SELECT name FROM provinces WHERE id = ? LIMIT 1`,
        [provinceId]
    );
    if (!provinceRes || provinceRes.length === 0) {
        throw new Error(`GHTK: Không tìm thấy tên tỉnh cho ID ${provinceId}.`);
    }
    const provinceName = provinceRes[0].name;

    const [districtRes] = await dbConnection.query(
        `SELECT name FROM districts WHERE id = ? LIMIT 1`,
        [districtId]
    );
    if (!districtRes || districtRes.length === 0) {
        throw new Error(`GHTK: Không tìm thấy tên huyện cho ID ${districtId}.`);
    }
    const districtName = districtRes[0].name;

    let wardName = null;
    if (wardId) {
        const [wardRes] = await dbConnection.query(
            `SELECT name FROM wards WHERE id = ? LIMIT 1`,
            [wardId]
        );
        if (wardRes && wardRes.length > 0) {
            wardName = wardRes[0].name;
        } else {
            console.warn(`GHTK: Không tìm thấy tên xã cho ID ${wardId}.`);
        }
    }

    return { provinceName, districtName, wardName };
}

/**
 * buildCacheKey – duy nhất theo điểm đến + trọng lượng + Kích thước.
 */
function buildKey(p, d, w, weight, l, wi, h) {
  return `ghtk:${p}|${d}|${w}|${weight}|${l}|${wi}|${h}`;
}

/**
 * Tính phí & ngày giao dự kiến
 */
async function getFee({
  toProvince,
  toDistrict,
  toWard,
  weight,
  length,
  width,
  height,
}) {
  // 💥 Bước quan trọng: Lấy tên địa chỉ từ ID nội bộ
  const { provinceName, districtName, wardName } = await getNamesFromLocalDb({
      provinceId: toProvince,
      districtId: toDistrict,
      wardId: toWard,
  });

  const cleanDistrict = stripPrefix(districtName);
  const cleanWard     = stripPrefix(wardName);

  // 2️⃣ Cache theo key (đỡ gọi API nhiều lần)
  const key = buildKey(provinceName, cleanDistrict, cleanWard,
                       weight, length, width, height);
  const cached = cache.get(key);
  if (cached) return cached;

  /* -------------------------------------------------------------
   * 3️⃣ Gọi /shipment/fee
   * ----------------------------------------------------------- */
  let data;
  try {
    const res = await axios.get(
      'https://services.giaohangtietkiem.vn/services/shipment/fee',
      {
        params: {
          pick_province : SHOP_PROVINCE,
          pick_district : SHOP_DISTRICT,
          province : provinceName,
          district : cleanDistrict,
          address  : cleanWard,
          weight, length, width, height,
          value : 0,
          deliver_option : 'none',
        },
        headers: { Token: GHTK_TOKEN },
        timeout: 8_000,
      },
    );
    data = res.data;
  } catch (err) {
    console.error('[GHTK fee API error]', err?.response?.data || err.message);
    return { fee: 0, leadTime: null };
  }

  // 4️⃣ Lấy phí
  const rawFee = data?.fee || {};
  const fee = Number(rawFee.total ?? rawFee.fee ?? 0);

  // 5️⃣ Lấy leadTime
  let leadTime = null;
  const toDays = ts => {
    const sec = Number(ts) - Math.floor(Date.now() / 1000);
    return sec > 0 ? Math.ceil(sec / 86_400) : null;
  };
  if (data?.expected) {
    const date = new Date(data.expected.replace(/(\d{2})\/(\d{2})\/(\d{4})/, '$3-$2-$1'));
    const expectedTimestamp = date.getTime() / 1000;
    leadTime = toDays(expectedTimestamp);
  } else if (data?.leadtime) {
    leadTime = toDays(data.leadtime);
  }

  // 6️⃣ Fallback hỏi /shipment/leadtime nếu cần
  if (leadTime == null) {
    try {
      const { data: lt } = await axios.get(
        'https://services.giaohangtietkiem.vn/services/shipment/leadtime',
        {
          params : {
            pick_province : SHOP_PROVINCE,
            pick_district : SHOP_DISTRICT,
            province : provinceName,
            district : cleanDistrict,
          },
          headers: { Token: GHTK_TOKEN },
          timeout: 5_000,
        },
      );
      const hours = Number(lt?.leadtime);
      if (!isNaN(hours) && hours > 0) leadTime = Math.ceil(hours / 24);
    } catch {
      /* ignore */
    }
  }

  // 7️⃣ Cuối cùng: tự estimate khi cùng tỉnh/quận
  if (leadTime == null) {
    leadTime =
      provinceName === SHOP_PROVINCE && cleanDistrict === stripPrefix(SHOP_DISTRICT)
        ? 1
        : 3;
  }

  // 8️⃣ Lưu cache & trả kết quả
  const result = { fee, leadTime };
  cache.set(key, result);
  return result;
}
// --- LẤY DỊCH VỤ GỬI TẠI BƯU CỤC (DROP-OFF) ---
async function getDropoffServices({
  toProvince, toDistrict, toWard,
  weight,
  length = 10, width = 10, height = 10,
}) {
  try {
    // Tận dụng getFee sẵn có để ước phí/leadtime cho tuyến khách -> shop
    const { fee, leadTime } = await getFee({
      toProvince,
      toDistrict,
      toWard,
      weight,
      length,
      width,
      height,
    });

    // Trả về 1 lựa chọn drop-off chuẩn hoá cho FE/controller
    return [
      {
        code: 'GHTK_DROPOFF',
        name: 'GHTK - Gửi tại bưu cục',
        fee: Number(fee || 0),
        leadTime: leadTime ?? null,
        dropoffPoints: [] // (tuỳ bạn: có thể bổ sung danh sách bưu cục thật sau)
      }
    ];
  } catch (e) {
    console.error('[GHTK getDropoffServices] error:', e?.response?.data || e.message);
    return [];
  }
}

async function createDropoffOrder(payload) {
  try {
    // ✅ Khai giá (>= 1000)
    let orderValue = Number(payload.value) || 0;
    if (orderValue <= 0) {
      console.warn("[GHTK] Khai giá <= 0, ép về 1000đ");
      orderValue = 1000;
    }

    // ✅ Cân nặng mặc định (gram)
    let defaultWeight = 100;
    if (payload.weight) {
      defaultWeight =
        payload.weight < 1
          ? Math.round(payload.weight * 1000) // kg → g
          : Math.round(payload.weight);       // g
    }

    // ✅ Fix loại dịch vụ
    let transport = "road";
    if (payload.serviceType?.toLowerCase() === "express") {
      if (orderValue > 0) {
        console.warn("[GHTK] EXPRESS không hỗ trợ khai giá, ép về road");
      } else {
        transport = "fly";
        orderValue = 0;
      }
    }

    // ✅ Fix số điện thoại trùng
    let pickTel = payload.from_phone;
    if (pickTel === payload.to_phone) {
      console.warn("[GHTK] pick_tel trùng tel, đổi số shop mặc định");
      pickTel = "0900000000";
    }

    // ✅ Danh sách sản phẩm + trọng lượng thực
    let totalWeight = 0;
    const products =
      payload.items?.map((it) => {
        let itemWeight =
          !it.weight || it.weight <= 0
            ? defaultWeight
            : it.weight < 1
            ? Math.round(it.weight * 1000) // kg → g
            : Math.round(it.weight);

        if (itemWeight < 50) itemWeight = 50; // min 50g
        const lineWeight = itemWeight * (it.quantity || 1);
        totalWeight += lineWeight;

        return {
          name: `${it.productName} x${it.quantity}`,
          weight: itemWeight / 1000, // gram → kg
          quantity: it.quantity,
          product_code: it.productCode || undefined,
        };
      }) || [
        {
          name: payload.content || "Hàng hóa",
          weight: Math.max(50, defaultWeight) / 1000,
          quantity: 1,
        },
      ];

    if (products.length === 1 && !payload.items) {
      totalWeight = products[0].weight * 1000; // vì đang tính kg
    }

    // ✅ Tính trọng lượng thể tích (cm³/6000 * 1000g)
    const length = payload.length || 10;
    const width = payload.width || 10;
    const height = payload.height || 10;
    const volumeWeight = Math.ceil((length * width * height) / 6000 * 1000);

    // ✅ Lấy max giữa trọng lượng thực và thể tích
    let finalWeight = Math.max(totalWeight, volumeWeight);
    if (finalWeight < 50) finalWeight = 50;

    console.log(
      `[DEBUG] totalWeight=${totalWeight}g, volumeWeight=${volumeWeight}g, finalWeight=${finalWeight}g`
    );

    // 🚨 Check quá tải
    if (finalWeight >= 20000) {
      throw new Error(
        `[GHTK] Đơn quá khối lượng (${finalWeight}g). GHTK không nhận >= 20kg`
      );
    }

    // ✅ Payload gửi GHTK
    const orderPayload = {
      products,
      order: {
        id: payload.client_order_code,

        // 🏬 Điểm lấy (shop)
        pick_address_id: process.env.GHTK_PICK_ADDRESS_ID,
        pick_address: process.env.GHTK_PICK_ADDRESS,
        pick_province: process.env.GHTK_PICK_PROVINCE || "Cần Thơ",
        pick_district: process.env.GHTK_PICK_DISTRICT || "Quận Cái Răng",
        pick_ward: process.env.GHTK_PICK_WARD || "Phường Thường Thạnh",
        pick_name: payload.from_name || "Cyberzone Shop",
        pick_tel: pickTel,
        pick_email: payload.from_email || "shop@default.com",

        // 📦 Điểm giao
        name: payload.to_name,
        address: payload.to_address,
        province: payload.to_province_name,
        district: payload.to_district_name,
        ward: payload.to_ward_name || undefined,
        hamlet: "Khác",
        tel: payload.to_phone,
        email: payload.to_email || "customer@default.com",

        // 🚚 Thông tin khác
        is_freeship: 1,
        pick_money: Number(payload.codAmount) || 0,
        value: orderValue,
        weight: finalWeight,
        length,
        width,
        height,
        content: payload.content || "Hàng hóa",
        transport,
        pick_option: "cod",
        note: payload.note || "Đơn hàng API",
      },
    };

    console.log("[GHTK] Payload gửi:", JSON.stringify(orderPayload, null, 2));

    // ✅ Call API GHTK
    const { data: res } = await axios.post(
      "https://services.giaohangtietkiem.vn/services/shipment/order/?ver=1.5",
      orderPayload,
      {
        headers: {
          Token: GHTK_TOKEN,
          "X-Client-Source": PARTNER_CODE,
          "Content-Type": "application/json",
        },
        timeout: 10000,
      }
    );

    console.log("[GHTK] Response:", JSON.stringify(res, null, 2));

    if (res?.success && res?.order) {
      const trackingCode = res.order.label;

      // ✅ Gọi API lấy labelUrl
      let labelUrl = null;
      try {
        labelUrl = await getLabel(trackingCode);
      } catch (e) {
        console.warn("[GHTK] Không lấy được labelUrl:", e.message);
      }

      // ✅ Ngày giao dự kiến
      const expectedDelivery = res.order?.estimated_deliver_time || null;

      // ✅ Lưu DB
      if (dbConnection) {
        await dbConnection.execute(
          `UPDATE orders 
           SET trackingCode = ?, labelUrl = ?, shippingLeadTime = ? 
           WHERE orderCode = ?`,
          [trackingCode, labelUrl, expectedDelivery, payload.client_order_code]
        );
      }

      return { trackingCode, labelUrl, expectedDelivery };
    } else {
      throw new Error(res?.message || "Không tạo được đơn GHTK");
    }
  } catch (err) {
    console.error(
      "[GHTK createDropoffOrder] error:",
      err?.response?.data || err.message
    );
    throw err;
  }
}





/**
 * Lấy lại link in Label từ GHTK bằng mã vận đơn (trackingCode)
 * @param {string} trackingCode - Mã vận đơn GHTK (label code)
 */
async function getLabel(trackingCode) {
  try {
    const { data: res } = await axios.get(
      "https://services.giaohangtietkiem.vn/services/shipment/label",
      {
        params: { label: trackingCode }, // truyền mã vận đơn
        headers: { Token: GHTK_TOKEN },
        timeout: 8000,
      }
    );

    if (res?.success && res?.label) {
      return res.label; // URL in phiếu
    } else {
      throw new Error(res?.message || "Không lấy được label GHTK");
    }
  } catch (err) {
    console.error("[GHTK getLabel] error:", err?.response?.data || err.message);
    throw err;
  }
}


module.exports = { getDefaultService, getFee, getDropoffServices, createDropoffOrder, getLabel  };