// services/stockLogService.js

const {
  Sku,
  StockLog,
  User,
  sequelize,
  Role,
  Product,
  Category,
} = require("../../models");

class StockLogService {
  /**
   * Nhập / xuất kho có kiểm soát
   * @param {Object} payload { skuId, quantity, type, reason, user }
   * - type = 'import' | 'export'
   */
  /**
   * Nhập hoặc xuất kho có kiểm soát
   * @param {Object} payload { skuId, quantity, type, reason, userId, originalPrice?, price? }
   */
  static async adjustStock({
    skuId,
    quantity,
    type,
    reason,
    userId,
    originalPrice,
    price,
  }) {
    if (!["import", "export"].includes(type)) {
      throw new Error("Loại giao dịch không hợp lệ");
    }

    const adjQuantity =
      type === "export" ? -Math.abs(quantity) : Math.abs(quantity);

    return await sequelize.transaction(async (t) => {
      const sku = await Sku.findByPk(skuId, { transaction: t });
      if (!sku) throw new Error("SKU không tồn tại");

      const newStock = sku.stock + adjQuantity;
      if (newStock < 0) throw new Error("Tồn kho không đủ để xuất");

      // ✅ Nếu nhập thì cập nhật giá
      if (type === "import") {
        if (originalPrice != null) sku.originalPrice = originalPrice;
        if (price != null) sku.price = price;
      }

      sku.stock = newStock;
      await sku.save({ transaction: t });

      await StockLog.create(
        {
          skuId,
          quantity: adjQuantity,
          type,
          reason,
          userId,
          originalPrice,
          price,
        },
        { transaction: t }
      );

      return {
        success: true,
        message: `${type === "import" ? "Nhập" : "Xuất"} kho thành công`,
        stock: newStock,
      };
    });
  }

  /**
   * Điều chỉnh tồn kho thủ công (chính xác về số lượng)
   * @param {Object} payload { skuId, newQuantity, reason, user }
   */
  static async adjustToExactQuantity({ skuId, newQuantity, reason, userId }) {
    return await sequelize.transaction(async (t) => {
      const sku = await Sku.findByPk(skuId, { transaction: t });
      if (!sku) throw new Error("SKU không tồn tại");

      const delta = newQuantity - sku.stock;
      if (delta === 0) {
        return {
          success: false,
          message: "Không có chênh lệch để điều chỉnh.",
        };
      }

      sku.stock = newQuantity;
      await sku.save({ transaction: t });

      await StockLog.create(
        {
          skuId,
          quantity: delta,
          type: "adjust",
          reason,
          userId,
        },
        { transaction: t }
      );

      return {
        success: true,
        oldStock: newQuantity - delta,
        newStock: newQuantity,
        delta,
        message: "Điều chỉnh tồn kho thành công",
      };
    });
  }

  /**
   * Lấy lịch sử theo SKU
   */
  static async getLogsBySku() {
    return await StockLog.findAll({
      include: [
        {
          model: Sku,
          as: "sku",
          attributes: ['id'],
          include: [
            {
              model: Product,
              as: 'product',
              attributes: ["id", "name", "thumbnail"],
              include: [
                {
                  model: Category,
                  as: 'category',
                  attributes: ['id', 'name']
                }
              ]
            },
          ],
        },

        {
          model: User,
          as: "createdBy",
          attributes: ["id", "fullName", "avatarUrl"], // ✅ XÓA 'role'
          include: [
            {
              model: Role,
              as: "roles",
              attributes: ["id", "name"],
              through: { attributes: [] }, // ✅ ẩn bảng trung gian
            },
          ],
        },
      ],
      order: [["createdAt", "DESC"]],
    });
  }
}

module.exports = StockLogService;
