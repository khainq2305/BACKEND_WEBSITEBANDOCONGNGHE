// src/models/skuModel.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Sku = sequelize.define('Sku', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  skuCode: { type: DataTypes.STRING, allowNull: false },
  originalPrice: { type: DataTypes.INTEGER, allowNull: false },
  price: { type: DataTypes.INTEGER, allowNull: true },
  description: {
  type: DataTypes.TEXT,
  allowNull: true,
}
,
  stock: { type: DataTypes.INTEGER, allowNull: false },
  height: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  width:  { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  length: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  weight: { type: DataTypes.FLOAT, allowNull: false, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  productId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'skus',
  timestamps: true,
  paranoid: true
});

module.exports = Sku;
