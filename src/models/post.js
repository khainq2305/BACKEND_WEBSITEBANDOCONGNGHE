const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Post = sequelize.define('Post', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  title: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: true
  },
  status: {
    type: DataTypes.TINYINT,
    allowNull: false,
    defaultValue: 1 // 0: draft, 1: published, 2: scheduled
  },
  orderIndex: {
    type: DataTypes.INTEGER,
    allowNull: true,
    defaultValue: 0
  },
  slug: {
    type: DataTypes.STRING(255),
    allowNull: true
  },
  authorId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true
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
  timestamps: true,
  paranoid: true,
  createdAt: 'createdAt',
  updatedAt: 'updatedAt',
  deletedAt: 'deletedAt'
});

module.exports = Post;
