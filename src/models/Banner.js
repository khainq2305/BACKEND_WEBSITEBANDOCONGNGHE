// src/models/banner.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Banner = sequelize.define('Banner', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: true
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: false
  },
  linkUrl: {
    type: DataTypes.STRING,
    allowNull: true
  },
  altText: {
    type: DataTypes.STRING,
    allowNull: true
  },

  
 type: {
  type: DataTypes.ENUM(
    'topbar',
    'slider-main',
    'slider-side',
    'mid-poster',
    'slider-footer',
    'mid-detail',     
    'category-filter' 
  ),
  allowNull: false
}
,

  displayOrder: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1
  },
categoryId: {
  type: DataTypes.INTEGER,
  allowNull: true,
  references: {
    model: 'categories',
    key: 'id'
  },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
},

productId: {
  type: DataTypes.INTEGER,
  allowNull: true,
  references: {
    model: 'products',
    key: 'id'
  },
  onDelete: 'SET NULL',
  onUpdate: 'CASCADE'
},

  startDate: {
    type: DataTypes.DATE,
    allowNull: true
  },
  endDate: {
    type: DataTypes.DATE,
    allowNull: true
  },

  isActive: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true
  }
}, {
  tableName: 'banners',
  timestamps: true
});

module.exports = Banner;
