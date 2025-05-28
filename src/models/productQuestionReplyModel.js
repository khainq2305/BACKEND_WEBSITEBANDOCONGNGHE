module.exports = (sequelize, DataTypes) => {
    const ProductQuestionReply = sequelize.define('ProductQuestionReply', {
        id: {
            type: DataTypes.INTEGER,
            autoIncrement: true,
            primaryKey: true
        },
        questionId: {
            type: DataTypes.INTEGER,
            allowNull: false
        },
        content: {
            type: DataTypes.TEXT,
            allowNull: false
        },
        isAdminReply: {
            type: DataTypes.BOOLEAN,
            defaultValue: false
        }
    }, {
        tableName: 'productquestionreplies',
        timestamps: true,
        createdAt: 'createdAt',
        updatedAt: false
    });

    return ProductQuestionReply;
};
