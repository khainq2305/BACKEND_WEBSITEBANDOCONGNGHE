const axios = require('axios');
const mysql = require('mysql2/promise');

const GHN_TOKEN = 'd66cf435-f4ac-11ef-ac14-f2515dcc8e8f';
const SHOP_ID = 3677180;

const api = axios.create({
  baseURL: 'https://online-gateway.ghn.vn/shiip/public-api',
  headers: {
    'Token': GHN_TOKEN,
    'ShopId': SHOP_ID,
  },
});

const importData = async () => {
  const connection = await mysql.createConnection({
    host: 'localhost',
    user: 'root',
    password: 'mysql',
    database: 'duantotnghiep',
  });

  // Clear tables (nếu muốn reset lại)
  await connection.query('DELETE FROM wards');
  await connection.query('DELETE FROM districts');
  await connection.query('DELETE FROM provinces');

  // Step 1: Provinces
  const provincesRes = await api.get('/master-data/province');
  const provinces = provincesRes.data.data;
  for (const p of provinces) {
    await connection.query('INSERT INTO provinces (id, name) VALUES (?, ?)', [p.ProvinceID, p.ProvinceName]);

    // Step 2: Districts in each province
    const districtsRes = await api.post('/master-data/district', { province_id: p.ProvinceID });
    const districts = districtsRes.data.data;

    for (const d of districts) {
      await connection.query('INSERT INTO districts (id, name, provinceId) VALUES (?, ?, ?)', [d.DistrictID, d.DistrictName, p.ProvinceID]);

      // Step 3: Wards in each district
    const wardsRes = await api.post('/master-data/ward', { district_id: d.DistrictID });
console.log('👉 wardsRes:', wardsRes.data); // THÊM DÒNG NÀY để xem structure

const wards = wardsRes.data.data;

if (!Array.isArray(wards)) {
  console.warn(`❌ Không có wards hợp lệ cho district_id = ${d.DistrictID}`);
  continue; // Bỏ qua district này nếu không có dữ liệu wards
}

for (const w of wards) {
  await connection.query(
    'INSERT INTO wards (code, name, districtId) VALUES (?, ?, ?)',
    [w.WardCode, w.WardName, d.DistrictID]
  );
}

     
    }
  }

  await connection.end();
  console.log('✅ Import xong toàn bộ dữ liệu từ GHN!');
};

importData();
