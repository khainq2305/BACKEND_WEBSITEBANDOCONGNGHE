// src/models/variantvalue.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const VariantValue = sequelize.define("VariantValue", {
  variantId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  value: {
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
  imageUrl: {
    type: DataTypes.STRING, // đường dẫn ảnh minh họa
    allowNull: true,
  },
  colorCode: {
    type: DataTypes.STRING, // ví dụ: #000000, red, rgba(255,255,255,1)
    allowNull: true,
  },
  deletedAt: {
    type: DataTypes.DATE,
  },
}, {
  tableName: "variantvalues",
  timestamps: true,
  paranoid: true,
});

module.exports = VariantValue;
