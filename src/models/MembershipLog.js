const { DataTypes } = require("sequelize");
const connection = require("../config/database");

const MembershipLog = connection.define(
  "MembershipLog",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    oldTierId: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    newTierId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reason: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    changedAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "MembershipLogs",
    timestamps: false,
  }
);

module.exports = MembershipLog;
