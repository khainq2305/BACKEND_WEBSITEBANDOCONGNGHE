module.exports = (sequelize, DataTypes) => {
  const ProductAnswer = sequelize.define("ProductAnswer",
    {
      questionId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      userId: {
        type: DataTypes.INTEGER,
        allowNull: false
      },
      content: {
        type: DataTypes.TEXT,
        allowNull: false
      },
      isOfficial: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      },
      parentId: {
        type: DataTypes.INTEGER,
        allowNull: true
      },
      likesCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      reportedCount: {
        type: DataTypes.INTEGER,
        defaultValue: 0
      },
      isHidden: {
        type: DataTypes.BOOLEAN,
        defaultValue: false
      }
    },
    {
      tableName: "productanswers",
      timestamps: true
    }
  );

  return ProductAnswer;
};
