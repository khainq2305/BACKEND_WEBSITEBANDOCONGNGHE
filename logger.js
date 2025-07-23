// logger.js
const winston = require('winston');
const path = require('path');

// Tạo logger với Winston
const logger = winston.createLogger({
  level: 'info',  // Mức độ log: 'info', 'warn', 'error', v.v.
  format: winston.format.combine(
    winston.format.timestamp(),  // Thêm timestamp vào log
    winston.format.json()  // Log dưới định dạng JSON
  ),
  transports: [
    // Ghi log vào console
    new winston.transports.Console({
      format: winston.format.simple(),
    }),
    // Ghi log vào file
    new winston.transports.File({
      filename: path.join(__dirname, 'logs', 'audit.log'),
      level: 'info',  // Mức độ log cho file
    })
  ],
});

module.exports = logger;
