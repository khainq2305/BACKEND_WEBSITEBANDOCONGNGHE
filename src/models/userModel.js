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
    previousPassword: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Mật khẩu cũ gần nhất (hash)",
    },
    // walletEmailVerified: {
    //   type: DataTypes.BOOLEAN,
    //   allowNull: false,
    //   defaultValue: false,
    //   comment: "Người dùng đã xác minh email cho ví hay chưa",
    // },
wallet2FASecret: {
  type: DataTypes.STRING,
  allowNull: true,
  comment: "Secret key cho Google Authenticator (Base32)"
},
wallet2FAStatus: {
  type: DataTypes.ENUM("pending", "active"),
  allowNull: true,
  comment: "Trạng thái bật Google Authenticator cho ví (pending: mới tạo QR, active: đã xác minh OTP)"
},

wallet2FAEnabledAt: {
  type: DataTypes.DATE,
  allowNull: true,
  comment: "Thời điểm xác minh OTP thành công và kích hoạt 2FA cho ví"
},
    passwordChangedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Thời điểm đổi mật khẩu lần cuối",
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
    rewardPoints: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Số điểm tích lũy của người dùng",
    },

    currentTierId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      references: {
        model: "MembershipTiers", // tên bảng đúng trong DB
        key: "id",
      },
    },
    totalSpent: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    totalOrders: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
    },
    tierGrantedAt: {
      type: DataTypes.DATE,
      allowNull: true,
    },
    tierExpireAt: {
      type: DataTypes.DATE,
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
