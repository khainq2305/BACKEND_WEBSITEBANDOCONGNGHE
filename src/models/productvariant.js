const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const ProductVariant = connection.define('ProductVariant', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  variantId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'productvariants',
  timestamps: true,
  paranoid: true // để hỗ trợ cột deletedAt
});

module.exports = ProductVariant;
