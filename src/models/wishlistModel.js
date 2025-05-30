const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Wishlist = sequelize.define('Wishlist', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false
  },
  isDefault: {
    type: DataTypes.BOOLEAN,
    defaultValue: false
  }
}, {
  tableName: 'wishlists',
  timestamps: true,
});

module.exports = Wishlist;
