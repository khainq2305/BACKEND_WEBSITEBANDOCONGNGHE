// src/controllers/admin/variantValueController.js
const { VariantValue } = require('../../models');

class VariantValueController {
  static async create(req, res) {
    try {
      const { variantId, value, description, sortOrder } = req.body;
      const data = await VariantValue.create({ variantId, value, description, sortOrder });
      res.status(201).json(data);
    } catch (error) {
      console.error("Lỗi tạo variant value:", error);
      res.status(500).json({ message: "Lỗi khi tạo giá trị biến thể" });
    }
  }
}

module.exports = VariantValueController;
