// src/models/couponuser.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CouponUser = sequelize.define('couponuser', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  assignedAt: { type: DataTypes.DATE, allowNull: true },
  used: { type: DataTypes.INTEGER, defaultValue: 0 },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  couponId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'couponuser',
  timestamps: true,
  paranoid: true
});

module.exports = CouponUser;
