require('dotenv').config();
const { Sequelize } = require('sequelize');

const connection = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT, // <--- thêm dòng này
    dialect: 'mysql',
    logging: false,
    // Nếu Railway yêu cầu SSL:
    // dialectOptions: {
    //   ssl: {
    //     require: true,
    //     rejectUnauthorized: false
    //   }
    // }
  }
);

connection.authenticate()
  .then(() => console.log('✅ Kết nối MySQL thành công!'))
  .catch((err) => console.error('❌ Lỗi kết nối MySQL:', err));

module.exports = connection;
