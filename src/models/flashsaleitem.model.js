// src/models/flashsaleitem.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const FlashSale = require('./flashsale.model');
const Sku = require('./skuModel');

const FlashSaleItem = sequelize.define('FlashSaleItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  salePrice: { type: DataTypes.FLOAT, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  labelColor: { type: DataTypes.STRING, allowNull: true },
  maxPerUser: { type: DataTypes.INTEGER, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  note: { type: DataTypes.STRING, allowNull: true },
}, {
  tableName: 'flashsaleitems',
  timestamps: true,
  paranoid: true,
});

// Associations
FlashSale.hasMany(FlashSaleItem, { foreignKey: 'flashSaleId', as: 'items' });
FlashSaleItem.belongsTo(FlashSale, { foreignKey: 'flashSaleId' });

Sku.hasMany(FlashSaleItem, { foreignKey: 'skuId' });
FlashSaleItem.belongsTo(Sku, { foreignKey: 'skuId', as: 'sku' });

module.exports = FlashSaleItem;
