const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const UserAddress = sequelize.define(
  "UserAddress",
  {
    id: { type: DataTypes.INTEGER, autoIncrement: true, primaryKey: true },
    userId: { type: DataTypes.INTEGER, allowNull: false },
    fullName: { type: DataTypes.STRING, allowNull: false },
    phone: { type: DataTypes.STRING, allowNull: false },
    streetAddress: {
      type: DataTypes.STRING,
      allowNull: false,
      field: "streetAddress",
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 6),
      allowNull: true,
    },

    wardId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    isDeleted: { type: DataTypes.BOOLEAN, defaultValue: false },
    provinceId: { type: DataTypes.INTEGER, allowNull: false },
    districtId: { type: DataTypes.INTEGER, allowNull: false },

    isDefault: { type: DataTypes.BOOLEAN, defaultValue: false },
    label: {
      type: DataTypes.STRING,
      allowNull: true,
    },
  },
  {
    tableName: "useraddresses",
    timestamps: true,
  }
);

module.exports = UserAddress;
