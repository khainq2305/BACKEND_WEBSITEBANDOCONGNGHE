const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
status: {
  type: DataTypes.ENUM('pending', 'confirmed', 'shipping', 'completed', 'cancelled'),
  defaultValue: 'pending',
},
orderCode: {
  type: DataTypes.STRING,
  unique: true,
  allowNull: false,
},

  note: DataTypes.TEXT,
  shippingFee: DataTypes.DECIMAL(10, 2),
  finalPrice: DataTypes.DECIMAL(10, 2),
  isPaid: DataTypes.BOOLEAN,
  ghnOrderCode: DataTypes.STRING,
  cancelReason: DataTypes.TEXT,
  refundStatus: DataTypes.ENUM('none', 'requested', 'approved', 'rejected'),
  totalPrice: DataTypes.DECIMAL(10, 2),
  paymentTime: DataTypes.DATE,
  userId: DataTypes.INTEGER,
  userAddressId: DataTypes.INTEGER,
  paymentMethodId: DataTypes.INTEGER
}, {
  tableName: 'orders',
  timestamps: true,
});

module.exports = Order;
