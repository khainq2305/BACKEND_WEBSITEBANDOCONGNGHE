const { DataTypes } = require("sequelize");
const connection = require("../config/database");

const MembershipTier = connection.define(
  "MembershipTier",
  {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true,
    },
    name: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    minSpent: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    minOrders: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    discountPercent: {
      type: DataTypes.FLOAT,
      defaultValue: 0,
    },
    pointBonusRate: {
      type: DataTypes.FLOAT,
      defaultValue: 1,
    },
    expireInMonths: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
    priority: {
      type: DataTypes.INTEGER,
      defaultValue: 1,
    },
  },
  {
    tableName: "MembershipTiers",
    timestamps: true,
  }
);

module.exports = MembershipTier;
