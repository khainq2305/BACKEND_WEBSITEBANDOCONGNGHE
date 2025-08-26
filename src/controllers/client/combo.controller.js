const {
  Combo,
  ComboSku,
  Sku,
  Product,
  ProductSpec,
  SkuVariantValue,
  VariantValue,
  Variant,
} = require("../../models");
const sequelize = require("../../config/database"); // <-- thêm dòng này

class ClientComboController {
  static async getAll(req, res) {
    try {
      console.log(
        "[COMBO][getAll] limit=%s offset=%s auth=%s",
        req.query.limit || 50,
        req.query.offset || 0,
        req.headers.authorization ? "yes" : "no"
      );
      const limit = Number(req.query.limit || 50);
      const offset = Number(req.query.offset || 0);

      // Tính capacityByStock (theo tồn SKU) + remainingSlots (theo suất)
      const [rows] = await sequelize.query(
        `
      SELECT
        c.*,
        (c.quantity - COALESCE(c.sold, 0)) AS remainingSlots,
        MIN(FLOOR(s.stock / GREATEST(cs.quantity, 1))) AS capacityByStock
      FROM combos c
      JOIN comboskus cs ON cs.comboId = c.id
      JOIN skus      s  ON s.id      = cs.skuId
      WHERE c.isActive = 1 AND c.deletedAt IS NULL
      GROUP BY c.id
      ORDER BY c.createdAt DESC
      LIMIT :limit OFFSET :offset
    `,
        { replacements: { limit, offset } }
      );

      const data = rows.map((r) => {
        const capacityByStock = Number(r.capacityByStock ?? 0);
        const remainingSlots = Number(r.remainingSlots ?? 0);
        return {
          ...r,
          capacityByStock,
          remainingSlots,
          isOutOfStock: capacityByStock <= 0, // FE sẽ phủ "HẾT HÀNG"
          inStock: capacityByStock > 0,
          availableForSale: Math.max(
            0,
            Math.min(remainingSlots, capacityByStock)
          ),
        };
      });

      

      return res.json(data);
    } catch (error) {
      console.error("Lỗi lấy combo client:", error);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  // Lấy chi tiết combo theo slug
  static async getBySlug(req, res) {
    try {
      
      const combo = await Combo.findOne({
        where: { slug: req.params.slug },
        include: [
          {
            model: ComboSku,
            as: "comboSkus",
            include: [
              {
                model: Sku,
                as: "sku",
                include: [
                  {
                    model: Product,
                    as: "product",
                    attributes: [
                      "id",
                      "name",
                      "slug",
                      "thumbnail",
                      "description",
                    ],
                    include: [{ model: ProductSpec, as: "specs" }],
                  },
                  {
                    model: SkuVariantValue,
                    as: "variantValues",
                    include: [
                      {
                        model: VariantValue,
                        as: "variantValue",
                        include: [
                          {
                            model: Variant,
                            as: "variant",
                            attributes: ["name"],
                          },
                        ],
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!combo) {
       
        return res.status(404).json({ message: "Combo không tồn tại" });
      }

     
      const [capRows] = await sequelize.query(
        `
      SELECT
        (c.quantity - COALESCE(c.sold, 0)) AS remainingSlots,
        MIN(FLOOR(s.stock / GREATEST(cs.quantity, 1))) AS capacityByStock
      FROM combos c
      JOIN comboskus cs ON cs.comboId = c.id
      JOIN skus      s  ON s.id      = cs.skuId
      WHERE c.id = :comboId
      GROUP BY c.id
      LIMIT 1
    `,
        { replacements: { comboId: combo.id } }
      );

      const remainingSlots = Number(capRows?.[0]?.remainingSlots ?? 0);
      const capacityByStock = Number(capRows?.[0]?.capacityByStock ?? 0);
      const availableForSale = Math.max(
        0,
        Math.min(remainingSlots, capacityByStock)
      );
      const isOutOfStock = capacityByStock <= 0 || availableForSale <= 0;
      const inStock = !isOutOfStock;

      // Format dữ liệu trả về cho FE (giữ nguyên phần cũ)
      const formatted = {
        ...combo.toJSON(),
        capacityByStock,
        remainingSlots,
        availableForSale,
        isOutOfStock,
        inStock,
        comboSkus: combo.comboSkus.map((item) => {
          const sku = item.sku || {};
          const product = sku.product || {};
          const variantValues = sku.variantValues || [];
          const specifications = product.specs || [];

          // Ảnh ưu tiên: variant image -> sku.thumbnail -> product.thumbnail
          const vvWithImg = variantValues.find(
            (v) => v?.variantValue?.imageUrl
          );
          const chosenThumb =
            vvWithImg?.variantValue?.imageUrl ||
            sku.thumbnail ||
            product.thumbnail ||
            "/placeholder.png";

          return {
            skuId: item.skuId,
            quantity: item.quantity,
            price: sku.price || 0,
            stock: sku.stock || 0,
            description: product.description || "",
            thumbnail: chosenThumb,
            productName: product.name || "",
            productId: sku.productId || product.id || null,
            productSlug: product.slug || null,
            specifications: specifications.map((s) => ({
              specKey: s.specKey,
              specValue: s.specValue,
              specGroup: s.specGroup,
            })),
            variantValues: variantValues.map((v) => ({
              variantName: v?.variantValue?.variant?.name || "",
              value: v?.variantValue?.value || "",
              imageUrl: v?.variantValue?.imageUrl || null,
            })),
          };
        }),
      };
      
      
      return res.json(formatted);
    } catch (err) {
      console.error("[COMBO][getBySlug][ERR]", err?.message, err?.stack);
      res.status(500).json({ message: "Lỗi server khi lấy combo" });
    }
  }

  static async getAvailable(req, res) {
    try {
      // const sequelize = require("../../config/database");
      const limit = Number(req.query.limit || 50);
      const offset = Number(req.query.offset || 0);

      
      const [rows] = await sequelize.query(
        `
      SELECT
        c.*,
        (c.quantity - COALESCE(c.sold, 0)) AS remainingSlots,
        MIN(FLOOR(s.stock / GREATEST(cs.quantity, 1))) AS capacityByStock
      FROM combos c
      JOIN comboskus cs ON cs.comboId = c.id
      JOIN skus      s  ON s.id = cs.skuId
      WHERE c.isActive = 1 AND c.deletedAt IS NULL
      GROUP BY c.id
      HAVING remainingSlots > 0
      ORDER BY c.createdAt DESC
      LIMIT :limit OFFSET :offset
    `,
        { replacements: { limit, offset } }
      );

      const data = rows.map((r) => {
        const remainingSlots = Number(r.remainingSlots ?? 0);
        const capacityByStock = Number(r.capacityByStock ?? 0);
        return {
          ...r,
          remainingSlots,
          capacityByStock,
          availableForSale: Math.max(
            0,
            Math.min(remainingSlots, capacityByStock)
          ),
          isOutOfStock: capacityByStock <= 0, // ➜ FE sẽ hiển thị "HẾT HÀNG"
        };
      });

      return res.json({ success: true, data });
    } catch (err) {
      console.error("getAvailable Combos error:", err);
      res.status(500).json({ message: "Lỗi server khi lấy combo khả dụng" });
    }
  }
}

module.exports = ClientComboController;
