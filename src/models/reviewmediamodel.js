module.exports = (sequelize, DataTypes) => {
  const ReviewMedia = sequelize.define(
    'ReviewMedia',
    {
      type: {
        type: DataTypes.ENUM('image', 'video'),
        defaultValue: 'image'
      },
      url: {
        type: DataTypes.STRING,
        allowNull: false
      },
      reviewId: {
        type: DataTypes.INTEGER,
        allowNull: false
      }
    },
    {
      tableName: 'reviewmedias',
      timestamps: true
    }
  );

  

  return ReviewMedia;
};
