const { DataTypes } = require("sequelize");
const connection = require("../config/database");
const bcrypt = require("bcryptjs");

const User = connection.define(
  "User",
  {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    fullName: {
      type: DataTypes.STRING,
      allowNull: false,
    },
    dateOfBirth: {
      type: DataTypes.DATEONLY,
      allowNull: true,
    },

    email: {
      type: DataTypes.STRING,
      allowNull: false,
      unique: true,
    },
    password: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    provider: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "local",
    },
    providerId: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    status: {
      type: DataTypes.TINYINT,
      allowNull: false,
      defaultValue: 1,
    },
    gender: {
      type: DataTypes.ENUM("male", "female", "other"),
      allowNull: true,
    },

    phone: {
      type: DataTypes.STRING,
      allowNull: true,
      unique: true,
    },
    scheduledBlockAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    isEmailVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
      allowNull: false,
    },
    avatarUrl: {
      type: DataTypes.STRING,
      allowNull: true,
    },
    receivedBirthdayVoucherYear: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },

    lastLoginAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  },
  {
    tableName: "users",
    timestamps: true,
    paranoid: true,
  }
);

User.beforeCreate(async (user, options) => {
  if (user.password) {
    const salt = await bcrypt.genSalt(10);
    user.password = await bcrypt.hash(user.password, salt);
  }
});

User.comparePassword = async (password, hashedPassword) => {
  return await bcrypt.compare(password, hashedPassword);
};

module.exports = User;
