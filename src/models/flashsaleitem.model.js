// src/models/flashsaleitem.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const FlashSale = require('./flashsale.model');
const Sku = require('./skuModel');

const FlashSaleItem = sequelize.define('FlashSaleItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  salePrice: { type: DataTypes.FLOAT, allowNull: false },
  quantity: { type: DataTypes.INTEGER, allowNull: false },
  maxPerUser: { type: DataTypes.INTEGER, allowNull: true },
   sortOrder: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  originalQuantity: {
  type: DataTypes.INTEGER,
  allowNull: true, // Cho phép null ban đầu để tránh lỗi nếu chưa cập nhật
},

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
