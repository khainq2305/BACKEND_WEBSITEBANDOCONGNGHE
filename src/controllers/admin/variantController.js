// src/controllers/admin/variantController.js
const { Variant } = require('../../models');

class VariantController {
  static async getAll(req, res) {
    try {
      const data = await Variant.findAll({ where: { isActive: true } });
      res.json(data);
    } catch (error) {
      console.error("Lỗi lấy variant:", error);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async create(req, res) {
    try {
      const { name, description, sortOrder } = req.body;
      const variant = await Variant.create({ name, description, sortOrder });
      res.status(201).json(variant);
    } catch (error) {
      console.error("Lỗi tạo variant:", error);
      res.status(500).json({ message: "Lỗi khi tạo variant" });
    }
  }
}

module.exports = VariantController;
