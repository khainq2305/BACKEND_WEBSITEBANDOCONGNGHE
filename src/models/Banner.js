const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Banner = sequelize.define('Banner', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: DataTypes.STRING,
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: false
  },
  linkUrl: DataTypes.STRING,
  altText: DataTypes.STRING,
  startDate: DataTypes.DATE,
  endDate: DataTypes.DATE,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  notes: DataTypes.TEXT
}, {
  tableName: 'Banners',
  timestamps: true
});

module.exports = Banner;
