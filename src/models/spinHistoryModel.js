const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const SpinHistory = sequelize.define('SpinHistory', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    user_id: { type: DataTypes.INTEGER, allowNull: false },
    reward_id: { type: DataTypes.INTEGER },
    reward_name: { type: DataTypes.STRING }
}, {
    tableName: 'spin_history',
    timestamps: true
});

module.exports = SpinHistory;