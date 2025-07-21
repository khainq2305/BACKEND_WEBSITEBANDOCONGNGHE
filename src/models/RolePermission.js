
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
const RolePermission = sequelize.define(
  "RolePermission",
  {
    roleId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    actionId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    subjectId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    label: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    description: {
  type: DataTypes.TEXT,
  allowNull: true,
},
    createdAt: {
      type: DataTypes.DATE,
      defaultValue: DataTypes.NOW,
    },
  },
  {
    tableName: "rolepermissions",
    timestamps: false, // dùng created_at thủ công
  }
);
module.exports = RolePermission;
