const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const ProductHomeSection = connection.define('ProductHomeSection', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  homeSectionId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  skuId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'producthomesection',
  timestamps: false
});

module.exports = ProductHomeSection;
