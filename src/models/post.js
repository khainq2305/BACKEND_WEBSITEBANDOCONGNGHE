// src/models/post.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  thumbnail: {
    type: DataTypes.STRING,
    allowNull: true
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  authorId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  status: {
      type: DataTypes.ENUM('draft', 'published', 'scheduled'),
      defaultValue: 'draft'
    },
  orderIndex: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  publishAt: {
  type: DataTypes.DATE,
  allowNull: true
},
  deletedAt: {
    type: DataTypes.DATE,
    allowNull: true
  }
}, {
  tableName: 'posts',
  deletedAt: 'deletedAt', // tên field đúng
  timestamps: true,
  paranoid: true
});

module.exports = Post; // ✅ đây là quan trọng nhất
