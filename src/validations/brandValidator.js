const validateBrand = (req, res, next) => {
    const { name, description, logo, isActive } = req.body;

    if (!name || name.trim() === "") {
        return res.status(400).json({ message: "Tên thương hiệu không được để trống!" });
    }

    if (logo && typeof logo !== "string") {
        return res.status(400).json({ message: "Logo phải là một chuỗi (link ảnh)!" });
    }

    if (description && typeof description !== "string") {
        return res.status(400).json({ message: "Mô tả phải là một chuỗi!" });
    }

    if (isActive !== undefined && typeof isActive !== "boolean") {
        return res.status(400).json({ message: "Trạng thái phải là true hoặc false!" });
    }

    next();
};

module.exports = {
    validateBrand,
};
