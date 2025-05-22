const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const District = sequelize.define('District', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  provinceId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
}, {
  tableName: 'Districts',
  timestamps: false,
});

module.exports = District;
