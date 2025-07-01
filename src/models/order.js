const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Order = sequelize.define('Order', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
status: {
  // chỉ luồng xử lý/hậu cần, KHÔNG dính tới tiền
  type: DataTypes.ENUM('processing', 'shipping', 'delivered', 'completed', 'cancelled'),
  defaultValue: 'processing',
},

paymentStatus: {
  // luồng thanh toán
  type: DataTypes.ENUM('unpaid', 'waiting', 'paid'),
  defaultValue: 'unpaid',
},


orderCode: {
  type: DataTypes.STRING,
  unique: true,
  allowNull: false,
},
  couponDiscount: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  shippingDiscount: {
    type: DataTypes.FLOAT,
    defaultValue: 0
  },
  note: DataTypes.TEXT,
  shippingFee: DataTypes.DECIMAL(10, 2),
  finalPrice: DataTypes.DECIMAL(10, 2),
  ghnOrderCode: DataTypes.STRING,
  cancelReason: DataTypes.TEXT,
    momoOrderId: {
    type: DataTypes.STRING,
    unique: true,
    allowNull: true,
  },
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
