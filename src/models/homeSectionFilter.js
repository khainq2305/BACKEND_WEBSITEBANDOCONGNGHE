const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const HomeSectionFilter = connection.define('HomeSectionFilter', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  homeSectionId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  label: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
    type: DataTypes.ENUM('brand', 'category', 'url'),
    allowNull: false
  },
  value: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'home_section_filters',
  timestamps: true
});

module.exports = HomeSectionFilter;
