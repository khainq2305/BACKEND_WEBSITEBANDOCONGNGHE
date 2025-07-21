const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const Action = sequelize.define(
  "Action",
  {
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    label: DataTypes.STRING,
    description: DataTypes.TEXT,
  },
  {
    tableName: "actions",
    timestamps: true,
    updatedAt: false,
  }
);

module.exports = Action;
