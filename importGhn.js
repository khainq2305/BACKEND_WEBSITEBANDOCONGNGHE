/**
 * GHN ➜ providerprovinces / providerdistricts / providerwards
 * -----------------------------------------------------------
 * .env cần: DB_HOST DB_PORT DB_USER DB_PASS DB_NAME GHN_TOKEN
 * Chạy: node importGhn.js
 */
require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');
const { search } = require('fast-fuzzy');
const util = require('util'); // Thêm dòng này để in object sâu hơn

const TOKEN = process.env.GHN_TOKEN;
const PROVIDER_ID = 1; // GHN id

/* ---------- helpers ---------- */
const deAccent = t => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const stripProv = t => t
  .replace(/^(Tỉnh|Tinh)\s+/i, '')
  .replace(/^(Thành phố|Thanh pho|TP)\s+/i, '');
const stripDist = t => t
  .replace(/^(Quận|Quan|Huyện|Huyen|Thị xã|Thi xa|TP|TX)\s+/i, '');
const stripWard = t => t
  .replace(/^(Phường|Phuong|Xã|Xa|Thị trấn|Thi tran)\s+/i, '');
const norm = t => deAccent(stripDist(stripProv(stripWard(t || ''))))
  .replace(/[^\w\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

/* ---------- main ---------- */
(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  const [provs] = await db.query('SELECT id, name FROM provinces');
  const [dists] = await db.query('SELECT id, name, provinceId FROM districts');
  const [wards] = await db.query('SELECT id, name, districtId FROM wards');
  const provMap = new Map(); // Khởi tạo map để điền sau
  const dbProvIdToNameMap = new Map(provs.map(p => [p.id, norm(p.name)]));

  // THÊM LOG ĐỂ GỠ LỖI NORM() TỪ DB CHO "THỪA THIÊN HUẾ"
  for (const p of provs) {
      const normalizedDbName = norm(p.name);
      provMap.set(normalizedDbName, p.id);
      if (p.name.includes('Thừa Thiên Huế') || p.name.includes('Huế')) { // Lọc đúng tỉnh cần debug
         
      }
  }
  
  const distByProvDbId = dists.reduce((m, d) => {
    (m[d.provinceId] = (m[d.provinceId] || [])).push({ ...d, n: norm(d.name) });
    return m;
  }, {});

  const wardByDistDbId = wards.reduce((m, w) => {
    (m[w.districtId] = (m[w.districtId] || [])).push({ ...w, n: norm(w.name) });
    return m;
  }, {});


  /* 2️⃣ Lấy dữ liệu Provinces từ GHN */
  let ghnProvinces = [];
  try {
    const { data: { data: fetchedGhnProvinces } } = await axios.get(
      'https://online-gateway.ghn.vn/shiip/public-api/master-data/province',
      { headers: { Token: TOKEN } }
    );
    ghnProvinces = fetchedGhnProvinces;
  } catch (error) {
    console.error('⚠️ Lỗi khi lấy dữ liệu tỉnh từ GHN API:', error.message);
    if (error.response) {
      console.error('Phản hồi lỗi GHN:', error.response.status, error.response.data);
    }
    db.end();
    return;
  }

  /* 3️⃣ Duyệt từng Province của GHN */
  for (const p of ghnProvinces) {
    const normalizedGhnName = norm(p.ProvinceName); // THÊM DÒNG NÀY ĐỂ LẤY TÊN GHN ĐÃ CHUẨN HÓA

    // THÊM LOG ĐỂ GỠ LỖI NORM() TỪ GHN CHO "THỪA THIÊN HUẾ"
    if (p.ProvinceName.includes('Thừa Thiên Huế') || p.ProvinceName.includes('Huế')) { // Lọc đúng tỉnh cần debug
        console.log(`[DEBUG NORM GHN] Tên gốc GHN: "${p.ProvinceName}" -> Chuẩn hóa GHN: "${normalizedGhnName}"`);
    }

    const dbProvId = provMap.get(normalizedGhnName); // Sử dụng tên GHN đã chuẩn hóa để tra cứu

    if (!dbProvId) {
        console.warn(`⚠️ Tỉnh GHN "${p.ProvinceName}" (GHN ID: ${p.ProvinceID}) không tìm thấy ID khớp theo TÊN trong DB của bạn. Bỏ qua tỉnh này.`);
        console.log(`   -> Normalized GHN name: "${normalizedGhnName}"`); // In ra tên đã chuẩn hóa của GHN
        // Thêm log để kiểm tra xem có tên nào gần giống trong DB không
        for (const key of provMap.keys()) {
            if (key.includes('thua thien') || key.includes('hue')) {
                console.log(`   -> Tên gần giống trong DB: "${key}"`);
            }
        }
        continue;
    }

    await db.execute(
      `REPLACE INTO providerprovinces
         (providerId, provinceId, providerProvinceCode, providerProvinceName)
         VALUES (?, ?, ?, ?)`,
      [PROVIDER_ID, dbProvId, p.ProvinceID, p.ProvinceName]
    );

    /* 4️⃣ Lấy dữ liệu Districts từ GHN */
    let ghnDistsForProv = [];
    try {
      const response = await axios.post(
        'https://online-gateway.ghn.vn/shiip/public-api/master-data/district',
        { province_id: p.ProvinceID },
        { headers: { Token: TOKEN } }
      );
      if (response.data && Array.isArray(response.data.data)) {
          ghnDistsForProv = response.data.data;
      } else {
          console.warn(`⚠️ GHN Districts API trả về định dạng dữ liệu không mong muốn cho tỉnh ${p.ProvinceID} (${p.ProvinceName}). Dữ liệu:`, util.inspect(response.data, { depth: null }));
          ghnDistsForProv = [];
      }
    } catch (error) {
      console.error(`⚠️ Lỗi khi lấy dữ liệu huyện cho tỉnh ${p.ProvinceName} (GHN ID: ${p.ProvinceID}) từ GHN API:`, error.message);
      if (error.response) {
        console.error('Phản hồi lỗi GHN (full):', util.inspect(error.response.data, { depth: null }));
        console.error('Status:', error.response.status);
      }
      ghnDistsForProv = [];
      continue;
    }

    const intDists = distByProvDbId[dbProvId] || [];
    if (!intDists.length) {
      console.warn(`⛔ Tỉnh ${p.ProvinceName} (DB ID: ${dbProvId}) không có huyện nội bộ. (Đây là lỗi nếu bạn chắc chắn DB có huyện cho tỉnh này)`);
      continue;
    }

    const distNorm = intDists.map(x => x.n);

    for (const d of ghnDistsForProv) {
      const FUZZY_DISTRICT_THRESHOLD = 0.55;
      const matchArr = search(norm(d.DistrictName), distNorm, { returnMatchData: true });
      const m = matchArr[0] || {};

      if ((m.score || 0) < FUZZY_DISTRICT_THRESHOLD) {
        // console.log(`  • Không khớp huyện: GHN "${d.DistrictName}" (ID:${d.DistrictID}) → khớp DB "${m.item || 'N/A'}" (Điểm: ${m.score || 0})`);
        continue;
      }

      const distIdx = distNorm.indexOf(m.item);
      const dbDistId = intDists[distIdx]?.id;
      if (!dbDistId) {
        // console.log(`  • Tìm thấy khớp "${d.DistrictName}" → "${m.item}" nhưng dbDistId undefined trong DB.`);
        continue;
      }

      await db.execute(
        `REPLACE INTO providerdistricts
           (providerId, districtId, providerDistrictCode, providerDistrictName, provinceId)
           VALUES (?, ?, ?, ?, ?)`,
        [PROVIDER_ID, dbDistId, d.DistrictID, d.DistrictName, dbProvId]
      );

      const intWards = wardByDistDbId[dbDistId] || [];
      const wardNorm = intWards.map(x => x.n);
      const batch = [];
      const FUZZY_WARD_THRESHOLD = 0.55;

      /* 5️⃣ Lấy dữ liệu Wards (xã/phường) từ GHN */
      let ghnWardsForDist = [];
      try {
        const response = await axios.post(
          'https://online-gateway.ghn.vn/shiip/public-api/master-data/ward',
          { district_id: d.DistrictID },
          { headers: { Token: TOKEN } }
        );
        if (response.data && Array.isArray(response.data.data)) {
            ghnWardsForDist = response.data.data;
        } else {
            console.warn(`⚠️ GHN Wards API trả về định dạng dữ liệu không mong muốn cho huyện ${d.DistrictID} (${d.DistrictName}). Dữ liệu:`, util.inspect(response.data, { depth: null }));
            ghnWardsForDist = [];
        }
      } catch (error) {
        console.error(`⚠️ Lỗi khi lấy dữ liệu xã/phường cho huyện ${d.DistrictID} (${d.DistrictName}) từ GHN API:`, error.message);
        if (error.response) {
          console.error('Phản hồi lỗi GHN (full):', util.inspect(error.response.data, { depth: null }));
          console.error('Status:', error.response.status);
        }
        ghnWardsForDist = [];
        continue;
      }

      for (const w of ghnWardsForDist) {
        const m2 = search(norm(w.WardName), wardNorm, { returnMatchData: true })[0] || {};
        if ((m2.score || 0) < FUZZY_WARD_THRESHOLD) {
          // console.log(`    • Không khớp xã/phường: GHN "${w.WardName}" (Code:${w.WardCode}) → khớp DB "${m2.item || 'N/A'}" (Điểm: ${m2.score || 0})`);
          continue;
        }

        const wardIdx = wardNorm.indexOf(m2.item);
        const dbWardId = intWards[wardIdx]?.id;
        if (!dbWardId) {
          // console.log(`    • Tìm thấy khớp xã/phường "${w.WardName}" → "${m2.item}" nhưng dbWardId undefined trong DB.`);
          continue;
        }

        batch.push([
          PROVIDER_ID,
          dbWardId,
          w.WardCode,
          w.WardName,
          dbDistId
        ]);
      }

      if (batch.length) {
        await db.query(
          `REPLACE INTO providerwards
             (providerId, wardId, providerWardCode, providerWardName, districtId)
             VALUES ?`,
          [batch]
        );
      }
    }
  }

  console.timeEnd('⏳ GHN import');

  /* thống kê */
  const [[pc]] = await db.query('SELECT COUNT(*) c FROM providerprovinces');
  const [[dc]] = await db.query('SELECT COUNT(*) c FROM providerdistricts');
  const [[wc]] = await db.query('SELECT COUNT(*) c FROM providerwards');
  console.log(`🎯 ${pc.c} tỉnh | ${dc.c} huyện | ${wc.c} xã`);

  db.end();
})();