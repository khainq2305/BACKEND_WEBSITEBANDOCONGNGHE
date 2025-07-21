// models/SearchHistory.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Đảm bảo đường dẫn đúng đến config/database

const SearchHistory = sequelize.define('SearchHistory', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        autoIncrement: true
    },
    keyword: {
        type: DataTypes.STRING,
        allowNull: false
    },
    userId: {
        type: DataTypes.INTEGER,
        allowNull: false
    },
    createdAt: {
        type: DataTypes.DATE,
        allowNull: false,
        defaultValue: DataTypes.NOW
    }
}, {
    tableName: 'searchhistories',
    updatedAt: false,
    indexes: [
        {
            fields: ['userId']
        },
        {
            fields: ['createdAt']
        }
    ]
});

module.exports = SearchHistory; // <--- Dòng này CẦN PHẢI CÓ