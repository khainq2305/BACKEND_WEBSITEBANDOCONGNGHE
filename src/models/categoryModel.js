// src/models/categoryModel.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Category = sequelize.define('Category', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
  },
description: {
  type: DataTypes.TEXT('long'),
  allowNull: true,
},

  thumbnail: {
    type: DataTypes.STRING(255),
    allowNull: true,
  },
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: true,
    defaultValue: true,
  },
     slug: {
      type: DataTypes.STRING(255),
      allowNull: false,
      unique: true,    
    },
  sortOrder: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0,
  }
}, {
  tableName: 'categories',
  timestamps: true,
  paranoid: true, // để dùng deletedAt
  underscored: false,
});

module.exports = Category;
