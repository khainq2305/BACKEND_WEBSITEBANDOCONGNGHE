// src/models/skuModel.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Sku = sequelize.define('Sku', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  skuCode: { type: DataTypes.STRING, allowNull: false },
  originalPrice: { type: DataTypes.INTEGER, allowNull: false },
  price: { type: DataTypes.INTEGER, allowNull: false },
  stock: { type: DataTypes.INTEGER, allowNull: false },
  height: DataTypes.FLOAT,
  width: DataTypes.FLOAT,
  length: DataTypes.FLOAT,
  weight: DataTypes.FLOAT,
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  productId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'skus',
  timestamps: true,
  paranoid: true
});

module.exports = Sku;
