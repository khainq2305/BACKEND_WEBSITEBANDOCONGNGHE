const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const HighlightedCategoryItem = sequelize.define('HighlightedCategoryItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  imageUrl: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  customTitle: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  customLink: {
    type: DataTypes.STRING,
    allowNull: true,
  },
  sortOrder: {
    type: DataTypes.INTEGER,
    allowNull: true,
  },
  slug: {
  type: DataTypes.STRING,
  allowNull: false,
  unique: true,
}
,
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  isActive: {
  type: DataTypes.BOOLEAN,
  defaultValue: true
}

}, {
  tableName: 'highlightedcategoryitems',
  timestamps: true,
});

module.exports = HighlightedCategoryItem;
