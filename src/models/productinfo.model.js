const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const ProductInfo = connection.define('ProductInfo', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'productinfo',
  timestamps: true
});

module.exports = ProductInfo;
