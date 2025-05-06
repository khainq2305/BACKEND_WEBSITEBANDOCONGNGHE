const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const Role = connection.define('Role', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: DataTypes.STRING
}, {
  tableName: 'roles',
  timestamps: false,
});

module.exports = Role;
