const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserPoint = sequelize.define('UserPoint', {
  id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
  userId: { type: DataTypes.INTEGER, allowNull: false },
  orderId: { type: DataTypes.INTEGER, allowNull: true },
  points: { type: DataTypes.INTEGER, allowNull: false },
  type: {
    type: DataTypes.ENUM('earn', 'spend', 'refund', 'expired'),
    allowNull: false,
  },
  description: { type: DataTypes.STRING, allowNull: true },
  expiresAt: { type: DataTypes.DATE, allowNull: true },
}, {
  tableName: 'userpoints',
  timestamps: true,
});

module.exports = UserPoint;
