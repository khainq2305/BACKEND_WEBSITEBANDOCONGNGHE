const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ComboCartItem = sequelize.define('ComboCartItem', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  cartId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  comboId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  quantity: {
    type: DataTypes.INTEGER,
    defaultValue: 1
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'combocartitems', // chữ thường hết, không có gạch dưới
  timestamps: true
});

module.exports = ComboCartItem;
