// models/SearchHistory.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Đảm bảo đường dẫn đúng đến config/database

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
  userId: { 
    type: DataTypes.INTEGER, 
    allowNull: false 
  },
  createdAt: {
    type: DataTypes.DATE,
    allowNull: false,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'searchhistories', // Đảm bảo đúng tên bảng trong DB
  updatedAt: false, // Không sử dụng cột updatedAt
  // Thêm index để tối ưu truy vấn
  indexes: [
    {
      fields: ['userId']
    },
    {
      fields: ['createdAt']
    }
  ]
});

module.exports = SearchHistory;