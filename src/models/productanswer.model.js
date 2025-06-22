const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductAnswer = sequelize.define('ProductAnswer', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  questionId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  content: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  isOfficial: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  },
  parentId: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  likesCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  reportedCount: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isHidden: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'productanswers',
  timestamps: true
});

module.exports = ProductAnswer;
