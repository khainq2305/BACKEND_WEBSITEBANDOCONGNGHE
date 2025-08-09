const mysql = require('mysql2/promise');

(async () => {
  const config = {
    host: 'crossover.proxy.rlwy.net', // host từ Railway
    port: 38195, // port từ Railway
    user: 'root', // user từ Railway
    password: 'lFizwSfXEmhptnvGsuuhLJySCmfPLvAv', // password từ Railway
    database: 'railway', // database name từ Railway
    connectTimeout: 20000 // 20 giây
  };

  try {
    console.log('⏳ Đang thử kết nối MySQL...');
    const connection = await mysql.createConnection(config);
    console.log('✅ Kết nối thành công!');

    const [rows] = await connection.query('SELECT NOW() AS now');
    console.log('🕒 Thời gian server MySQL:', rows[0].now);

    await connection.end();
  } catch (err) {
    console.error('❌ Lỗi kết nối MySQL:', err.message);
  }
})();
