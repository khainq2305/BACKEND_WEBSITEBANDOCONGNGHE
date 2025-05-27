const { Brand } = require('../models'); // đảm bảo đúng đường dẫn

const validateBrand = async (req, res, next) => {
    const { name, description, isActive } = req.body;
    const file = req.file;
    const id = req.params.id; // có thể undefined nếu là POST

    // Kiểm tra tên
    if (!name || name.trim() === '') {
        return res.status(400).json({ field: 'name', message: 'Tên thương hiệu không được để trống!' });
    }

    // Kiểm tra trùng tên
    const existing = await Brand.findOne({
        where: {
            name: name.trim(),
            ...(id ? { id: { [require('sequelize').Op.ne]: id } } : {}) // nếu là PUT, loại trừ chính nó
        },
        paranoid: false
    });

    if (existing) {
        return res.status(400).json({ field: 'name', message: 'Tên thương hiệu đã tồn tại!' });
    }

    // Kiểm tra mô tả
    if (description && typeof description !== 'string') {
        return res.status(400).json({ field: 'description', message: 'Mô tả phải là một chuỗi!' });
    }

    // Kiểm tra isActive hợp lệ
    const validStatus = ['1', '0', 1, 0];
    if (isActive !== undefined && !validStatus.includes(isActive)) {
        return res.status(400).json({ field: 'isActive', message: 'Trạng thái phải là 1 (hiển thị) hoặc 0 (ẩn)' });
    }

    // Ép về số
    req.body.isActive = Number(isActive) === 1 ? 1 : 0;

    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/svg+xml', 'image/x-icon'];
    const maxSize = 2 * 1024 * 1024; // 2MB

    // Kiểm tra ảnh khi tạo mới
    if (req.method === 'POST') {
        if (!file) {
            return res.status(400).json({ field: 'logoUrl', message: 'Vui lòng chọn ảnh logoUrl cho thương hiệu!' });
        }
        if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({ field: 'logoUrl', message: 'Chỉ chấp nhận JPG, PNG, WEBP, SVG, ICO' });
        }
        if (file.size > maxSize) {
            return res.status(400).json({ field: 'logoUrl', message: 'Dung lượng ảnh tối đa là 2MB' });
        }
    }

    // PUT có file thì kiểm tra
    if (req.method === 'PUT' && file) {
        if (!allowedTypes.includes(file.mimetype)) {
            return res.status(400).json({ field: 'logoUrl', message: 'Chỉ chấp nhận JPG, PNG, WEBP, SVG, ICO' });
        }
        if (file.size > maxSize) {
            return res.status(400).json({ field: 'logoUrl', message: 'Dung lượng ảnh tối đa là 2MB' });
        }
    }

    next();
};

module.exports = {
    validateBrand,
};
