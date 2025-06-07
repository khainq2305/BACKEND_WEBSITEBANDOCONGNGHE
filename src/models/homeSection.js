const { DataTypes } = require('sequelize');
const connection = require('../config/database');

const HomeSection = connection.define('HomeSection', {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false
  },
  type: {
  type: DataTypes.ENUM(
    'productOnly',
    'productWithBanner',

  ),
  allowNull: false
}

,
 slug: { 
    type: DataTypes.STRING,
    allowNull: false, 
    unique: true      
  },
   isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  orderIndex: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  }
}, {
  tableName: 'homesections',
  timestamps: true
});

module.exports = HomeSection;
