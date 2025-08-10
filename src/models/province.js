const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Province = sequelize.define('Province', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'provinces',
  timestamps: false,
});

module.exports = Province;
