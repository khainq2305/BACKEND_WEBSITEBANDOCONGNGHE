// drivers/ghtkService.js
// ===============================================================
// Driver: Giao Hàng Tiết Kiệm (GHTK)
// Trả về { fee: number, leadTime: number|null } – leadTime = số ngày
// ===============================================================

const axios     = require('axios');
const NodeCache = require('node-cache');                 // 🆕 cache RAM
const cache     = new NodeCache({ stdTTL: 86_400 });     // 24 h

const {
  GHTK_TOKEN,          // token GHTK cấp
  SHOP_PROVINCE,       // TÊN tỉnh kho lấy hàng (đúng chính tả)
  SHOP_DISTRICT,       // TÊN quận kho lấy hàng (đúng chính tả)
} = process.env;

/** GHTK chỉ có một service mặc định */
function getDefaultService() {
  return 'ghtk';
}

/**
 * stripPrefix: xoá tiền tố “Huyện”, “Quận”, “Phường”, … và loại bỏ dấu
 * để khớp format GHTK (chấp nhận tên không dấu).
 */
function stripPrefix(name = '') {
  return name
    .normalize('NFD')            // tách dấu
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^(Huyen|Quan|Thanh.?pho|Thi.?xa|TX)\s+/i, '')
    .replace(/^(Phuong|Xa|Thi.?tran|TT)\s+/i, '')
    .trim();
}

/**
 * buildCacheKey – duy nhất theo điểm đến + trọng lượng + Kích thước.
 * GHTK tính phí theo 50 g, nhưng cache theo gram cho chắc.
 */
function buildKey(p, d, w, weight, l, wi, h) {
  return `ghtk:${p}|${d}|${w}|${weight}|${l}|${wi}|${h}`;
}

/**
 * Tính phí & ngày giao dự kiến
 * ---------------------------------------------------------------
 * @param {Object} params
 * @param {string} params.toProvince – tên tỉnh người nhận (đúng chính tả)
 * @param {string} params.toDistrict – tên quận/huyện người nhận
 * @param {string} params.toWard     – tên phường/xã người nhận
 * @param {number} params.weight     – gram
 * @param {number} params.length     – cm
 * @param {number} params.width      – cm
 * @param {number} params.height     – cm
 * @returns {{ fee: number, leadTime: number|null }}
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
  // 1️⃣ Làm sạch tên
  const cleanDistrict = stripPrefix(toDistrict);
  const cleanWard     = stripPrefix(toWard);

  // 2️⃣ Cache theo key (đỡ gọi API nhiều lần)
  const key = buildKey(toProvince, cleanDistrict, cleanWard,
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

          province : toProvince,
          district : cleanDistrict,
          address  : cleanWard,      // GHTK chỉ cần tên phường
          weight, length, width, height,
          value           : 0,
          deliver_option  : 'none',
        },
        headers: { Token: GHTK_TOKEN },
        timeout: 8_000,              // tránh treo
      },
    );
    data = res.data;
  } catch (err) {
    console.error('[GHTK fee API error]',
                  err?.response?.data || err.message);
    return { fee: 0, leadTime: null };
  }

  // 4️⃣ Lấy phí
  const rawFee = data?.fee || {};
  const fee    = Number(
    rawFee.total ?? rawFee.fee ?? 0,
  );

  // 5️⃣ Lấy leadTime
  let leadTime = null;
  const toDays = ts => {
    const sec = Number(ts) - Math.floor(Date.now() / 1000);
    return sec > 0 ? Math.ceil(sec / 86_400) : null;
  };
  if (data?.expected)   leadTime = toDays(data.expected);
  else if (data?.leadtime) leadTime = toDays(data.leadtime);

  // 6️⃣ Fallback hỏi /shipment/leadtime nếu cần
  if (leadTime == null) {
    try {
      const { data: lt } = await axios.get(
        'https://services.giaohangtietkiem.vn/services/shipment/leadtime',
        {
          params : {
            pick_province : SHOP_PROVINCE,
            pick_district : SHOP_DISTRICT,
            province      : toProvince,
            district      : cleanDistrict,
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
      toProvince === SHOP_PROVINCE &&
      cleanDistrict === stripPrefix(SHOP_DISTRICT)
        ? 1           // nội tỉnh
        : 3;          // liên tỉnh mặc định
  }

  // 8️⃣ Lưu cache & trả kết quả
  const result = { fee, leadTime };
  cache.set(key, result);
  return result;
}

module.exports = { getDefaultService, getFee };
