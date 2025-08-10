const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SpinReward = sequelize.define('SpinReward', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    name: {
        type: DataTypes.STRING,
        allowNull: true 
    },
    couponId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    probability: {
        type: DataTypes.FLOAT,
        defaultValue: 10
    },
    isActive: {
        type: DataTypes.BOOLEAN,
        defaultValue: true
    }
}, {
    tableName: 'spinrewards', // ✅ đổi từ 'spin_rewards' sang 'SpinRewards'
    timestamps: true
});

module.exports = SpinReward;
