module.exports = (sequelize, DataTypes) => {
  const Review = sequelize.define(
    'Review',
    {
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      rating: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      isReplied: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      replyContent: {
        type: DataTypes.TEXT,
        allowNull: true
      },
      responderId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      isHidden: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      reportCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      }
    },
    {
      tableName: 'reviews',
      timestamps: true
    }
  );

  Review.associate = (models) => {
    Review.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    Review.belongsTo(models.User, { foreignKey: 'responderId', as: 'responder' });
    Review.belongsTo(models.Sku, { foreignKey: 'skuId', as: 'sku' });
    // Liên kết với reviewmedias
    Review.hasMany(models.ReviewMedia, {foreignKey: 'reviewId',as: 'medias'
    });
  };

  return Review;
};
