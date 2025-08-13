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

class ClientComboController {
  // Lấy tất cả combo (dành cho danh sách combo phía client)
  static async getAll(req, res) {
    try {
      const combos = await Combo.findAll({
        where: { isActive: true },
        order: [["createdAt", "DESC"]],
        include: [
          {
            model: ComboSku,
            as: "comboSkus",
            include: [{ model: Sku, as: "sku" }],
          },
        ],
      });
      res.json(combos);
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
                    attributes: ["name", "thumbnail", "description"],
                    include: [
                      {
                        model: ProductSpec,
                        as: "specs",
                      },
                    ],
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

      // Format dữ liệu trả về cho FE
      const formatted = {
        ...combo.toJSON(),
        comboSkus: combo.comboSkus.map((item) => {
          const sku = item.sku || {};
          const product = sku.product || {};
          const variantValues = sku.variantValues || [];
          const specifications = product.specs || [];

          // Ảnh ưu tiên: ảnh gắn với biến thể (nếu có imageUrl) -> sku.thumbnail -> product.thumbnail
          const vvWithImg = variantValues.find(
            (v) => v?.variantValue?.imageUrl
          );
          const variantImgUrl = vvWithImg?.variantValue?.imageUrl || null;
          const skuThumb = sku.thumbnail || null; // nếu sau này bạn thêm cột thumbnail cho SKU
          const productThumb = product.thumbnail || null;

          const chosenThumb =
            variantImgUrl || skuThumb || productThumb || "/placeholder.png";

          return {
            skuId: item.skuId,
            quantity: item.quantity,
            price: sku.price || 0,
            stock: sku.stock || 0,
            description: product.description || "",

            // Ảnh cho từng SKU trong combo (đã ưu tiên theo biến thể)
            thumbnail: chosenThumb,

            productName: product.name || "",

            specifications: specifications.map((s) => ({
              specKey: s.specKey,
              specValue: s.specValue,
              specGroup: s.specGroup,
            })),

            // Trả về biến thể để FE hiển "Tên SP - Biến thể"
            variantValues: variantValues.map((v) => ({
              variantName: v?.variantValue?.variant?.name || "",
              value: v?.variantValue?.value || "",
              imageUrl: v?.variantValue?.imageUrl || null,
            })),
          };
        }),
      };
console.table(formatted.comboSkus.map(cs => ({
  skuId: cs.skuId,
  chosenThumb: cs.thumbnail,     // ảnh cuối gửi cho FE
  variants: (cs.variantValues||[]).map(v=>`${v.variantName}:${v.value}`).join(' • ')
})));

      return res.json(formatted);
    } catch (err) {
      console.error("getBySlug Combo error:", err);
      res.status(500).json({ message: "Lỗi server khi lấy combo" });
    }
  }
}

module.exports = ClientComboController;
