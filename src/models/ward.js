const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Ward = sequelize.define('Ward', {
  code: {
    type: DataTypes.STRING,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  districtId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'Wards',
  timestamps: false,
});

module.exports = Ward;
