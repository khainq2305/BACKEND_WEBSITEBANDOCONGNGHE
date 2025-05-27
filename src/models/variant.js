// src/models/variant.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const Variant = sequelize.define("Variant", {
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: DataTypes.TEXT,

  isActive: {
    type: DataTypes.BOOLEAN,
    defaultValue: true,
  },
  slug: {
    type: DataTypes.STRING,
    allowNull: true, // hoặc false nếu bạn muốn bắt buộc
  },
   type: {                                // ✅ Thêm dòng này
    type: DataTypes.STRING(50),
    defaultValue: 'text',
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
