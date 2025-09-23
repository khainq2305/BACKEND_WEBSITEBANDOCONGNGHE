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
      connectTimeout: 60000,
    },
    pool: {
      max: 20, // tối đa 20 connection đồng thời
      min: 2, // giữ 2 connection "ấm", không cần tới 5
      acquire: 60000, // tối đa 60s chờ lấy connection
      idle: 30000, // connection idle >30s thì dọn
      evict: 30000, // quét pool mỗi 30s, đồng bộ với idle
    },
    retry: {
      max: 3, // retry vừa phải, tránh spam
    },
  }
);

connection
  .authenticate()
  .then(() => console.log("✅ Kết nối MySQL thành công!"))
  .catch((err) => console.error("❌ Lỗi kết nối MySQL:", err));

module.exports = connection;
