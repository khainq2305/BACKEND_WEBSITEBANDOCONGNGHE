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
        type: DataTypes.ENUM("order", "system"),
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
        type: DataTypes.ENUM("order", "system"),
      },
      createdAt: {
        type: DataTypes.DATE,
      },
      startAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },

      deletedAt: {
        type: DataTypes.DATE,
      },
      slug: {
        type: DataTypes.STRING,
        allowNull: false,
        unique: true,
      },
    },
    {
      tableName: "notifications",
      paranoid: true,
      timestamps: false,
    }
  );

  Notification.associate = (models) => {
    Notification.hasMany(models.NotificationUser, {
      foreignKey: "notificationId",
    });
  };

  return Notification;
};
