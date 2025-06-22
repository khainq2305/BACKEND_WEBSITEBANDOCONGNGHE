const { DataTypes } = require("sequelize");
const connection = require("../config/database");

const Role = connection.define(
  "Role",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    key: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    description: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    canAccess: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false, // ✅ Mặc định không được truy cập
    },
    name: DataTypes.STRING,
  },
  {
    tableName: "roles",
    timestamps: false,
  }
);

module.exports = Role;
