const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Review = sequelize.define('Review', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false,
  },
  rating: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  isReplied: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  replyContent: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  responderId: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  isHidden: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  reportCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: true,
    unique: true,
  },
  replyDate: {
    type: DataTypes.DATE,
    allowNull: true,
  },
  repliedBy: {
    type: DataTypes.STRING,
    allowNull: true,
  }
}, {
  tableName: 'reviews',
  timestamps: true,
});

module.exports = Review;
