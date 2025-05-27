const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const BannerPlacementAssignment = sequelize.define('BannerPlacementAssignment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  bannerId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  placementId: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  displayOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  isActiveInPlacement: {
    type: DataTypes.BOOLEAN,
    defaultValue: true
  },
  scheduleStart: DataTypes.DATE,
  scheduleEnd: DataTypes.DATE
}, {
  tableName: 'BannerPlacementAssignments',
  timestamps: true,
  indexes: [
    {
      unique: true,
      fields: ['placementId', 'displayOrder']
    }
  ]
});

module.exports = BannerPlacementAssignment;
