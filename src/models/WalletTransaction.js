const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WalletTransaction = sequelize.define('WalletTransaction', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  walletId: { type: DataTypes.INTEGER, allowNull: false },
    type: {
    type: DataTypes.ENUM('purchase', 'refund', 'withdraw'),
    allowNull: false,
  },
  amount: { type: DataTypes.DECIMAL(12, 2), allowNull: false },
  description: { type: DataTypes.STRING, allowNull: true },
  relatedOrderId: { type: DataTypes.INTEGER, allowNull: true },
}, {
  tableName: 'wallettransactions',
  timestamps: true,
});

module.exports = WalletTransaction;
