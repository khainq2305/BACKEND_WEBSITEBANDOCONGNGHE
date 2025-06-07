const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const ProductSpec = connection.define('ProductSpec', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  specKey: {
    type: DataTypes.STRING,
    allowNull: false
  },
  specValue: {
    type: DataTypes.STRING,
    allowNull: false
  },
    specGroup: { 
    type: DataTypes.STRING(100), 
    allowNull: true 
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  productId: {
  type: DataTypes.INTEGER,
  allowNull: false,
},

}, {
  tableName: 'productspec',
  timestamps: true
});

module.exports = ProductSpec;
