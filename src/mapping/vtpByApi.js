/* eslint-disable no-console */
/**
 * Viettel Post → provinces / districts / wards   (providerId = 1)
 * ----------------------------------------------------------------
 * ▸ Node ≥18 (CommonJS) – KHÔNG cần "type": "module"
 * ▸ fuzzysort v2.x
 *
 * Env:
 * DB_HOST | DB_PORT | DB_USER | DB_PASS | DB_NAME
 * VTP_TOKEN  – Bearer token Viettel Post
 */

require('dotenv').config();
const axios      = require('axios');
const mysql      = require('mysql2/promise');
const fuzzysort  = require('fuzzysort'); // <--- Đã thay thế fast-fuzzy bằng fuzzysort

/* ───────── helpers ───────── */
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* chuẩn hoá: bỏ dấu, ký tự lạ, gộp space, in hoa */
const normalize = s => (s || '')
  .normalize('NFD') // Tách ký tự có dấu thành ký tự cơ bản và dấu phụ
  .replace(/[\u0300-\u036f]/g, '') // Loại bỏ dấu phụ (như ´, ` , ̉, ̃,̣ )
  .replace(/đ/g, 'd') // Thay thế 'đ' thường thành 'd'
  .replace(/Đ/g, 'D') // Thay thế 'Đ' hoa thành 'D'
  .replace(/[^a-zA-Z0-9\s]/g, ' ') // Giữ lại chữ cái (a-zA-Z), số (0-9) và khoảng trắng. Loại bỏ tất cả ký tự khác.
  .replace(/\s+/g, ' ') // Gộp nhiều khoảng trắng thành một
  .trim() // Xóa khoảng trắng đầu cuối
  .toUpperCase(); // Chuyển tất cả thành chữ hoa

/* cắt tiền tố hành chính cho Ward */
const stripPrefixWard = name =>
  name.replace(
    /^(Phường|P\.?|Xã|X\.?|Thị\s*trấn|TT\.?|Đại\s*lộ|ĐL\.?)(\s+|$)/i, // Đã thêm "Đại lộ" và "ĐL.?"
    '',
  ).trim();

/* cắt tiền tố hành chính cho District */
const stripPrefixDist = name =>
  name.replace(
    /^(Quận|Q\.?|Huyện|H\.?|Thị\s*xã|TX\.?|Thành\s*phố|TP\.?)(\s+|$)/i,
    '',
  ).trim();

/* undefined → NULL */
const safe = v => (v === undefined ? null : v);

/* Fuzzy best match - Sử dụng Fuzzysort */
const findBestMatchObject = (needle, haystackObjects, keyToSearch, minScore = -6000, stripCb = null) => { // minScore mặc định của fuzzysort là -6000
    // Chuẩn bị các đối tượng để fuzzysort tìm kiếm trên trường 'name' đã được tiền xử lý
    const targets = haystackObjects.map(obj => {
        const rawValue = String(obj[keyToSearch] || '');
        const strippedValue = stripCb ? stripCb(rawValue) : rawValue;
        // Fuzzysort xử lý chuẩn hóa và bỏ dấu nội bộ rất tốt, chỉ cần cung cấp chuỗi đã bỏ tiền tố
        return {
            originalObj: obj, // Giữ đối tượng gốc
            searchableName: normalize(strippedValue) // Chuỗi đã chuẩn hóa để fuzzysort tìm kiếm
        };
    });

    const results = fuzzysort.go(normalize(stripCb ? stripCb(needle) : needle), targets, {
        key: 'searchableName', // Tìm kiếm trên trường 'searchableName' của các đối tượng targets
        limit: 1, // Chỉ cần kết quả tốt nhất
        threshold: minScore // Ngưỡng điểm của fuzzysort
    });

    if (results.length > 0 && results[0].score > minScore) { // Kiểm tra score lớn hơn ngưỡng
        // --- DEBUG CHI TIẾT fuzzysort ---
        console.log(`     🔍 Fuzzysort match for "${normalize(stripCb ? stripCb(needle) : needle)}" (Threshold: ${minScore}):`);
        console.log(`       - Match: "${results[0].obj.searchableName}" (Score: ${results[0].score})`);
        // --- KẾT THÚC DEBUG CHI TIẾT ---
        return results[0].obj.originalObj; // Trả về đối tượng gốc đã khớp
    } else {
        console.log(`     🔍 No fuzzysort match found for "${normalize(stripCb ? stripCb(needle) : needle)}". Best score: ${results.length ? results[0].score : 'N/A'}`);
    }
    return null; // Không tìm thấy khớp
};


