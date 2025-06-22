const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const UserRole = sequelize.define('UserRole', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  roleId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'userRoles',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'roleId']
    }
  ]
});

module.exports = UserRole;
