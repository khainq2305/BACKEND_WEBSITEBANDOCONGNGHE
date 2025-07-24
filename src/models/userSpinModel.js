const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserSpin = sequelize.define('UserSpin', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  spinDate: { type: DataTypes.DATEONLY, allowNull: false },
  spinsLeft: { type: DataTypes.INTEGER, defaultValue: 1 },
}, {
  tableName: 'UserSpins',
  timestamps: true,
  indexes: [{ unique: true, fields: ['userId', 'spinDate'] }]
});

module.exports = UserSpin;
