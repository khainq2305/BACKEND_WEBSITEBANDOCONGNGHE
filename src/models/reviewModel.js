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
      },
       slug: {
        type: DataTypes.STRING,
        allowNull: true,
        unique: true,
      },
    },
    {
      tableName: 'reviews',
      timestamps: true
    }
  );

  

  return Review;
};
