const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const RefundRequest = sequelize.define('RefundRequest', {
  orderId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  returnRequestId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  amount: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
  },
  reason: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  proofUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  status: {
    type: DataTypes.ENUM('pending', 'approved', 'rejected', 'refunded'),
    defaultValue: 'pending',
  },
  responseNote: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'refundrequest', // 👉 đặt đúng tên bảng nếu khác
  timestamps: true,
});

module.exports = RefundRequest;
