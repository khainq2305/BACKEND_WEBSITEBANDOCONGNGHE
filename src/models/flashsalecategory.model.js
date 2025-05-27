// src/models/flashsalecategory.model.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');
const FlashSale = require('./flashsale.model');
const Category = require('./categoryModel');

const FlashSaleCategory = sequelize.define('FlashSaleCategory', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  discountType: {
    type: DataTypes.ENUM('percentage', 'fixed'),
    allowNull: false
  },
  discountValue: { type: DataTypes.FLOAT, allowNull: false },
  maxPerUser: { type: DataTypes.INTEGER, allowNull: true },
  isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
  priority: { type: DataTypes.INTEGER, defaultValue: 0 }
}, {
  tableName: 'flashsalecategories',
  timestamps: true,
  paranoid: true,
});

// Associations
FlashSale.hasMany(FlashSaleCategory, { foreignKey: 'flashSaleId', as: 'categories' });
FlashSaleCategory.belongsTo(FlashSale, { foreignKey: 'flashSaleId' });

Category.hasMany(FlashSaleCategory, { foreignKey: 'categoryId' });
FlashSaleCategory.belongsTo(Category, { foreignKey: 'categoryId', as: 'category' });

module.exports = FlashSaleCategory;
