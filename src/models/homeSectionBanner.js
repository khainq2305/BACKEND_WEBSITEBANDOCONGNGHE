const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const HomeSectionBanner = connection.define('HomeSectionBanner', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  homeSectionId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: false
  },
  linkType: {
    type: DataTypes.ENUM('product', 'category', 'brand', 'url', 'none'),
    allowNull: false
  },
  linkValue: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'homesectionbanners',
  timestamps: true
});

module.exports = HomeSectionBanner;
