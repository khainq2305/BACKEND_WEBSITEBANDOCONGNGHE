// src/models/category.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Category = sequelize.define('Category', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  slug: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true
    },
    
  description: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
  
}, {
  tableName: 'postcategories',
  timestamps: true,
  paranoid: true
});

module.exports = Category;
