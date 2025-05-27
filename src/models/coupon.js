const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Coupon = sequelize.define('Coupon', {
  code: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
  title: DataTypes.STRING(255),
  description: DataTypes.TEXT,
  bannerUrl: DataTypes.STRING(255),
  discountType: DataTypes.ENUM('percent', 'amount'),
  discountValue: DataTypes.DECIMAL(12, 2),
  minOrderValue: DataTypes.DECIMAL(12, 2),
  maxDiscountValue: DataTypes.DECIMAL(12, 2),
  maxUsagePerUser: DataTypes.INTEGER,
  totalQuantity: DataTypes.INTEGER,
  usedCount: DataTypes.INTEGER,
  startTime: DataTypes.DATE,
  endTime: DataTypes.DATE,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  type: DataTypes.ENUM('public', 'private', 'auto')
}, {
  tableName: 'coupons',
  paranoid: true,
  timestamps: true
});

module.exports = Coupon;
