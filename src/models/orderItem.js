const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderItem = sequelize.define('OrderItem', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  price: DataTypes.DECIMAL(10, 2),
  quantity: DataTypes.INTEGER,
  orderId: DataTypes.INTEGER,
  skuId: DataTypes.INTEGER
}, {
  tableName: 'orderitems',
  timestamps: false,
});

module.exports = OrderItem;
