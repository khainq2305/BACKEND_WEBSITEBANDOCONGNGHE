// src/models/spinHistoryModel.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SpinHistory = sequelize.define('SpinHistory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  rewardId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  rewardName: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  rewardNameWon: {    
    type: DataTypes.STRING,
    allowNull: true,
  },
}, {
  tableName: 'spinhistory',
  timestamps: true,
});

module.exports = SpinHistory;