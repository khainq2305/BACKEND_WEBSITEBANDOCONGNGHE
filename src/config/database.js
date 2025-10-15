// db/connection.js
require("dotenv").config();
const { Sequelize } = require("sequelize");

const sequelize = new Sequelize(
  process.env.DB_NAME,
  process.env.DB_USER,
  process.env.DB_PASS,
  {
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 3306,
    dialect: "mysql",
    logging: false,

    // Giữ kết nối sống + nới timeout bắt tay
    dialectOptions: {
      connectTimeout: 120000,       // 120s cho handshake
      enableKeepAlive: true,        // bật TCP keep-alive
      keepAliveInitialDelay: 0,     // gửi keep-alive sớm
      supportBigNumbers: true,
      bigNumberStrings: false,
      decimalNumbers: true,
      // multipleStatements: false,  // (giữ mặc định an toàn)
    },

    // Pool “vừa đủ”: tránh 50 connection gây nghẽn hoặc bị DB cắt
    pool: {
      max: 20,          // 50 hơi cao trừ khi DB rất khỏe
      min: 2,
      acquire: 120000,  // tối đa 120s chờ lấy connection
      idle: 60000,      // idle >60s thì thu hồi
      evict: 60000,     // quét pool mỗi 60s
    },

    // Retry hợp lý cho lỗi mạng tạm thời
    retry: {
      max: 3,
      match: [
        /SequelizeConnectionError/,
        /SequelizeConnectionRefusedError/,
        /SequelizeHostNotFoundError/,
        /SequelizeHostNotReachableError/,
        /SequelizeInvalidConnectionError/,
        /SequelizeConnectionTimedOutError/,
        /ETIMEDOUT/,
        /ECONNRESET/,
        /EAI_AGAIN/,
        /PROTOCOL_CONNECTION_LOST/,
      ],
    },

    // (tuỳ chọn) timezone logic nếu bạn cần DATETIME theo local
    timezone: "+07:00",
  }
);

// Kết nối thử một lần khi boot
sequelize
  .authenticate()
  .then(() => console.log("✅ Kết nối MySQL thành công!"))
  .catch((err) => console.error("❌ Lỗi kết nối MySQL:", err?.message || err));

/**
 * LƯU Ý QUAN TRỌNG:
 * - ĐỪNG tạo thêm mysql2.createConnection() ở file khác.
 * - Ở mọi nơi cần DB, chỉ `require('../db/connection')`.
 * - Không gọi sequelize.close() trong luồng request.
 * - Nếu dùng PM2 cluster, mỗi process vẫn chỉ require file này (1 instance/process).
 */

module.exports = sequelize;