/* ───────── main ───────── */
(async () => {
  /* 1️⃣  MySQL */
  const db = await mysql.createConnection({
    host    : process.env.DB_HOST,
    port    : process.env.DB_PORT,
    user    : process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    charset : 'utf8mb4',
  });
  const q = (sql, p) => db.execute(sql, p);
  console.log('✅  MySQL connected');

  /* 2️⃣  bảng chuẩn - ENHANCED FILTERING AND TYPE CASTING FOR IDs */
  const [provRows] = await q('SELECT id, name FROM provinces WHERE id IS NOT NULL');
  const [distRows] = await q('SELECT id, name, provinceId FROM districts WHERE id IS NOT NULL');
  const [wardRows] = await q('SELECT id, name, districtId FROM wards WHERE id IS NOT NULL');

  const provinceIdByName = Object.fromEntries(
    provRows
      .filter(p => p.id !== null && p.id !== undefined)
      .map(p => [normalize(p.name), Number(p.id)]), // Ép kiểu id thành Number
  );
  
  // Đảm bảo chỉ lấy id và name, lọc kỹ để tránh undefined ID, và ÉP KIỂU ID thành Number
  // Sử dụng vòng lặp for...of để kiểm soát chặt chẽ việc tạo mảng đối tượng
  const districtsOfProv = pid => {
    const filteredDistricts = [];
    for (const d of distRows) {
      if (d.provinceId === pid && d.id !== null && d.id !== undefined) {
        filteredDistricts.push({ id: Number(d.id), name: d.name });
      }
    }
    return filteredDistricts;
  };

  const wardsOfDist = did => {
    const filteredWards = [];
    for (const w of wardRows) {
      if (w.districtId === did && w.id !== null && w.id !== undefined) {
        filteredWards.push({ id: Number(w.id), name: w.name });
      }
    }
    return filteredWards;
  };

  /* 3️⃣  VTP axios */
  const vtp = axios.create({
    baseURL: 'https://partner.viettelpost.vn/v2/categories',
    headers: { Authorization: `Bearer ${process.env.VTP_TOKEN}` },
    timeout: 15_000,
  });

  /* 4️⃣  provinces */
  const provincesRes = await vtp.get('/listProvince');
  const provinces    = provincesRes?.data?.data ?? [];

  // --- DEBUGGING FOR PROVINCES ---
  console.log('--- Debugging Provinces ---');
  if (provRows.length === 0) {
      console.log('⚠️  Your `provinces` table is empty. Please ensure it contains data.');
  } else {
      console.log(`Loaded ${provRows.length} provinces from DB.`);
      console.log(`Sample normalized DB provinces: ${Object.keys(provinceIdByName).slice(0, Math.min(Object.keys(provinceIdByName).length, 5)).join(', ')}${Object.keys(provinceIdByName).length > 5 ? '...' : ''}`);
  }
  console.log('---------------------------');


  for (const pv of provinces) {
    // Debugging VTP Province name before lookup
    const nrmProvNameViettel = normalize(pv.PROVINCE_NAME);
    console.log(`\n➤ Processing Province (VTP): Original: "${pv.PROVINCE_NAME}" -> Normalized: "${nrmProvNameViettel}"`);

    const provStdId = provinceIdByName[nrmProvNameViettel];
    if (!provStdId) {
      console.log(`⚠️  Province miss: ${pv.PROVINCE_NAME} (Normalized: "${nrmProvNameViettel}") not found in your DB.`);
      continue;
    }
    console.log(`  ✅ Province matched: "${pv.PROVINCE_NAME}" (VTP ID: ${pv.PROVINCE_ID}) mapped to DB ID: ${provStdId}`);


    /* districts */
    const distRes   = await vtp.get(`/listDistrict?provinceId=${pv.PROVINCE_ID}`);
    const districts = distRes?.data?.data ?? [];

    const stdDists = districtsOfProv(provStdId); // stdDists giờ là mảng các { id: Number, name: String }
    
    // --- Bổ sung DEBUG cho stdDists ngay tại đây ---
    console.log(`   Debug raw stdDists for Province ${pv.PROVINCE_NAME} (ID: ${provStdId}):`);
    if (stdDists.length > 0) {
        stdDists.slice(0, Math.min(stdDists.length, 5)).forEach(d => {
            console.log(`     - DB District Obj: ${JSON.stringify(d)}`);
        });
    } else {
        console.log(`     (No districts loaded for this province from DB after filtering)`);
    }
    // --- Kết thúc Debug cho stdDists ---

    // Ngưỡng điểm cho District (Fuzzysort scores typically range from -1000 to 0)
    // -6000 là mặc định, -10000 hoặc thấp hơn để linh hoạt hơn nếu cần
    const thresholdDist = -1500; // Có thể điều chỉnh, -1500 đến -2000 là mức khởi đầu hợp lý

    // --- DEBUGGING FOR DB DISTRICTS ---
    if (stdDists.length === 0) {
        console.log(`   ⚠️  DB for Province "${pv.PROVINCE_NAME}" (DB ID: ${provStdId}) has NO DISTRICTS loaded. Check your districts table for this province!`);
    } else {
        console.log(`   Loaded ${stdDists.length} districts for "${pv.PROVINCE_NAME}" (DB ID: ${provStdId}) from DB.`);
        // Uncomment below to see all normalized DB district names for this province for detailed comparison if needed
        /*
        console.log(`   Debug DB Districts for comparison:`);
        stdDists.forEach(dObj => { // Sử dụng dObj.name và dObj.id để đảm bảo lấy đúng giá trị từ đối tượng
            const nrmDistNameDB = normalize(stripPrefixDist(dObj.name));
            console.log(`     - Original: "${dObj.name}" (ID: ${dObj.id}) -> Normalized Stripped: "${nrmDistNameDB}"`);
        });
        */
    }
    // --- END DEBUGGING FOR DB DISTRICTS ---


    for (const d of districts) {
      const rawName = d.DISTRICT_NAME?.trim();
      if (!rawName) continue;

      const code = d.DISTRICT_CODE || String(d.DISTRICT_ID);

      // --- DEBUGGING FOR VTP DISTRICTS ---
      const nrmDistNameViettel = normalize(stripPrefixDist(rawName));
      console.log(`   ➤ Processing District (VTP): Original: "${rawName}" -> Normalized Stripped: "${nrmDistNameViettel}"`);
      // --- END DEBUGGING FOR VTP DISTRICTS ---

      // Sử dụng findBestMatchObject mới
      const matchedDbDistrict = findBestMatchObject(rawName, stdDists, 'name', thresholdDist, stripPrefixDist);
      
      let matchedDbDistrictId = null;
      let matchedDbDistrictName = null;

      if (!matchedDbDistrict) { // Nếu không tìm thấy đối tượng khớp
        console.log(`   ❌  District miss: ${rawName} (Normalized: "${nrmDistNameViettel}") ⇔ Gợi ý gần nhất: không có`);
        continue;
      } else {
        matchedDbDistrictId = matchedDbDistrict.id;
        matchedDbDistrictName = matchedDbDistrict.name;
        // Kiểm tra lại để đảm bảo ID hợp lệ (mặc dù đã lọc ở districtsOfProv)
        if (matchedDbDistrictId === null || matchedDbDistrictId === undefined) {
           console.log(`   ⚠️  District matched by name, but DB ID is invalid for: "${rawName}" (VTP ID: ${d.DISTRICT_ID}). DB object: ${JSON.stringify(matchedDbDistrict)}. Skipping.`);
           continue;
        }
      }

      // Log the matched DB name to confirm it's valid
      console.log(`   ✅ District matched: "${rawName}" (VTP ID: ${d.DISTRICT_ID}) mapped to DB ID: ${matchedDbDistrictId} ("${matchedDbDistrictName}")`);


      await q(
        `INSERT INTO providerDistricts
           (providerId, districtId, provinceId,
            providerDistrictCode, providerDistrictName)
         VALUES (1, ?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           districtId           = VALUES(districtId),
           provinceId           = VALUES(provinceId),
           providerDistrictName = VALUES(providerDistrictName)`,
        [
          safe(matchedDbDistrictId), // Sử dụng ID đã được xác nhận
          safe(provStdId),
          safe(code),
          safe(rawName),
        ],
      );

      /* wards */
      const wardRes = await vtp.get(`/listWards?districtId=${d.DISTRICT_ID}`);
      const wards   = wardRes?.data?.data ?? [];

      const stdWards  = wardsOfDist(matchedDbDistrictId); // stdWards giờ là mảng các { id: Number, name: String }
      
      // Ngưỡng điểm cho Ward
      const thresholdWard = -2000; // Có thể điều chỉnh, Fuzzysort thường cần ngưỡng âm

      // --- DEBUGGING FOR DB WARDS ---
      if (stdWards.length === 0) {
          console.log(`       ⚠️  DB for District "${rawName}" (DB ID: ${matchedDbDistrictId}) has NO WARDS loaded. Check your wards table for this district!`);
      } else {
          console.log(`       Loaded ${stdWards.length} wards for "${rawName}" (DB ID: ${matchedDbDistrictId}) from DB.`);
          // Uncomment below to see all normalized DB ward names for this district for detailed comparison
          /*
          console.log(`       Debug DB Wards for comparison:`);
          stdWards.forEach(wObj => { // Sử dụng wObj.name và wObj.id để đảm bảo lấy đúng giá trị từ đối tượng
              const nrmWNameDB = normalize(stripPrefixWard(wObj.name));
              console.log(`         - Original: "${wObj.name}" (ID: ${wObj.id}) -> Normalized Stripped: "${nrmWNameDB}"`);
          });
          */
      }
      // --- END DEBUGGING FOR DB WARDS ---


      for (const w of wards) {
        const wName = w.WARDS_NAME?.trim();
        if (!wName) continue;

        const wCode = w.WARDS_CODE || String(w.WARDS_ID);

        // --- DEBUGGING FOR VTP WARDS ---
        const nrmWNameViettel = normalize(stripPrefixWard(wName));
        console.log(`       ➤ Processing Ward (VTP): Original: "${wName}" -> Normalized Stripped: "${nrmWNameViettel}"`);
        // --- END DEBUGGING FOR VTP WARDS ---

        // Sử dụng findBestMatchObject mới cho wards
        const matchedDbWard = findBestMatchObject(wName, stdWards, 'name', thresholdWard, stripPrefixWard);
        
        let matchedDbWardId = null;
        let matchedDbWardName = null;

        if (!matchedDbWard) { // Nếu không tìm thấy đối tượng khớp
          console.log(`       ❌  Ward miss: ${wName} (Normalized: "${nrmWNameViettel}") ⇔ Gợi ý gần nhất: không có`);
          continue;
        } else {
          matchedDbWardId = matchedDbWard.id;
          matchedDbWardName = matchedDbWard.name;
          // Kiểm tra lại để đảm bảo ID hợp lệ
          if (matchedDbWardId === null || matchedDbWardId === undefined) {
             console.log(`       ⚠️  Ward matched by name, but DB ID is invalid for: "${wName}" (VTP ID: ${w.WARDS_ID}). DB object: ${JSON.stringify(matchedDbWard)}. Skipping.`);
             continue;
          }
        }
        // stdWIds[wIdx] và stdWNames[wIdx] giờ sẽ an toàn hơn do đã được ép kiểu và tạo mảng từ stdWards chuẩn hóa
        console.log(`       ✅ Ward matched: "${wName}" (VTP ID: ${w.WARDS_ID}) mapped to DB ID: ${matchedDbWardId} ("${matchedDbWardName}")`);


        await q(
          `INSERT INTO providerWards
             (providerId, wardId, districtId,
              providerWardCode, providerWardName)
           VALUES (1, ?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             wardId           = VALUES(wardId),
             districtId       = VALUES(districtId),
             providerWardName = VALUES(providerWardName)`,
          [
            safe(matchedDbWardId), // Sử dụng ID đã được xác nhận
            safe(matchedDbDistrictId),   // Sử dụng ID huyện/quận đã được xác nhận
            safe(wCode),
            safe(wName),
          ],
        );
      }

      await sleep(200); // throttle
    }

    console.log(`✅  Done districts (& wards) of ${pv.PROVINCE_NAME}`);
    await sleep(300);
  }

  console.log('🎉  Hoàn tất mapping District + Ward Viettel Post!');
  await db.end();
})().catch(err => {
  console.error('💥  ERROR:', err);
  process.exit(1);
});