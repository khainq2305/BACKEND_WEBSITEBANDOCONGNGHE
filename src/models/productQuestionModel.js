module.exports = (sequelize, DataTypes) => {
  const ProductQuestion = sequelize.define('ProductQuestion', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true
    },
    productId: {
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
    isAnswered: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    }
  }, {
    tableName: 'productquestions',
    timestamps: true,
    createdAt: 'createdAt',
    updatedAt: false
  });

  return ProductQuestion;
};
