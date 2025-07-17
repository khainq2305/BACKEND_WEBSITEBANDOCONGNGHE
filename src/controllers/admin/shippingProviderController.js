const { ShippingProvider } = require("../../models");

class ShippingProviderController {
  // GET /api/shipping-providers?active=1|0
  static async getAll(req, res) {
    try {
      const { active } = req.query;
      const where = {};
      if (active !== undefined) where.isActive = !!Number(active);

      const providers = await ShippingProvider.findAll({ where });
      return res.json(providers);
    } catch (err) {
      console.error("Lỗi lấy shipping providers:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }

  // POST /api/shipping-providers
  static async create(req, res) {
    try {
      const { code, name, isActive = true } = req.body;
      if (!code || !name) {
        return res.status(400).json({ message: "Thiếu code hoặc name" });
      }

      const provider = await ShippingProvider.create({ code, name, isActive });
      return res.status(201).json(provider);
    } catch (err) {
      console.error("Lỗi tạo shipping provider:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }

  // PUT /api/shipping-providers/:id
  static async update(req, res) {
    try {
      const { id } = req.params;
      const { code, name } = req.body;

      const provider = await ShippingProvider.findByPk(id);
      if (!provider) return res.status(404).json({ message: "Không tìm thấy!" });

      await provider.update({ code, name });
      return res.json(provider);
    } catch (err) {
      console.error("Lỗi cập nhật shipping provider:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }

  // PATCH /api/shipping-providers/:id/toggle
  static async toggleActive(req, res) {
    try {
      const { id } = req.params;

      const provider = await ShippingProvider.findByPk(id);
      if (!provider) return res.status(404).json({ message: "Không tìm thấy!" });

      provider.isActive = !provider.isActive;
      await provider.save();

      return res.json({
        message: `Đã ${provider.isActive ? "bật" : "tắt"} hãng vận chuyển`,
        provider,
      });
    } catch (err) {
      console.error("Lỗi toggle shipping provider:", err);
      return res.status(500).json({ message: "Lỗi máy chủ" });
    }
  }
}

module.exports = ShippingProviderController;
