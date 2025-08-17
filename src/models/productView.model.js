// src/models/ProductView.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductView = sequelize.define('ProductView', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  // thêm cột ngày (để đảm bảo unique theo ngày)
  viewDate: {
    type: DataTypes.DATEONLY,
    allowNull: false,
    defaultValue: DataTypes.NOW
  },
  viewCount: {
    type: DataTypes.INTEGER,
    defaultValue: 1,
    allowNull: false
  },
  firstViewedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  lastViewedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  updatedAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
    allowNull: false
  },
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'productviews',
  timestamps: true,
  paranoid: false,
  indexes: [
    {
      unique: true,
      fields: ['userId', 'productId', 'viewDate']
    }
  ]
});

module.exports = ProductView;
