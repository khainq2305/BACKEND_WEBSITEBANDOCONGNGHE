// src/models/Ward.js
const { DataTypes } = require('sequelize');
const sequelize = require('../config/database'); // Đảm bảo đường dẫn này đúng

const Ward = sequelize.define('Ward', {
    id: {
        type: DataTypes.INTEGER,
        primaryKey: true,
        // XÓA DÒNG autoIncrement: true, (vì ID là Mã GSO, không tự tăng)
        allowNull: false,
    },
    // XÓA HOÀN TOÀN KHỐI 'code' NẾU NÓ ĐƯỢC ĐỊNH NGHĨA Ở ĐÂY
    // code: { /* ... */ },
    // XÓA HOÀN TOÀN KHỐI 'slug' NẾU NÓ KHÔNG CÓ TRONG BẢNG DB CỦA BẠN
    // slug: { /* ... */ },
    name: {
        type: DataTypes.STRING,
        allowNull: false,
    },
    districtId: {
        type: DataTypes.INTEGER,
        allowNull: false,
    },
}, {
    tableName: 'wards', // Tên bảng trong DB
    timestamps: false, // Đặt thành true nếu bạn có cột createdAt/updatedAt
});

module.exports = Ward;