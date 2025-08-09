require('dotenv').config();
const { Sequelize } = require('sequelize');
const fs = require('fs');

const connection = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'mysql',
    logging: false,
    dialectOptions: {
      ssl: {
        // Đọc CA certificate từ file tải về Aiven
        ca: fs.readFileSync(__dirname + '/certs/ca.pem')
      },
      connectTimeout: 60000 // 60 giây
    },
    pool: {
      max: 10,
      min: 0,
      acquire: 60000,
      idle: 10000
    }
  }
);

connection.authenticate()
  .then(() => console.log('✅ Kết nối MySQL thành công!'))
  .catch((err) => console.error('❌ Lỗi kết nối MySQL:', err));

module.exports = connection;
