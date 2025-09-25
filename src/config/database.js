require("dotenv").config();
const { Sequelize } = require("sequelize");

const connection = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    dialect: "mysql",
    logging: false,
    dialectOptions: {
      connectTimeout: 120000, // tăng lên 120s
    },
    pool: {
      max: 50,      // tối đa 50 connection đồng thời
      min: 5,       // giữ 5 connection "ấm"
      acquire: 120000, // tối đa 120s chờ lấy connection
      idle: 60000,  // connection idle >60s mới dọn
      evict: 60000, // quét pool mỗi 60s
    },
    retry: {
      max: 5, // cho retry nhiều hơn
    },
  }
);

connection
  .authenticate()
  .then(() => console.log("✅ Kết nối MySQL thành công!"))
  .catch((err) => console.error("❌ Lỗi kết nối MySQL:", err));

module.exports = connection;
