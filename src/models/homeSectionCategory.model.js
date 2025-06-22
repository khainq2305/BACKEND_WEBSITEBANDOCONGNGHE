const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HomeSectionCategory = sequelize.define('HomeSectionCategory', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  homeSectionId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 0,
  },
  createdAt: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'homeSectionCategories',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['homeSectionId', 'categoryId'],
    },
  ],
});

module.exports = HomeSectionCategory;
