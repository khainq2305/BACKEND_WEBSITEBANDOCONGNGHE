const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Wallet = sequelize.define('Wallet', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false, unique: true },
  balance: { type: DataTypes.DECIMAL(12, 2), defaultValue: 0 },
  // models/Wallet.js
pinHash: { type: DataTypes.STRING, allowNull: true }

}, {
  tableName: 'wallets',
  timestamps: true,
});

module.exports = Wallet;
