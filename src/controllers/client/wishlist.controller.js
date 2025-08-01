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

const { Op, Sequelize } = require("sequelize"); // Thêm Sequelize

// Import the helper function
const { processSkuPrices } = require("../../helpers/priceHelper"); // Điều chỉnh đường dẫn nếu cần

class WishlistController {
  static async getAll(req, res) {
    try {
      const userId = req.user.id;
      const { keyword } = req.query;
      const now = new Date();

      // LẤY TẤT CẢ DỮ LIỆU FLASH SALE ĐANG HOẠT ĐỘNG TRƯỚC VỚI CÁC THÔNG TIN CẦN THIẾT
      const allActiveFlashSales = await FlashSale.findAll({
        where: {
          isActive: true,
          deletedAt: null,
          startTime: { [Op.lte]: now },
          endTime: { [Op.gte]: now },
        },
        include: [
          {
            model: FlashSaleItem,
            as: "flashSaleItems",
            required: false,
            attributes: [
              "id",
              "flashSaleId",
              "skuId",
              "salePrice",
              "quantity",
              "maxPerUser",
              [
                Sequelize.literal(`(
                                    SELECT COALESCE(SUM(oi.quantity), 0)
                                    FROM orderitems oi
                                    INNER JOIN orders o ON oi.orderId = o.id
                                    WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                                    AND oi.skuId = flashSaleItems.skuId
                                    AND o.status IN ('completed', 'delivered')
                                )`),
                "soldQuantityForFlashSaleItem",
              ],
            ],
            include: [
              {
                model: Sku,
                as: "sku",
                attributes: [
                  "id",
                  "skuCode",
                  "price",
                  "originalPrice",
                  "stock",
                  "productId",
                ],
                include: [
                  { model: Product, as: "product", attributes: ["categoryId"] },
                ],
              },
            ],
          },
          {
            model: FlashSaleCategory,
            as: "categories",
            required: false,
            include: [
              {
                model: FlashSale,
                as: "flashSale",
                attributes: ["endTime"],
                required: false,
              },
            ],
          },
        ],
      });

      const allActiveFlashSaleItemsMap = new Map();
      const allActiveCategoryDealsMap = new Map();

      allActiveFlashSales.forEach((saleEvent) => {
        const saleEndTime = saleEvent.endTime;
        const saleId = saleEvent.id;

        (saleEvent.flashSaleItems || []).forEach((fsi) => {
          const sku = fsi.sku;
          if (!sku) return;
          const skuId = sku.id;
          const flashItemSalePrice = parseFloat(fsi.salePrice);
          const soldForThisItem = parseInt(
            fsi.dataValues.soldQuantityForFlashSaleItem || 0
          );
          const flashLimit = fsi.quantity;

          const isSoldOutForThisItem =
            flashLimit != null && soldForThisItem >= flashLimit;

          if (!isSoldOutForThisItem) {
            // Chỉ thêm vào map nếu giá sale thấp hơn giá đã có, hoặc là mục đầu tiên
            // (hoặc nếu là giá cố định thì không quan trọng)
            if (
              !allActiveFlashSaleItemsMap.has(skuId) ||
              flashItemSalePrice <
                allActiveFlashSaleItemsMap.get(skuId).salePrice
            ) {
              allActiveFlashSaleItemsMap.set(skuId, {
                salePrice: flashItemSalePrice,
                quantity: flashLimit,
                soldQuantity: soldForThisItem,
                maxPerUser: fsi.maxPerUser,
                flashSaleId: saleId,
                flashSaleEndTime: saleEndTime,
              });
            }
          } else {
            // Nếu flash sale đã hết hàng, vẫn thêm vào map nhưng đánh dấu đã hết hàng
            if (!allActiveFlashSaleItemsMap.has(skuId)) {
              // Chỉ thêm nếu chưa có flash sale nào cho SKU này
              allActiveFlashSaleItemsMap.set(skuId, {
                ...fsi.toJSON(),
                isSoldOut: true,
              });
            }
          }
        });

        (saleEvent.categories || []).forEach((fsc) => {
          const categoryId = fsc.categoryId;
          if (!allActiveCategoryDealsMap.has(categoryId)) {
            allActiveCategoryDealsMap.set(categoryId, []);
          }
          allActiveCategoryDealsMap.get(categoryId).push({
            discountType: fsc.discountType,
            discountValue: fsc.discountValue,
            priority: fsc.priority,
            endTime: saleEndTime,
            flashSaleId: saleId,
            flashSaleCategoryId: fsc.id,
          });
        });
      });

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
                attributes: ["id", "name", "thumbnail", "slug", "categoryId"],
                where: keyword
                  ? { name: { [Op.like]: `%${keyword}%` } }
                  : undefined,
              },
              {
                model: Sku,
                as: "sku",
                attributes: [
                  "id",
                  "price",
                  "originalPrice",
                  "skuCode",
                  "stock",
                  "productId",
                ],
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
                ],
              },
            ],
          },
        ],
      });

      if (!wishlists.length) return res.json([]);

      const processedItems = [];

      wishlists.forEach((wl) => {
        wl.items.forEach((it) => {
          if (!it.product || !it.sku) return;

          const sku = it.sku;
          const product = it.product;

          const skuDataForHelper = {
            ...sku.toJSON(),
            Product: { category: { id: product.categoryId } },
          };

          const priceResults = processSkuPrices(
            skuDataForHelper,
            allActiveFlashSaleItemsMap,
            allActiveCategoryDealsMap
          );

          sku.dataValues.currentPrice = priceResults.price;
          sku.dataValues.strikethroughPrice = priceResults.originalPrice;
          sku.dataValues.discountAmount = priceResults.discount;
          sku.dataValues.flashSaleInfo = priceResults.flashSaleInfo;
          sku.dataValues.hasDeal = priceResults.hasDeal;

          processedItems.push(it);
        });
      });

      const variantTxt = (sku) =>
        (sku?.variantValues || [])
          .map(
            (v) => `${v.variantValue?.variant?.name}: ${v.variantValue?.value}`
          )
          .join(" - ");

      const result = processedItems.map((it) => ({
        id: it.id,
        productId: it.productId,
        skuId: it.skuId,
        product: it.product,
        sku: {
          ...it.sku.toJSON(), // Chuyển SKU sang plain object
          price: it.sku.dataValues.currentPrice, // Gán giá hiện tại
          originalPrice: it.sku.dataValues.strikethroughPrice, // Gán giá gốc cho frontend sử dụng
          flashSaleInfo: it.sku.dataValues.flashSaleInfo, // Gán thông tin flash sale
          hasDeal: it.sku.dataValues.hasDeal, // Gán trạng thái có khuyến mãi
          // Các thuộc tính khác của SKU vẫn được giữ nguyên
        },
        variantText: variantTxt(it.sku),
        // Gửi oldPrice riêng để frontend dễ dùng cho giá gạch ngang
        oldPrice:
          it.sku.dataValues.strikethroughPrice > it.sku.dataValues.currentPrice
            ? it.sku.dataValues.strikethroughPrice
            : null,
        discount: it.sku.dataValues.discountAmount,
        inStock: (it.sku.stock || 0) > 0,
        flashSaleInfo: it.sku.dataValues.flashSaleInfo, // Redundant but ensures consistency
        hasDeal: it.sku.dataValues.hasDeal, // Redundant but ensures consistency
        image: it.sku.ProductMedia?.[0]?.mediaUrl || it.product.thumbnail,
      }));

      return res.json(result);
    } catch (e) {
      console.error("Lỗi lấy wishlist:", e);
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
