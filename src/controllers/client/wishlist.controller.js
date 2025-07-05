const sequelize = require("../../config/database");
const {
  Wishlist,
  WishlistItem,
  Product,
  Sku,
  ProductMedia,
  VariantValue,
  Variant,
  SkuVariantValue,
  FlashSaleItem,
  FlashSale,
  FlashSaleCategory,
  Category,
} = require("../../models");

const { Op } = require("sequelize");

class WishlistController {
  static async getAll(req, res) {
    try {
      const userId = req.user.id;
      const { keyword } = req.query;
      const now = new Date();

      const wishlists = await Wishlist.findAll({
        where: { userId },
        include: [
          {
            model: WishlistItem,
            as: "items",
            include: [
              {
                model: Product,
                as: "product",
                attributes: ["id", "name", "thumbnail", "slug"],
                where: keyword
                  ? { name: { [Op.like]: `%${keyword}%` } }
                  : undefined,
              },
              {
                model: Sku,
                as: "sku",
                attributes: ["id", "price", "originalPrice", "skuCode"],
                include: [
                  {
                    model: ProductMedia,
                    as: "ProductMedia",
                    attributes: ["mediaUrl"],
                    separate: true,
                    limit: 1,
                    order: [["sortOrder", "ASC"]],
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
                  {
                    model: FlashSaleItem,
                    as: "flashSaleSkus",
                    required: false,
                    where: { isActive: true },
                    attributes: ["salePrice"],
                    include: [
                      {
                        model: FlashSale,
                        as: "flashSale",
                        attributes: ["id", "title", "startTime", "endTime", "bgColor"],
                        where: {
                          startTime: { [Op.lte]: now },
                          endTime: { [Op.gte]: now },
                        },
                        include: [
                          {
                            model: FlashSaleCategory,
                            as: "categories",
                            attributes: ["discountType", "discountValue", "priority"],
                            include: [
                              {
                                model: Category,
                                as: "category",
                                attributes: ["id", "name"],
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
          },
        ],
      });

      if (!wishlists.length) return res.json([]);

      // ✅ TÍNH SALE PRICE GIỐNG FLASH SALE CONTROLLER
      wishlists.forEach((wl) => {
        wl.items.forEach((it) => {
          const sku = it.sku;
          const basePrice = sku.price ?? sku.originalPrice ?? 0;

          let salePrice = null;
          let bestPriority = -1;

          if (sku.flashSaleSkus && sku.flashSaleSkus.length > 0) {
            const item = sku.flashSaleSkus[0];
            const fs = item.flashSale;

            if (
              fs &&
              fs.startTime <= now &&
              fs.endTime >= now
            ) {
              if (item.salePrice) {
                salePrice = item.salePrice;
              } else {
                const categories = fs.categories || [];
                categories.forEach((cat) => {
                  const { discountType, discountValue, priority = 0 } = cat;
                  if (priority >= bestPriority) {
                    let newPrice = basePrice;
                    if (discountType === "percent") {
                      newPrice = (basePrice * (100 - discountValue)) / 100;
                    } else {
                      newPrice = basePrice - discountValue;
                    }
                    newPrice = Math.max(0, Math.round(newPrice / 1000) * 1000);
                    salePrice = newPrice;
                    bestPriority = priority;
                  }
                });
              }
            }
          }

          sku.dataValues.salePrice = salePrice;
        });
      });

      const variantTxt = (sku) =>
        (sku?.variantValues || [])
          .map(
            (v) => `${v.variantValue?.variant?.name}: ${v.variantValue?.value}`
          )
          .join(" - ");

      const result = wishlists.flatMap((wl) =>
        wl.items.map((it) => ({
          id: it.id,
          productId: it.productId,
          skuId: it.skuId,
          product: it.product,
          sku: it.sku,
          variantText: variantTxt(it.sku),
        }))
      );

      return res.json(result);
    } catch (e) {
      console.error("🔥 wishlist error:", e);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async add(req, res) {
    try {
      const userId = req.user.id;
      const productId = parseInt(req.params.productId);
      const skuId = req.body?.skuId ? parseInt(req.body.skuId) : null;

      let wishlist = await Wishlist.findOne({
        where: { userId, isDefault: true },
      });

      if (!wishlist) {
        wishlist = await Wishlist.create({
          userId,
          name: "Danh sách yêu thích mặc định",
          isDefault: true,
        });
      }

      const exists = await WishlistItem.findOne({
        where: {
          wishlistId: wishlist.id,
          productId,
          skuId,
        },
      });

      if (exists) {
        return res
          .status(400)
          .json({ message: "Đã tồn tại trong danh sách yêu thích" });
      }

      const item = await WishlistItem.create({
        wishlistId: wishlist.id,
        productId,
        skuId,
      });

      res.status(201).json(item);
    } catch (err) {
      console.error("❌ Lỗi thêm wishlist:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async remove(req, res) {
    try {
      const userId = req.user.id;
      const productId = parseInt(req.params.productId);
      const skuId = req.params.skuId ? parseInt(req.params.skuId) : null;

      const wishlist = await Wishlist.findOne({
        where: { userId, isDefault: true },
      });

      if (!wishlist) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy danh sách yêu thích" });
      }

      const deleted = await WishlistItem.destroy({
        where: {
          wishlistId: wishlist.id,
          productId,
          skuId,
        },
        force: true,
      });

      if (deleted === 0) {
        return res
          .status(404)
          .json({ message: "Không tìm thấy mục yêu thích" });
      }

      res.json({ message: "Đã xóa khỏi yêu thích" });
    } catch (err) {
      console.error("Lỗi xoá wishlist:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = WishlistController;
