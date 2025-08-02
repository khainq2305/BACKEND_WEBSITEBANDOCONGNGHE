const { Combo, ComboSku, Sku } = require('../../models');

class ClientComboController {
  static async getAll(req, res) {
    try {
      const combos = await Combo.findAll({
        where: { isActive: true },
        order: [['createdAt', 'DESC']],
        include: [
          {
            model: ComboSku,
            as: 'comboSkus',
            include: [{ model: Sku, as: 'sku' }]
          }
        ]
      });
      res.json(combos);
    } catch (error) {
      console.error("Lỗi lấy combo client:", error);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = ClientComboController;
