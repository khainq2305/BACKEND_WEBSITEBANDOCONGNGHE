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
      max: 20,
      min: 2,          // luôn giữ vài connection ấm
      acquire: 60000,
      idle: 30000,     // 30s thay vì 10s
      evict: 1000,     // clear connection rác mỗi giây
    },
    retry: {
      max: 3,          // auto retry query nếu connection drop
    },
  }
);


connection
  .authenticate()
  .then(() => console.log("✅ Kết nối MySQL thành công!"))
  .catch((err) => console.error("❌ Lỗi kết nối MySQL:", err));

module.exports = connection;
