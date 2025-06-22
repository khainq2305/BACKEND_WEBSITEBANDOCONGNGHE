const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReturnRequest = sequelize.define('ReturnRequest', {
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  evidenceImages: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Danh sách URL ảnh, ngăn cách bằng dấu ,'
  },
  evidenceVideos: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Danh sách URL video, ngăn cách bằng dấu ,'
  },
  detailedReason: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Mô tả chi tiết lý do trả hàng',
  },

  // ✅ MỚI: Phương thức gửi hàng hoàn
  returnMethod: {
    type: DataTypes.ENUM('ghn_pickup', 'self_send'),
    allowNull: true,
    comment: 'Phương thức trả hàng: GHN đến lấy hoặc tự gửi'
  },

  // ✅ MỚI: Mã vận đơn (nếu có)
  trackingCode: {
    type: DataTypes.STRING,
    allowNull: true,
    comment: 'Mã vận đơn trả hàng (nếu có)'
  },

  // ✅ CẬP NHẬT STATUS: xử lý mọi luồng
  status: {
    type: DataTypes.ENUM(
      'pending',          // 1. Khách gửi yêu cầu
      'approved',         // 2. Admin duyệt yêu cầu
      'awaiting_pickup',  // 3. Chờ khách chọn cách gửi (ghn / tự gửi)
      'shipping',         // 4. Hàng đang gửi về
      'received',         // 5. Admin xác nhận đã nhận hàng
      'refunded',         // 6. Đã hoàn tiền
      'rejected',         // Admin từ chối ngay lúc đầu
      'cancelled',        // Admin huỷ sau khi duyệt
      'return_failed'     // ✅ Admin xác nhận khách gửi hàng tráo, không hợp lệ
    ),
    defaultValue: 'pending',
  },

  responseNote: {
    type: DataTypes.TEXT,
    allowNull: true,
    comment: 'Ghi chú phản hồi từ phía admin (lý do từ chối, lý do hàng không hợp lệ...)'
  },
}, {
  tableName: 'returnrequests',
  timestamps: true,
});

module.exports = ReturnRequest;
