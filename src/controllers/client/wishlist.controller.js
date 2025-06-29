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

      const wishlists = await Wishlist.findAll({
        where: { userId },
        include: [
          {
            model: WishlistItem,
            as: "items",
            include: [
              /* PRODUCT */
              {
                model: Product,
                as: "product",
                attributes: ["id", "name", "thumbnail", "slug"],
                where: keyword
                  ? { name: { [Op.like]: `%${keyword}%` } }
                  : undefined,
              },
              /* SKU + liên kết */
              {
                model: Sku,
                as: "sku",
                attributes: ["id", "price", "originalPrice", "skuCode"],
                include: [
                  {
                    /* ảnh đại diện */ model: ProductMedia,
                    as: "ProductMedia",
                    attributes: ["mediaUrl"],
                    separate: true,
                    limit: 1,
                    order: [["sortOrder", "ASC"]],
                  },
                  {
                    /* biến thể */ model: SkuVariantValue,
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
                        attributes: ["id", "title", "startTime", "endTime", 'bgColor'],
                        include: [
                          {
                            model: FlashSaleCategory,
                            as: "categories",
                            attributes: ["discountType", "discountValue"],
                            include: [
                              {
                                model: Category,
                                as: "category",
                                attributes: [
                                  "id",
                                  "name",
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
          },
        ],
      });

      if (!wishlists.length) return res.json([]);

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
        console.log("🔵 [ADD WISHLIST] Chưa có wishlist, tạo mới...");
        wishlist = await Wishlist.create({
          userId,
          name: "Danh sách yêu thích mặc định",
          isDefault: true,
        });
        console.log("✅ [ADD WISHLIST] Wishlist mới:", wishlist.id);
      }

      const exists = await WishlistItem.findOne({
        where: {
          wishlistId: wishlist.id,
          productId,
          skuId,
        },
      });

      console.log("🔍 [ADD WISHLIST] exists:", !!exists);

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

      console.log(
        "✅ [ADD WISHLIST] Đã thêm vào danh sách yêu thích:",
        item.id
      );
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
