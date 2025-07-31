// drivers/ghtkService.js (Phiên bản đã sửa)
// ===============================================================
// Driver: Giao Hàng Tiết Kiệm (GHTK)
// ===============================================================

const axios     = require('axios');
const NodeCache = require('node-cache');
const cache     = new NodeCache({ stdTTL: 86_400 });
const mysql = require('mysql2/promise'); // Thêm thư viện mysql

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

module.exports = { getDefaultService, getFee };