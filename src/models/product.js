const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Product = sequelize.define('Product', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false
  },
  slug: {
  type: DataTypes.STRING(255),
  allowNull: false,
  unique: true
},
description: {
  type: DataTypes.TEXT('long'),
  allowNull: true,
},
badge: {
  type: DataTypes.STRING(50),
  allowNull: true
},

  shortDescription: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  thumbnail: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  hasVariants: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  orderIndex: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  brandId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'products',
  timestamps: true,
  paranoid: true // dùng để tự động xử lý soft-delete qua deletedAt
});

module.exports = Product;
