// models/AuditLog.js
const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");
  const AuditLog = sequelize.define('AuditLog', {
    id: {
      type: DataTypes.INTEGER,
      primaryKey: true,
      autoIncrement: true
    },
    eventType: {
      type: DataTypes.ENUM('CREATE', 'UPDATE', 'DELETE', 'RESTORE'),
      allowNull: false,
      comment: 'Loại thao tác'
    },
    entityType: {
      type: DataTypes.STRING(50),
      allowNull: false,
      comment: 'Loại thực thể (Product, Category, User, etc.)'
    },
    entityId: {
      type: DataTypes.STRING(100),
      allowNull: false,
      comment: 'ID của thực thể'
    },
    userId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: 'ID người thực hiện'
    },
    userEmail: {
      type: DataTypes.STRING(255),
      allowNull: true,
      comment: 'Email người thực hiện'
    },
    oldValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Giá trị cũ (JSON)'
    },
    newValue: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Giá trị mới (JSON)'
    },
    changedFields: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Các trường đã thay đổi'
    },
    ipAddress: {
      type: DataTypes.STRING(45),
      allowNull: true,
      comment: 'Địa chỉ IP'
    },
    userAgent: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'User Agent'
    },
    timestamp: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW
    },
    metadata: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: 'Thông tin bổ sung (JSON)'
    }
  }, {
    tableName: 'audit_logs',
    timestamps: false,
    indexes: [
      {
        fields: ['entityType', 'entityId']
      },
      {
        fields: ['userId']
      },
      {
        fields: ['eventType']
      },
      {
        fields: ['timestamp']
      }
    ]
  });
  module.exports = AuditLog;