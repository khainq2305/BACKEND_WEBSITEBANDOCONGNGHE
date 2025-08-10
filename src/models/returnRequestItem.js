const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReturnRequestItem = sequelize.define('ReturnRequestItem', {
  returnRequestId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'returnrequests',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  skuId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'skus', // 👈 Đảm bảo bạn có bảng/model skus
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  }
}, {
  tableName: 'returnrequestitems',
  timestamps: true
});

module.exports = ReturnRequestItem;
