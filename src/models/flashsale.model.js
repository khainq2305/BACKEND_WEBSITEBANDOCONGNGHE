// src/models/flashsale.model.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const FlashSale = sequelize.define(
  "FlashSale",
  {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    title: { type: DataTypes.STRING, allowNull: false },
    bannerUrl: { type: DataTypes.STRING, allowNull: true },
    startTime: { type: DataTypes.DATE, allowNull: false },
    endTime: { type: DataTypes.DATE, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: true },
    isActive: { type: DataTypes.BOOLEAN, defaultValue: true },
    description: { type: DataTypes.TEXT, allowNull: true },
    bgColor: { type: DataTypes.STRING, allowNull: true },
    orderIndex: { type: DataTypes.INTEGER, allowNull: true, defaultValue: 0 },
  },
  {
    tableName: "flashsales",
    timestamps: true,
    paranoid: true,
  }
);

module.exports = FlashSale;
