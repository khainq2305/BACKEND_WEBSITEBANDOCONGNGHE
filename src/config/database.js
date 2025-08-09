require('dotenv').config();
const { Sequelize } = require('sequelize');

const connection = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: 'postgres', // 🔹 đổi từ mysql -> postgres
    logging: false,
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false
      }
    }
  }
);

connection.authenticate()
  .then(() => console.log('✅ Kết nối PostgreSQL thành công!'))
  .catch((err) => console.error('❌ Lỗi kết nối PostgreSQL:', err));

module.exports = connection;
