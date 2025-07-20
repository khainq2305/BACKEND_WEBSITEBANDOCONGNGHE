const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserSpin = sequelize.define('UserSpin', {
  id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
  user_id: { type: DataTypes.INTEGER, allowNull: false },
  spin_date: { type: DataTypes.DATEONLY, allowNull: false },
  spins_left: { type: DataTypes.INTEGER, defaultValue: 1 }
}, {
  tableName: 'user_spins',
  timestamps: true,
  indexes: [{ unique: true, fields: ['user_id', 'spin_date'] }]
});

module.exports = UserSpin;