

const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const NotificationUser = sequelize.define("NotificationUser", {
  id: {
    type: DataTypes.INTEGER,
    autoIncrement: true,
    primaryKey: true,
  },
  notificationId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  userId: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  isRead: {
    type: DataTypes.BOOLEAN,
    defaultValue: false,
  },
  readAt: {
    type: DataTypes.DATE,
    allowNull: true,
  },
},{
  tableName: "notificationusers",
  timestamps: true,
});

module.exports = NotificationUser;
