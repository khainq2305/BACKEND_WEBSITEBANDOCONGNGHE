const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const WishlistItem = sequelize.define('WishlistItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  wishlistId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  productId: {
    type: DataTypes.INTEGER,
    allowNull: false
  }
}, {
  tableName: 'wishlistitems',
  timestamps: true,
  paranoid: true,
});

module.exports = WishlistItem;
