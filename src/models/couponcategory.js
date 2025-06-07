// src/models/couponcategory.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CouponCategory = sequelize.define('couponcategory', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  couponId: { type: DataTypes.INTEGER, allowNull: false },
  categoryId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'couponcategory',
  timestamps: true,
  paranoid: true
});

module.exports = CouponCategory;
