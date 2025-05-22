// src/models/variant.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Variant = sequelize.define("Variant", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: DataTypes.TEXT,
  sortOrder: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  deletedAt: {
    type: DataTypes.DATE,
  },
}, {
  tableName: "variants",
  timestamps: true,
  paranoid: true,
});

module.exports = Variant;
