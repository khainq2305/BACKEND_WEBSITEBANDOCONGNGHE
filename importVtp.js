/**
 * VTP ➜ providerprovinces / providerdistricts / providerwards
 * -----------------------------------------------------------
 * .env cần: DB_HOST DB_PORT DB_USER DB_PASS DB_NAME VTP_TOKEN
 * Chạy: node importVtp.js
 */
require('dotenv').config();
const axios = require('axios');
const mysql = require('mysql2/promise');
const fuzzysort = require('fuzzysort');
const util = require('util');

const VTP_TOKEN = process.env.VTP_TOKEN;
const PROVIDER_ID = 3;

// Định nghĩa ID nội bộ của Cần Thơ và tên chuẩn hóa để dễ dàng lọc log
const CAN_THO_DB_ID = 92; // Dựa vào hình ảnh DB bạn cung cấp (DB: "Thành phố Cần Thơ", ID: 92)
const CAN_THO_VTP_ID = 5; // Dựa vào getVtpProvinceNames.js (VTP: "Cần Thơ", ID: 5)
const CAN_THO_NORM_NAME = 'can tho'; // Tên chuẩn hóa dự kiến của Cần Thơ

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
  if (!VTP_TOKEN) {
    console.error('⚠️ Lỗi: VTP_TOKEN không được tìm thấy trong file .env. Vui lòng cấu hình.');
    return;
  }

  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  console.time('⏳ VTP import');

  /* 1️⃣ Lấy dữ liệu nội bộ từ DB ---------------------------------------------------- */
  const [provs] = await db.query('SELECT id, name FROM provinces');
  const [dists] = await db.query('SELECT id, name, provinceId FROM districts');
  const [wards] = await db.query('SELECT id, name, districtId FROM wards');

  console.log('--- Dữ liệu từ DB của bạn ---');
  console.log('Số tỉnh đọc được (provinces):', provs.length);
  console.log('Số huyện đọc được (districts):', dists.length);
  console.log('Số xã/phường đọc được (wards):', wards.length);
  console.log('-----------------------------');

  const provMap = new Map(); // Map: normalized_name -> db_id
  const dbProvNamesNorm = []; // Mảng chứa tên tỉnh đã chuẩn hóa từ DB để dùng fuzzysort
  let canThoDbProvObj = null; // Lưu đối tượng tỉnh Cần Thơ từ DB

  for (const p of provs) {
    const normalizedDbProvName = norm(p.name);
    provMap.set(normalizedDbProvName, p.id);
    dbProvNamesNorm.push(normalizedDbProvName);

    // Log chi tiết Cần Thơ (nếu có)
    if (p.id === CAN_THO_DB_ID || normalizedDbProvName === CAN_THO_NORM_NAME) {
        canThoDbProvObj = { id: p.id, name: p.name, normName: normalizedDbProvName };
        console.log(`[DEBUG provMap Cần Thơ] Tên gốc DB: "${p.name}" (ID: ${p.id}) -> Chuẩn hóa: "${normalizedDbProvName}"`);
    }
  }

  // Xác nhận provMap có chứa key "can tho" không
  console.log('--- Xác nhận provMap có key "can tho" không ---');
  if (provMap.has(CAN_THO_NORM_NAME)) {
      console.log(`✅ provMap.has('${CAN_THO_NORM_NAME}') là TRUE. ID: ${provMap.get(CAN_THO_NORM_NAME)}`);
  } else {
      console.log(`❌ provMap.has('${CAN_THO_NORM_NAME}') là FALSE. Key "${CAN_THO_NORM_NAME}" KHÔNG TỒN TẠI trong Map.`);
      const fuzzyKeys = fuzzysort.go(CAN_THO_NORM_NAME, Array.from(provMap.keys()), { limit: 5, threshold: 0.8 });
      if (fuzzyKeys.length > 0) {
          console.log('   Các key gần giống trong provMap:');
          fuzzyKeys.forEach(match => console.log(`   - "${match.target}" (Score: ${match.score.toFixed(2)})`));
      }
  }
  console.log('------------------------------------------------');


  const distByProvDbId = dists.reduce((m, d) => {
    (m[d.provinceId] = (m[d.provinceId] || [])).push({ ...d, n: norm(d.name) });
    return m;
  }, {});

  const wardByDistDbId = wards.reduce((m, w) => {
    (m[w.districtId] = (m[w.districtId] || [])).push({ ...w, n: norm(w.name) });
    return m;
  }, {});

  /* 2️⃣ Lấy dữ liệu Provinces từ VTP */
  let vtpProvinces = [];
  try {
    const { data } = await axios.get(
      'https://partner.viettelpost.vn/v2/categories/listProvinceById?provinceId=0',
      { headers: { Token: VTP_TOKEN } }
    );
    if (data && Array.isArray(data.data)) {
      vtpProvinces = data.data;
    } else {
      console.warn('⚠️ VTP Provinces API trả về định dạng dữ liệu không mong muốn. Dữ liệu:', util.inspect(data, { depth: null }));
    }
  } catch (error) {
    console.error('⚠️ Lỗi khi lấy dữ liệu tỉnh từ VTP API:', error.message);
    if (error.response) {
      console.error('Phản hồi lỗi VTP:', error.response.status, error.response.data);
    }
    db.end();
    return;
  }

  /* 3️⃣ Duyệt từng Province của VTP */
  const FUZZY_PROVINCE_THRESHOLD = 0.55; // Ngưỡng khớp cho tỉnh
  for (const p of vtpProvinces) {
    const normalizedVtpName = norm(p.PROVINCE_NAME);
    let dbProvId = null; // Khởi tạo null cho mỗi lần lặp

    // --- LOG DEBUG TỈNH ---
    const isCanThoVTP = (p.PROVINCE_ID === CAN_THO_VTP_ID); // VTP ID của Cần Thơ là 5
    if (isCanThoVTP) {
        console.log(`\n--- Xử lý tỉnh VTP: "${p.PROVINCE_NAME}" (VTP ID: ${p.PROVINCE_ID}, Norm: "${normalizedVtpName}") ---`);
        console.log(`[DEBUG Cần Thơ VTP] Tên VTP chuẩn hóa: "${normalizedVtpName}"`);
        console.log(`[DEBUG Cần Thơ DB ] Tên DB chuẩn hóa (dự kiến): "${canThoDbProvObj?.normName}" (ID: ${canThoDbProvObj?.id})`);
        if (normalizedVtpName === (canThoDbProvObj?.normName || '')) {
            console.log(`DEBUG: normalizedVtpName VÀ canThoDbProvObj.normName CÓ GIÁ TRỊ GIỐNG HỆT: "${normalizedVtpName}" (length ${normalizedVtpName.length})`);
        } else {
            console.log(`DEBUG: normalizedVtpName VÀ canThoDbProvObj.normName KHÁC NHAU. VTP:"${normalizedVtpName}" (length ${normalizedVtpName.length}), DB:"${canThoDbProvObj?.normName}" (length ${canThoDbProvObj?.normName?.length})`);
        }
    }
    // --- KẾT THÚC LOG DEBUG TỈNH ---

    // Cố gắng khớp chính xác trước
    dbProvId = provMap.get(normalizedVtpName);
    if (dbProvId) {
        if (isCanThoVTP) console.log(`✅ Khớp chính xác DB ID: ${dbProvId}`);
    } else {
        if (isCanThoVTP) console.log(`❌ KHÔNG khớp chính xác trong DB.`);
        // Thử khớp mờ nếu không khớp chính xác
        const fuzzyMatches = fuzzysort.go(normalizedVtpName, dbProvNamesNorm, { limit: 1, threshold: FUZZY_PROVINCE_THRESHOLD });
        if (fuzzyMatches.length > 0) {
            const bestMatch = fuzzyMatches[0];
            dbProvId = provMap.get(bestMatch.target); // Lấy ID từ key đã khớp mờ
            if (isCanThoVTP) console.log(`✅ Khớp mờ với DB key: "${bestMatch.target}" (Điểm: ${bestMatch.score.toFixed(2)}), DB ID: ${dbProvId}`);
        } else {
            if (isCanThoVTP) console.log(`❌ KHÔNG tìm thấy khớp mờ nào trong DB (Điểm dưới ${FUZZY_PROVINCE_THRESHOLD}).`);
        }
    }

    if (!dbProvId) { // Nếu sau cả khớp chính xác và khớp mờ vẫn không tìm thấy
      if (isCanThoVTP) {
        console.warn(`⚠️ Tỉnh VTP "${p.PROVINCE_NAME}" (VTP ID: ${p.PROVINCE_ID}) không tìm thấy ID khớp nào trong DB của bạn. Bỏ qua tỉnh này.`);
      }
      continue; // BỎ QUA TỈNH NÀY NẾU KHÔNG KHỚP
    }
    if (isCanThoVTP) console.log(`Tiếp tục xử lý huyện/xã cho tỉnh Cần Thơ (DB ID: ${dbProvId}).`);


    await db.execute(
      `REPLACE INTO providerprovinces
           (providerId, provinceId, providerProvinceCode, providerProvinceName)
           VALUES (?, ?, ?, ?)`,
      [PROVIDER_ID, dbProvId, p.PROVINCE_ID, p.PROVINCE_NAME]
    );

    /* 4️⃣ Lấy dữ liệu Districts từ VTP */
    let vtpDistsForProv = [];
    try {
      const response = await axios.get(
        `https://partner.viettelpost.vn/v2/categories/listDistrict?provinceId=${p.PROVINCE_ID}`,
        { headers: { Token: VTP_TOKEN } }
      );
      if (response.data && Array.isArray(response.data.data)) {
        vtpDistsForProv = response.data.data;
      } else {
        console.warn(`⚠️ VTP Districts API trả về định dạng dữ liệu không mong muốn cho tỉnh ${p.PROVINCE_ID} (${p.PROVINCE_NAME}). Dữ liệu:`, util.inspect(response.data, { depth: null }));
        vtpDistsForProv = [];
      }
    } catch (error) {
      console.error(`⚠️ Lỗi khi lấy dữ liệu huyện cho tỉnh ${p.PROVINCE_NAME} (VTP ID: ${p.PROVINCE_ID}) từ VTP API:`, error.message);
      if (error.response) {
        console.error('Phản hồi lỗi VTP (full):', util.inspect(error.response.data, { depth: null }));
      }
      vtpDistsForProv = [];
      continue;
    }

    const intDists = distByProvDbId[dbProvId] || [];
    if (!intDists.length) {
      if (isCanThoVTP) console.warn(`⛔ Tỉnh ${p.PROVINCE_NAME} (DB ID: ${dbProvId}) không có huyện nội bộ. (Đây là lỗi nếu bạn chắc chắn DB có huyện cho tỉnh này)`);
      continue;
    }

    const distNorm = intDists.map(x => x.n); // Tên huyện đã chuẩn hóa từ DB
    const dbDistObjects = intDists; // Giữ lại toàn bộ object huyện từ DB

    const FUZZY_DISTRICT_THRESHOLD = 0.55;
    for (const d of vtpDistsForProv) {
      const normalizedVtpDistName = norm(d.DISTRICT_NAME);
      const fuzzyMatchesDist = fuzzysort.go(normalizedVtpDistName, distNorm, { limit: 1, threshold: FUZZY_DISTRICT_THRESHOLD });
      const m = fuzzyMatchesDist[0] || {};
      
      let dbDistId = null;
      if (m.target) {
          const distIdx = distNorm.indexOf(m.target);
          const dbDist = dbDistObjects[distIdx];
          dbDistId = dbDist?.id;
      }

      // --- LOG DEBUG HUYỆN (Chỉ khi xử lý Cần Thơ hoặc có vấn đề) ---
      const isCanThoDistrict = (isCanThoVTP && (d.DISTRICT_NAME.includes('Cờ Đỏ') || d.DISTRICT_ID === 90)); // ID VTP của Huyện Cờ Đỏ là 90
      if (isCanThoVTP || !dbDistId || !m.target || (m.score || 0) < FUZZY_DISTRICT_THRESHOLD) { // Log nếu là Cần Thơ hoặc có lỗi
          console.log(`  --- Xử lý huyện VTP: "${d.DISTRICT_NAME}" (VTP ID: ${d.DISTRICT_ID}, Norm: "${normalizedVtpDistName}") ---`);
          if (m.target) {
              console.log(`  ✅ Huyện VTP "${d.DISTRICT_NAME}" khớp với DB ID: ${dbDistId} (Điểm: ${m.score?.toFixed(2) || 0}), Khớp DB: "${m.target}"`);
          } else {
              console.log(`  • Không khớp huyện: VTP "${d.DISTRICT_NAME}" → KHÔNG tìm thấy khớp nào trong DB (Điểm dưới ${FUZZY_DISTRICT_THRESHOLD}).`);
          }
          if (!dbDistId) {
            console.log(`  • Bỏ qua huyện này: dbDistId undefined (hoặc không khớp đủ tốt).`);
          }
      }
      // --- KẾT THÚC LOG DEBUG HUYỆN ---
      
      if (!dbDistId) {
        continue;
      }

      await db.execute(
        `REPLACE INTO providerdistricts
            (providerId, districtId, providerDistrictCode, providerDistrictName, provinceId)
            VALUES (?, ?, ?, ?, ?)`,
        [PROVIDER_ID, dbDistId, d.DISTRICT_ID, d.DISTRICT_NAME, dbProvId]
      );

      const intWards = wardByDistDbId[dbDistId] || [];
      const wardNorm = intWards.map(x => x.n);
      const batch = [];
      const FUZZY_WARD_THRESHOLD = 0.55; 

      /* 5️⃣ Lấy dữ liệu Wards (xã/phường) từ VTP */
      let vtpWardsForDist = [];
      try {
        const response = await axios.get(
          `https://partner.viettelpost.vn/v2/categories/listWards?districtId=${d.DISTRICT_ID}`,
          { headers: { Token: VTP_TOKEN } }
        );
        if (response.data && Array.isArray(response.data.data)) {
          vtpWardsForDist = response.data.data;
        } else {
          console.warn(`⚠️ VTP Wards API trả về định dạng dữ liệu không mong muốn cho huyện ${d.DistrictID} (${d.DistrictName}). Dữ liệu:`, util.inspect(response.data, { depth: 2 }));
          vtpWardsForDist = [];
        }
      } catch (error) {
        console.error(`⚠️ Lỗi khi lấy dữ liệu xã/phường cho huyện ${d.DISTRICT_NAME} (VTP ID: ${d.DistrictID}) từ VTP API:`, error.message);
        if (error.response) {
          console.error('Phản hồi lỗi VTP (full):', util.inspect(error.response.data, { depth: null }));
        }
        vtpWardsForDist = [];
        continue;
      }

      for (const w of vtpWardsForDist) {
        const normalizedVtpWardName = norm(w.WARDS_NAME);
        const fuzzyMatchesWard = fuzzysort.go(normalizedVtpWardName, wardNorm, { limit: 1, threshold: FUZZY_WARD_THRESHOLD });
        const m2 = fuzzyMatchesWard[0] || {};
        
        let dbWardId = null;
        if (m2.target) {
            const wardIdx = wardNorm.indexOf(m2.target);
            const dbWard = intWards[wardIdx];
            dbWardId = dbWard?.id;
        }

        // --- LOG GỠ LỖI KHỚP XÃ/PHƯỜNG --- (Chỉ in ra khi là Cần Thơ hoặc có lỗi)
        const isCanThoWard = (isCanThoDistrict && (w.WARDS_NAME.includes('Cờ Đỏ') || w.WARDS_ID === 1333)); // ID VTP của TT Cờ Đỏ là 1333
        if (isCanThoWard || !dbWardId || !m2.target || (m2.score || 0) < FUZZY_WARD_THRESHOLD) {
             console.log(`   [DEBUG WARD MATCH] VTP: "${w.WARDS_NAME}" (Norm: "${normalizedVtpWardName}", VTP ID: ${w.WARDS_ID})`);
             if (m2.target) {
                 console.log(`     -> Khớp DB: "${m2.target}" (DB ID: ${dbWardId || 'Không tìm thấy'}, Score: ${m2.score?.toFixed(2) || '0.00'})`);
             } else {
                 console.log(`     -> KHÔNG tìm thấy khớp trong DB.`);
             }
             if (!dbWardId || (m2.score || 0) < FUZZY_WARD_THRESHOLD) {
                console.log(`     -> Bỏ qua: Điểm khớp (${m2.score?.toFixed(2) || '0.00'}) dưới ngưỡng ${FUZZY_WARD_THRESHOLD} hoặc dbWardId undefined.`);
             }
        }
        // --- KẾT THÚC LOG GỠ LỖI KHỚP XÃ/PHƯỜNG ---

        if (!dbWardId) {
          continue;
        }

        batch.push([
          PROVIDER_ID,
          dbWardId,
          w.WARDS_ID,
          w.WARDS_NAME,
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
      } else {
        // console.log(`[DEBUG VTP] Batch xã/phường rỗng cho huyện DB ID ${dbDistId} (Huyện VTP ID ${d.DistrictID})`);
      }
    }
  }

  console.timeEnd('⏳ VTP import');

  /* thống kê */
  const [[pc]] = await db.query('SELECT COUNT(*) c FROM providerprovinces WHERE providerId = ?', [PROVIDER_ID]);
  const [[dc]] = await db.query('SELECT COUNT(*) c FROM providerdistricts WHERE providerId = ?', [PROVIDER_ID]);
  const [[wc]] = await db.query('SELECT COUNT(*) c FROM providerwards WHERE providerId = ?', [PROVIDER_ID]);
  console.log(`🎯 VTP: ${pc.c} tỉnh | ${dc.c} huyện | ${wc.c} xã`);

  db.end();
})();