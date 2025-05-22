// src/models/productMediaModel.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductMedia = sequelize.define('ProductMedia', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  type: { type: DataTypes.ENUM('image', 'video'), allowNull: false },
  sortOrder: { type: DataTypes.INTEGER, defaultValue: 0 },
  mediaUrl: { type: DataTypes.STRING, allowNull: false },
  skuId: { type: DataTypes.INTEGER, allowNull: false }
}, {
  tableName: 'productmedias',
  timestamps: true
});

module.exports = ProductMedia;
