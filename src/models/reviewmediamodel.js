const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ReviewMedia = sequelize.define('ReviewMedia', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  type: {
    type: DataTypes.ENUM('image', 'video'),
    defaultValue: 'image'
  },
  url: {
    type: DataTypes.STRING,
    allowNull: false
  },
  reviewId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'reviewmedias',
  timestamps: true
});

module.exports = ReviewMedia;
