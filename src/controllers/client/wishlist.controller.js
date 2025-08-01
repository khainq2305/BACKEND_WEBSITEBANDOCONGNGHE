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
const { processSkuPrices } = require('../../helpers/priceHelper'); // Điều chỉnh đường dẫn nếu cần

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
                        as: 'flashSaleItems',
                        required: false,
                        attributes: ['id', 'flashSaleId', 'skuId', 'salePrice', 'quantity', 'maxPerUser',
                            [
                                Sequelize.literal(`(
                                    SELECT COALESCE(SUM(oi.quantity), 0)
                                    FROM orderitems oi
                                    INNER JOIN orders o ON oi.orderId = o.id
                                    WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                                    AND oi.skuId = flashSaleItems.skuId
                                    AND o.status IN ('completed', 'delivered')
                                )`),
                                'soldQuantityForFlashSaleItem'
                            ]
                        ],
                        include: [{
                            model: Sku,
                            as: 'sku',
                            attributes: ['id', 'skuCode', 'price', 'originalPrice', 'stock', 'productId'],
                            include: [{ model: Product, as: 'product', attributes: ['categoryId'] }]
                        }],
                    },
                    {
                        model: FlashSaleCategory,
                        as: 'categories',
                        required: false,
                        include: [{
                            model: FlashSale,
                            as: 'flashSale',
                            attributes: ['endTime'],
                            required: false
                        }]
                    }
                ]
            });

            const allActiveFlashSaleItemsMap = new Map();
            const allActiveCategoryDealsMap = new Map();

            allActiveFlashSales.forEach(saleEvent => {
                const saleEndTime = saleEvent.endTime;
                const saleId = saleEvent.id;

                (saleEvent.flashSaleItems || []).forEach(fsi => {
                    const sku = fsi.sku;
                    if (!sku) return;
                    const skuId = sku.id;
                    const flashItemSalePrice = parseFloat(fsi.salePrice);
                    const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0); 
                    const flashLimit = fsi.quantity;

                    const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

                    if (!isSoldOutForThisItem) {
                        if (!allActiveFlashSaleItemsMap.has(skuId) || flashItemSalePrice < allActiveFlashSaleItemsMap.get(skuId).salePrice) {
                            allActiveFlashSaleItemsMap.set(skuId, {
                                salePrice: flashItemSalePrice,
                                quantity: flashLimit,
                                soldQuantity: soldForThisItem,
                                maxPerUser: fsi.maxPerUser,
                                flashSaleId: saleId,
                                flashSaleEndTime: saleEndTime
                            });
                        }
                    }
                });

                (saleEvent.categories || []).forEach(fsc => {
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
                        flashSaleCategoryId: fsc.id
                    });
                });
            });
            // HẾT PHẦN LẤY DỮ LIỆU FLASH SALE

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
                                attributes: ["id", "name", "thumbnail", "slug", "categoryId"], // Ensure categoryId is selected
                                where: keyword
                                    ? { name: { [Op.like]: `%${keyword}%` } }
                                    : undefined,
                            },
                            {
                                model: Sku,
                                as: "sku",
                                attributes: ["id", "price", "originalPrice", "skuCode", "stock", "productId"], // Ensure productId is selected
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
                                    // FlashSaleItem is now handled by the global maps, no need to include here
                                ],
                            },
                        ],
                    },
                ],
            });

            if (!wishlists.length) return res.json([]);

        wishlists.forEach((wl) => {
  wl.items.forEach((it) => {
    const sku = it.sku;
    const product = it.product;

    // 🛑 Fix ở đây
    if (!sku || !product) return;

    const skuDataForHelper = {
      ...sku.toJSON(),
      Product: { category: { id: product?.categoryId } }
    };

    const priceResults = processSkuPrices(
      skuDataForHelper,
      allActiveFlashSaleItemsMap,
      allActiveCategoryDealsMap
    );

    sku.dataValues.price = priceResults.price;
    sku.dataValues.originalPrice = priceResults.originalPrice;
    sku.dataValues.discount = priceResults.discount;
    sku.dataValues.flashSaleInfo = priceResults.flashSaleInfo;
    sku.dataValues.hasDeal = priceResults.hasDeal;
  });
});


            const variantTxt = (sku) =>
                (sku?.variantValues || [])
                    .map(
                        (v) => `${v.variantValue?.variant?.name}: ${v.variantValue?.value}`
                    )
                    .join(" - ");

            const result = wishlists.flatMap((wl) =>
                wl.items
                    .filter(item => item.product) // Filter out items where product might be null due to keyword filter
                    .map((it) => ({
                        id: it.id,
                        productId: it.productId,
                        skuId: it.skuId,
                        product: it.product,
                        sku: it.sku, // Sku now has updated price info
                        variantText: variantTxt(it.sku),
                        // Explicitly add price, oldPrice, discount, inStock for clarity in response
                        price: it.sku.dataValues.price,
                        oldPrice: (it.sku.dataValues.flashSaleInfo && it.sku.dataValues.flashSaleInfo.isSoldOut === false) 
                            ? it.sku.dataValues.originalPrice 
                            : (it.sku.dataValues.originalPrice > it.sku.dataValues.price ? it.sku.dataValues.originalPrice : null),
                        discount: it.sku.dataValues.discount,
                        inStock: (it.sku.stock || 0) > 0,
                        flashSaleInfo: it.sku.dataValues.flashSaleInfo,
                        hasDeal: it.sku.dataValues.hasDeal,
                        image: it.sku.ProductMedia?.[0]?.mediaUrl || it.product.thumbnail, // Use SKU media if available, else product thumbnail
                    }))
            );

            return res.json(result);
        } catch (e) {
            console.error("Lỗi lấy wishlist:", e); // In ra lỗi để debug dễ hơn
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
