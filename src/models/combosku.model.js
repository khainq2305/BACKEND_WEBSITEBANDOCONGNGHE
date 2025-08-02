const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ComboSku = sequelize.define("ComboSku", {
  comboId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  skuId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    defaultValue: 1,
  },
}, {
  tableName: "comboskus",
  timestamps: true, // ✅ Quan trọng: bật timestamps vì bảng có createdAt, updatedAt
  paranoid: true,   // ✅ Nếu có deletedAt
});

module.exports = ComboSku;
