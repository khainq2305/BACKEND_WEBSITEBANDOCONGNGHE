const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Placement = sequelize.define('Placement', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false
  },
  // ← Thêm cột categoryId
  categoryId: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'categories',
      key: 'id'
    }
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true
  },
  description: DataTypes.TEXT,
  type: {
    type: DataTypes.STRING,
    defaultValue: 'banner' // 'slider' | 'popup' | 'floating'...
  }
}, {
  tableName: 'Placements',
  timestamps: true
});

module.exports = Placement;
