require('dotenv').config();
const { Sequelize } = require('sequelize');

const connection = new Sequelize(process.env.DB_NAME, process.env.DB_USER, process.env.DB_PASS, {
  host: process.env.DB_HOST,
  dialect: 'mysql',
  logging: false,
});

connection.authenticate()
  .then(() => console.log(' Kết nối MySQL thành công!'))
  .catch((err) => console.error(' Lỗi kết nối MySQL:', err));

module.exports = connection;