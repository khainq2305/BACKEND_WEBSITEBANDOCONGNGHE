const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const Brand = connection.define('Brand', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  logo: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'brands',
  timestamps: true,
  paranoid: true, 
  createdAt: 'createdAt',
  updatedAt: 'updatedAt'
});

module.exports = Brand;
