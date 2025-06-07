const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const PaymentMethod = sequelize.define('PaymentMethod', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  code: DataTypes.STRING,
  name: DataTypes.STRING,
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  }
}, {
  tableName: 'paymentmethods',
  timestamps: true,
});

module.exports = PaymentMethod;
