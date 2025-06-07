const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PaymentTransaction = sequelize.define('PaymentTransaction', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  transactionCode: DataTypes.STRING,
  amount: DataTypes.DECIMAL(10, 2),
  status: DataTypes.STRING,
  paymentTime: DataTypes.DATE,
  paymentMethodId: DataTypes.INTEGER,
  orderId: DataTypes.INTEGER,
}, {
  tableName: 'paymenttransactions',
  timestamps: true,
});

module.exports = PaymentTransaction;
