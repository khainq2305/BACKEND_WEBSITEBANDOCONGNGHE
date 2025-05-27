module.exports = (sequelize, DataTypes) => {
  const Notification = sequelize.define(
    "Notification",
    {
      title: {
        type: DataTypes.STRING,
        allowNull: false,
      },
      message: {
        type: DataTypes.TEXT,
      },
      imageUrl: {
        type: DataTypes.STRING,
      },
      link: {
        type: DataTypes.STRING,
      },
      targetType: {
        type: DataTypes.ENUM("order", "promotion", "news", "system"),
      },
      targetId: {
        type: DataTypes.INTEGER,
      },
      isGlobal: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true,
      },
      type: {
        type: DataTypes.ENUM("order", "promotion", "news", "system"),
      },
      orderIndex: {
        type: DataTypes.INTEGER,
        defaultValue: 0,
      },
      createdAt: {
        type: DataTypes.DATE,
      },
      deletedAt: {
        type: DataTypes.DATE,
      },
    },
    {
      tableName: "notifications",
      paranoid: true,
      timestamps: false, // Bạn có thể để true nếu muốn Sequelize tự sinh createdAt/updatedAt
    }
  );

  Notification.associate = (models) => {
    Notification.hasMany(models.NotificationUser, {
      foreignKey: "notificationId",
    });
  };

  return Notification;
};
