const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SkuVariantValue = sequelize.define('SkuVariantValue', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  skuId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  variantValueId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'skuvariantvalues',
  timestamps: true
});

module.exports = SkuVariantValue;
