/**
 * Seed 63 tỉnh – huyện – xã (GSO) vào:
 * Provinces(id, name)
 * Districts(id, name, provinceId)
 * Wards(id, name, districtId)
 *
 * Cách dùng:
 * 1. Đặt 3 file Excel cùng thư mục:
 * provinces.xlsx   // từ DS_TINH.xlsx
 * districts.xlsx   // DS_HUYEN.xlsx
 * wards.xlsx       // DS_XA.xlsx
 * 2. npm i dotenv xlsx mysql2
 * 3. .env phải có DB_HOST, DB_PORT, DB_USER, DB_PASS, DB_NAME
 * 4. node seedVn.js
 *
 * LƯU Ý QUAN TRỌNG: Script này dùng 'Mã' từ Excel làm ID trong database.
 * Đảm bảo các bảng provinces, districts, wards đã được tạo với cột 'id' KHÔNG phải AUTO_INCREMENT.
 * Script tự động bỏ qua các dòng không có Mã hợp lệ (ví dụ: dòng 'Số lượng' hoặc ô trống).
 * CÓ THÊM NHIỀU LOG ĐỂ GỠ LỖI NAN.
 */

require('dotenv').config();
const xlsx = require('xlsx');
const mysql = require('mysql2/promise');

/* đọc sheet đầu tiên thành JSON (không lọc ở đây nữa) */
const sheetJson = file => {
  const wb = xlsx.readFile(file);
  const sheet = wb.Sheets[wb.SheetNames[0]];
  return xlsx.utils.sheet_to_json(sheet);
};

(async () => {
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    port: +process.env.DB_PORT || 3306,
    user: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    charset: 'utf8mb4',
  });

  console.time('Seed');

  // TRUNCATE CÁC BẢNG ĐỂ ĐẢM BẢO DỮ LIỆU SẠCH
  await db.query('SET FOREIGN_KEY_CHECKS = 0;'); // Tắt kiểm tra khóa ngoại tạm thời
  await db.query('TRUNCATE TABLE wards;');
  await db.query('TRUNCATE TABLE districts;');
  await db.query('TRUNCATE TABLE provinces;');
  await db.query('SET FOREIGN_KEY_CHECKS = 1;'); // Bật lại kiểm tra khóa ngoại
  console.log('Đã truncate các bảng: provinces, districts, wards');


  /* 1️⃣ Provinces ---------------------------------------------------- */
  const provsRawData = sheetJson('provinces.xlsx');
  const provsData = provsRawData.filter((row, index) => {
    const isValid = row.Mã !== undefined && !isNaN(parseInt(row.Mã, 10));
    if (!isValid) {
      console.warn(`[LỌC PROV] Dòng ${index + 2} (Excel): 'Mã' không hợp lệ. Mã=${row.Mã}, Tên=${row.Tên}`);
    }
    return isValid;
  });
  const provBatch = [];
  for (const { Mã, Tên } of provsData) {
    provBatch.push([parseInt(Mã, 10), Tên]);
  }
  if (provBatch.length) {
    await db.query('INSERT INTO Provinces (id, name) VALUES ?', [provBatch]);
  }
  console.log(`Đã seed ${provsData.length} Provinces (Tổng số dòng Excel: ${provsRawData.length})`);


  /* 2️⃣ Districts ---------------------------------------------------- */
  const distsRawData = sheetJson('districts.xlsx');
  const distsData = distsRawData.filter((row, index) => {
    const isValid = row.Mã !== undefined && !isNaN(parseInt(row.Mã, 10)) &&
                    row['Mã TP'] !== undefined && !isNaN(parseInt(row['Mã TP'], 10));
    if (!isValid) {
      console.warn(`[LỌC DIST] Dòng ${index + 2} (Excel): 'Mã' hoặc 'Mã TP' không hợp lệ. Mã=${row.Mã}, Mã TP=${row['Mã TP']}, Tên=${row.Tên}`);
    }
    return isValid;
  });
  const distBatch = [];
  for (const { Mã, 'Mã TP': MaTinh, Tên } of distsData) {
    distBatch.push([parseInt(Mã, 10), Tên, parseInt(MaTinh, 10)]);
  }
  if (distBatch.length) {
    await db.query('INSERT INTO Districts (id, name, provinceId) VALUES ?', [distBatch]);
  }
  console.log(`Đã seed ${distsData.length} Districts (Tổng số dòng Excel: ${distsRawData.length})`);


  /* 3️⃣ Wards (batch 1 000) ---------------------------------------- */
  // LƯU Ý: ĐÃ SỬA TÊN CỘT TỪ 'Mã Huyện' THÀNH 'Mã QH' ĐỂ KHỚP VỚI EXCEL CỦA BẠN
  const wardsRawData = sheetJson('wards.xlsx');
  console.log(`Tổng số dòng trong wards.xlsx trước lọc: ${wardsRawData.length}`);

  const wardsData = wardsRawData.filter((row, index) => {
    const isMaValid = row.Mã !== undefined && !isNaN(parseInt(row.Mã, 10));
    // ĐÃ SỬA TÊN CỘT Ở ĐÂY TỪ 'Mã Huyện' THÀNH 'Mã QH'
    const isMaHuyenValid = row['Mã QH'] !== undefined && !isNaN(parseInt(row['Mã QH'], 10));

    if (!isMaValid) {
      console.warn(`[LỌC WARD] Dòng ${index + 2} (Excel): 'Mã' không hợp lệ. Mã=${row.Mã}, Tên=${row.Tên}`);
    }
    if (!isMaHuyenValid) {
      console.warn(`[LỌC WARD] Dòng ${index + 2} (Excel): 'Mã QH' không hợp lệ. Mã QH=${row['Mã QH']}, Tên=${row.Tên}`);
    }
    return isMaValid && isMaHuyenValid;
  });

  console.log(`Tổng số dòng Wards sau khi lọc: ${wardsData.length}`);

  const wardBatch = [];
  for (const { Mã, 'Mã QH': MaHuyen, Tên } of wardsData) { // ĐÃ SỬA TÊN CỘT Ở ĐÂY
    wardBatch.push([parseInt(Mã, 10), Tên, parseInt(MaHuyen, 10)]);
    if (wardBatch.length === 1000) {
      await db.query('INSERT INTO Wards (id, name, districtId) VALUES ?', [wardBatch]);
      wardBatch.length = 0;
    }
  }
  if (wardBatch.length) {
    await db.query('INSERT INTO Wards (id, name, districtId) VALUES ?', [wardBatch]);
  }
  console.log(`Đã seed ${wardsData.length} Wards (Tổng số dòng Excel hợp lệ sau lọc)`);


  console.timeEnd('Seed');
  console.log('✅ Đã seed xong tất cả các đơn vị hành chính!');
  await db.end();
})();