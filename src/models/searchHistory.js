const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SearchHistory = sequelize.define('SearchHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  keyword: {
    type: DataTypes.STRING,
    allowNull: false
  },
  sessionId: {
    type: DataTypes.STRING,
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'searchhistories',
  updatedAt: false 
});

module.exports = SearchHistory;
