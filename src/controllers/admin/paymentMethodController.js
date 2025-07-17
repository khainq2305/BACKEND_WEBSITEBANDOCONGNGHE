const { PaymentMethod } = require("../../models");

class PaymentMethodController {
  // GET /api/payment-methods?active=1|0
  static async getAll(req, res) {
    try {
      const { active } = req.query;          // tuỳ chọn lọc
      const where = {};
      if (active !== undefined) where.isActive = !!Number(active);

      const methods = await PaymentMethod.findAll({ where });
      return res.json(methods);
    } catch (err) {
      console.error("Lỗi lấy payment methods:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }

  // POST /api/payment-methods
  static async create(req, res) {
    try {
      const { code, name, isActive = true } = req.body;
      if (!code || !name) {
        return res.status(400).json({ message: "Thiếu code hoặc name" });
      }

      const method = await PaymentMethod.create({ code, name, isActive });
      return res.status(201).json(method);
    } catch (err) {
      console.error("Lỗi tạo payment method:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }

  // PUT /api/payment-methods/:id
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { code, name } = req.body;

      const method = await PaymentMethod.findByPk(id);
      if (!method) return res.status(404).json({ message: "Không tìm thấy!" });

      await method.update({ code, name });
      return res.json(method);
    } catch (err) {
      console.error("Lỗi cập nhật payment method:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }

  // PATCH /api/payment-methods/:id/toggle
  static async toggleActive(req, res) {
    try {
      const { id } = req.params;

      const method = await PaymentMethod.findByPk(id);
      if (!method) return res.status(404).json({ message: "Không tìm thấy!" });

      method.isActive = !method.isActive;
      await method.save();

      return res.json({
        message: `Đã ${method.isActive ? "bật" : "tắt"} phương thức thanh toán`,
        method,
      });
    } catch (err) {
      console.error("Lỗi toggle payment method:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }
}

module.exports = PaymentMethodController;
