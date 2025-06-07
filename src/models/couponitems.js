// src/models/couponitems.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CouponItem = sequelize.define('couponitems', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  couponId: { type: DataTypes.INTEGER, allowNull: false },
  skuId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'couponitems',
  timestamps: true,
  paranoid: true
});

module.exports = CouponItem;
