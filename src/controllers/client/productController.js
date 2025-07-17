const {
    Product,
    Category,
    Brand,
    Sku,
    ProductMedia,
    SkuVariantValue,
    VariantValue,
    Variant,
    Order,
    ProductInfo,
    ProductSpec,
    Review,
    FlashSaleCategory,
    OrderItem,
    FlashSaleItem,
    FlashSale,
} = require("../../models");

const { Sequelize, Op } = require("sequelize");
const { fn, col, literal } = Sequelize;

// Import the helper function
const { processSkuPrices } = require('../../helpers/priceHelper'); // Điều chỉnh đường dẫn nếu cần

class ProductController {
    /* controllers/client/productController.js */
    // controllers/client/productController.js
    static async getProductDetailBySlug(req, res) {
        try {
            const { slug } = req.params;
            const { includeInactive } = req.query;

            const whereClause = { slug };
            if (!includeInactive || includeInactive !== "true")
                whereClause.isActive = 1;

            // LẤY TẤT CẢ DỮ LIỆU FLASH SALE ĐANG HOẠT ĐỘNG TRƯỚC VỚI CÁC THÔNG TIN CẦN THIẾT
            const now = new Date();
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
                        // === ĐIỀU CHỈNH QUAN TRỌNG TẠI ĐÂY ===
                        attributes: ['id', 'flashSaleId', 'skuId', 'salePrice', 'quantity', 'maxPerUser',
                            [
                                // Tính soldQuantity cụ thể cho FlashSaleItem này
                                Sequelize.literal(`(
                                    SELECT COALESCE(SUM(oi.quantity), 0)
                                    FROM orderitems oi
                                    INNER JOIN orders o ON oi.orderId = o.id
                                    WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                                    AND oi.skuId = flashSaleItems.skuId
                                    AND o.status IN ('completed', 'delivered')
                                )`),
                                'soldQuantityForFlashSaleItem' // Đặt tên alias rõ ràng
                            ]
                        ],
                        // ======================================
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
                    // Lấy soldQuantity đã được tính từ truy vấn
                    const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0); 
                    const flashLimit = fsi.quantity;

                    // Kiểm tra xem FlashSaleItem này đã hết suất chưa
                    const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

                    // Chỉ xem xét FlashSaleItem nếu nó chưa hết suất
                    if (!isSoldOutForThisItem) {
                        // So sánh để tìm FlashSaleItem có giá thấp nhất cho SKU này trên toàn hệ thống
                        if (!allActiveFlashSaleItemsMap.has(skuId) || flashItemSalePrice < allActiveFlashSaleItemsMap.get(skuId).salePrice) {
                            allActiveFlashSaleItemsMap.set(skuId, {
                                salePrice: flashItemSalePrice,
                                quantity: flashLimit,
                                soldQuantity: soldForThisItem, // Truyền soldQuantity vào map
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

            const product = await Product.findOne({
                where: whereClause,
                attributes: {
                    include: [
                        [
                            literal(`(
                            SELECT COALESCE(SUM(oi.quantity),0)
                            FROM orderitems oi
                            INNER JOIN skus s ON s.id = oi.skuId
                            INNER JOIN orders o ON o.id = oi.orderId
                            WHERE s.productId = Product.id AND o.status IN ('delivered', 'completed')
                        )`),
                            "soldCount",
                        ],
                        /* rating TB */
                        [
                            literal(`(
                            SELECT AVG(r.rating)
                            FROM reviews r
                            INNER JOIN skus s ON s.id = r.skuId
                            WHERE s.productId = Product.id
                        )`),
                            "averageRating",
                        ],
                        /* số đánh giá */
                        [
                            literal(`(
                            SELECT COUNT(r.id)
                            FROM reviews r
                            INNER JOIN skus s ON s.id = r.skuId
                            WHERE s.productId = Product.id
                        )`),
                            "reviewCount",
                        ],
                    ],
                },
                include: [
                    {
                        model: Category,
                        as: "category",
                        attributes: ["id", "name", "slug"],
                    },
                    { model: Brand, as: "brand", attributes: ["id", "name", "slug"] },

                    /* ---------- SKU ---------- */
                    {
                        model: Sku,
                        as: "skus",
                        // Đảm bảo lấy originalPrice và productId để helper có thể hoạt động đúng
                        attributes: ["id", "skuCode", "price", "originalPrice", "stock", "productId"],
                        include: [
                            /* media chính của SKU */
                            {
                                model: ProductMedia,
                                as: "ProductMedia",
                                attributes: ["mediaUrl", "type", "sortOrder"],
                                separate: true,
                                order: [["sortOrder", "ASC"]],
                            },
                            /* giá trị thuộc tính (màu / dung lượng ...) */
                            {
                                model: SkuVariantValue,
                                as: "variantValues",
                                include: [
                                    {
                                        model: VariantValue,
                                        as: "variantValue",
                                        attributes: ["id", "value", "imageUrl", "colorCode"],
                                        include: [
                                            {
                                                model: Variant,
                                                as: "variant",
                                                attributes: ["id", "name", "type"],
                                            },
                                        ],
                                    },
                                ],
                            },
                            // Không cần include FlashSaleItem ở đây nữa vì đã có map tổng hợp
                            // { model: FlashSaleItem, as: "flashSaleSkus", required: false, include: [...] },
                        ],
                    },

                    /* ---------- thông tin/spec ---------- */
                    { model: ProductInfo, as: "productInfo", attributes: ["content"] },
                    {
                        model: ProductSpec,
                        as: "specs",
                        attributes: ["specKey", "specValue", "specGroup"],
                        order: [["sortOrder", "ASC"]],
                    },
                ],
            });

            if (!product) {
                return res.status(404).json({ message: "Không tìm thấy sản phẩm!" });
            }

            const productJson = product.toJSON();

            // ÁP DỤNG HELPER CHO TỪNG SKU
            productJson.skus = productJson.skus.map((sku) => {
                const skuData = {
                    ...sku,
                    // Gắn thông tin product và category vào skuData để helper có thể truy cập
                    Product: { category: productJson.category }
                };
                const priceResults = processSkuPrices(skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);

                return {
                    ...sku,
                    price: priceResults.price, // Giá cuối cùng sau khi xử lý deal
                    salePrice: priceResults.salePrice, // Giá khuyến mãi (giống price)
                    originalPrice: priceResults.originalPrice, // Giá gốc ban đầu của SKU
                    flashSaleInfo: priceResults.flashSaleInfo, // Thông tin flash sale áp dụng
                    discount: priceResults.discount, // Phần trăm giảm giá
                    hasDeal: priceResults.hasDeal, // Cờ có deal hay không
                };
            });

            // Sắp xếp SKUs theo giá cuối cùng tăng dần
            productJson.skus.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));


            return res.status(200).json({ product: productJson });
        } catch (err) {
            console.error("Lỗi getProductDetailBySlug:", err);
            return res.status(500).json({ message: "Lỗi server" });
        }
    }

    static async getProductsByCategory(req, res) {
        try {
            const {
                slug,
                page = 1,
                limit = 20,
                stock,
                priceRange,
                sort = "popular",
            } = req.query;

            let brandNames = req.query.brand;
            if (typeof brandNames === "string" && brandNames.trim())
                brandNames = brandNames.split(",");
            else if (!Array.isArray(brandNames)) brandNames = [];

            const offset = (+page - 1) * +limit;

            const productWhere = { isActive: 1, deletedAt: null };
            const skuWhere = {};
            let categoryIdsForQuery = [];

            if (slug) {
                const parentCat = await Category.findOne({
                    where: { slug, isActive: 1 },
                    attributes: ["id"],
                });
                if (!parentCat)
                    return res.status(404).json({ message: "Không tìm thấy danh mục" });

                const childIds = await Category.findAll({
                    where: { parentId: parentCat.id, isActive: 1 },
                    attributes: ["id"],
                }).then((r) => r.map((c) => c.id));

                categoryIdsForQuery = [parentCat.id, ...childIds];
                productWhere.categoryId = { [Op.in]: categoryIdsForQuery };
            }

            if (brandNames.length) {
                const brandIds = await Brand.findAll({
                    where: { name: { [Op.in]: brandNames }, isActive: 1 },
                    attributes: ["id"],
                }).then((r) => r.map((b) => b.id));
                if (brandIds.length) productWhere.brandId = { [Op.in]: brandIds };
            }

            if (stock === "true") skuWhere.stock = { [Op.gt]: 0 };

            // LẤY TẤT CẢ DỮ LIỆU FLASH SALE ĐANG HOẠT ĐỘNG TRƯỚC VỚI CÁC THÔNG TIN CẦN THIẾT
            const now = new Date();
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
                        // === ĐIỀU CHỈNH QUAN TRỌNG TẠI ĐÂY ===
                        attributes: ['id', 'flashSaleId', 'skuId', 'salePrice', 'quantity', 'maxPerUser',
                            [
                                // Tính soldQuantity cụ thể cho FlashSaleItem này
                                Sequelize.literal(`(
                                    SELECT COALESCE(SUM(oi.quantity), 0)
                                    FROM orderitems oi
                                    INNER JOIN orders o ON oi.orderId = o.id
                                    WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                                    AND oi.skuId = flashSaleItems.skuId
                                    AND o.status IN ('completed', 'delivered')
                                )`),
                                'soldQuantityForFlashSaleItem' // Đặt tên alias rõ ràng
                            ]
                        ],
                        // ======================================
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
                    // Lấy soldQuantity đã được tính từ truy vấn
                    const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0); 
                    const flashLimit = fsi.quantity;

                    // Kiểm tra xem FlashSaleItem này đã hết suất chưa
                    const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

                    // Chỉ xem xét FlashSaleItem nếu nó chưa hết suất
                    if (!isSoldOutForThisItem) {
                        // So sánh để tìm FlashSaleItem có giá thấp nhất cho SKU này trên toàn hệ thống
                        if (!allActiveFlashSaleItemsMap.has(skuId) || flashItemSalePrice < allActiveFlashSaleItemsMap.get(skuId).salePrice) {
                            allActiveFlashSaleItemsMap.set(skuId, {
                                salePrice: flashItemSalePrice,
                                quantity: flashLimit,
                                soldQuantity: soldForThisItem, // Truyền soldQuantity vào map
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

            // Query products with minimal SKU info for initial filtering (price range, stock)
            // Need to adjust this query to directly incorporate the effective price logic,
            // or fetch more data and filter in memory, which can be less efficient.
            // For now, will fetch with original prices and filter.
            // If `priceRange` is critical for initial DB filtering, a more complex subquery or view might be needed.
            // For simplicity and using the helper, we'll apply price filtering after getting skus.

            // First, get all products matching category and brand criteria
            const preliminaryProducts = await Product.findAll({
                where: productWhere,
                attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage', 'categoryId'],
                include: [
                    {
                        model: Sku,
                        as: 'skus',
                        attributes: ['id', 'price', 'originalPrice', 'stock', 'productId'],
                        // Keep SKU where for stock only if needed. Price filtering happens after price calc.
                        where: skuWhere.stock ? { stock: skuWhere.stock } : {},
                        required: true, // Only show products with at least one matching SKU
                        include: [{ model: ProductMedia, as: "ProductMedia", attributes: ["mediaUrl"], separate: true, limit: 1 }]
                    },
                    {
                        model: Category,
                        as: 'category',
                        attributes: ['id'] // Just need id for price calculation
                    }
                ]
            });

            let productsWithCalculatedPrices = [];

            for (const prod of preliminaryProducts) {
                const prodData = prod.toJSON();
                let hasRelevantSku = false; // Flag to check if any SKU matches priceRange after calculation

                const skus = prodData.skus.map(sku => {
                    const skuWithCategory = { ...sku, Product: { category: { id: prodData.categoryId } } }; // Add category for helper
                    const priceResults = processSkuPrices(skuWithCategory, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);
                    return {
                        ...sku,
                        price: priceResults.price,
                        salePrice: priceResults.salePrice,
                        originalPrice: priceResults.originalPrice,
                        flashSaleInfo: priceResults.flashSaleInfo,
                        discount: priceResults.discount,
                        hasDeal: priceResults.hasDeal
                    };
                }).sort((a, b) => a.price - b.price); // Sort SKUs by calculated price

                // Now, apply priceRange filtering if specified
                if (priceRange) {
                    const ranges = {
                        "Dưới 10 Triệu": { max: 10_000_000 },
                        "Từ 10 - 16 Triệu": { min: 10_000_000, max: 16_000_000 },
                        "Từ 16 - 22 Triệu": { min: 16_000_000, max: 22_000_000 },
                        "Trên 22 Triệu": { min: 22_000_000 },
                    };
                    const selectedRange = ranges[priceRange];

                    if (selectedRange) {
                        hasRelevantSku = skus.some(sku => {
                            const p = sku.price;
                            let matches = true;
                            if (selectedRange.min !== undefined && p < selectedRange.min) matches = false;
                            if (selectedRange.max !== undefined && p > selectedRange.max) matches = false;
                            return matches;
                        });
                    } else {
                        hasRelevantSku = true; // No specific price range, so all are relevant
                    }
                } else {
                    hasRelevantSku = true; // No priceRange filter
                }

                if (hasRelevantSku) {
                    const minPrice = skus.length > 0 ? skus[0].price : 0;
                    const maxPrice = skus.length > 0 ? skus[skus.length - 1].price : 0;

                    productsWithCalculatedPrices.push({
                        ...prodData,
                        skus: skus,
                        min_price: minPrice, // Add for sorting if needed
                        max_price: maxPrice, // Add for sorting if needed
                    });
                }
            }

            // Apply sorting based on calculated prices
            if (sort === "asc") {
                productsWithCalculatedPrices.sort((a, b) => a.min_price - b.min_price);
            } else if (sort === "desc") {
                productsWithCalculatedPrices.sort((a, b) => b.max_price - a.max_price);
            } else if (sort === "popular" || sort === "newest") {
                // For popular/newest, assuming initial DB order is good or we sort by createdAt
                productsWithCalculatedPrices.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            }


            const totalItems = productsWithCalculatedPrices.length;
            const paginatedProducts = productsWithCalculatedPrices.slice(offset, offset + +limit);

            const formatted = paginatedProducts.map((prod) => {
                const skus = prod.skus; // Already sorted by price
                const primary = skus[0] || {}; // Get the lowest priced SKU

                const totalStock = skus.reduce((s, x) => s + (+x.stock || 0), 0);

                return {
                    id: prod.id,
                    name: prod.name,
                    slug: prod.slug,
                    thumbnail: prod.thumbnail, // Use thumbnail as main image for listing
                    badge: prod.badge,
                    image: primary.ProductMedia?.[0]?.mediaUrl || prod.thumbnail,
                    badgeImage: prod.badgeImage,
                    price: primary.price,
                    oldPrice: primary.flashSaleInfo ? primary.originalPrice : (primary.originalPrice > primary.price ? primary.originalPrice : null), // Corrected oldPrice logic
                    originalPrice: primary.originalPrice,
                    discount: primary.discount,
                    inStock: totalStock > 0,
                    // Note: skus array for getProductsByCategory typically not needed in full form, but available if you send it.
                    // For brevity in list view, might only send primary SKU info.
                };
            });

            res.json({
                products: formatted,
                totalItems: totalItems,
                currentPage: +page,
                totalPages: Math.ceil(totalItems / limit),
                paginationEnabled: totalItems > limit,
            });
        } catch (err) {
            console.error("Lỗi getProductsByCategory:", err);
            res.status(500).json({ message: "Lỗi server" });
        }
    }

    /* controllers/client/productController.js */

    // controllers/SectionClientController.js
    static async getRelatedProducts(req, res) {
        try {
            const { categoryId, excludeId } = req.query;
            if (!categoryId)
                return res.status(400).json({ message: 'Cần cung cấp categoryId.' });

            const whereClause = {
                categoryId,
                isActive: 1,
                deletedAt: null,
            };
            if (excludeId) whereClause.id = { [Op.ne]: excludeId };

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
                        // === ĐIỀU CHỈNH QUAN TRỌNG TẠI ĐÂY ===
                        attributes: ['id', 'flashSaleId', 'skuId', 'salePrice', 'quantity', 'maxPerUser',
                            [
                                // Tính soldQuantity cụ thể cho FlashSaleItem này
                                Sequelize.literal(`(
                                    SELECT COALESCE(SUM(oi.quantity), 0)
                                    FROM orderitems oi
                                    INNER JOIN orders o ON oi.orderId = o.id
                                    WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                                    AND oi.skuId = flashSaleItems.skuId
                                    AND o.status IN ('completed', 'delivered')
                                )`),
                                'soldQuantityForFlashSaleItem' // Đặt tên alias rõ ràng
                            ]
                        ],
                        // ======================================
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
                    // Lấy soldQuantity đã được tính từ truy vấn
                    const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0); 
                    const flashLimit = fsi.quantity;

                    // Kiểm tra xem FlashSaleItem này đã hết suất chưa
                    const isSoldOutForThisItem = flashLimit != null && soldForThisItem >= flashLimit;

                    // Chỉ xem xét FlashSaleItem nếu nó chưa hết suất
                    if (!isSoldOutForThisItem) {
                        // So sánh để tìm FlashSaleItem có giá thấp nhất cho SKU này trên toàn hệ thống
                        if (!allActiveFlashSaleItemsMap.has(skuId) || flashItemSalePrice < allActiveFlashSaleItemsMap.get(skuId).salePrice) {
                            allActiveFlashSaleItemsMap.set(skuId, {
                                salePrice: flashItemSalePrice,
                                quantity: flashLimit,
                                soldQuantity: soldForThisItem, // Truyền soldQuantity vào map
                                maxPerUser: fsi.maxPerUser,
                                flashSaleId: saleId,
                                flashSaleEndTime: saleEndTime
                            });
                        }
                    }
                });

                (saleEvent.categories || []).forEach(fsc => {
                    const catId = fsc.categoryId; // Use a different name to avoid conflict with `categoryId` param
                    if (!allActiveCategoryDealsMap.has(catId)) {
                        allActiveCategoryDealsMap.set(catId, []);
                    }
                    allActiveCategoryDealsMap.get(catId).push({
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

            /* ===== lấy product + sku + orderItems ===== */
            const products = await Product.findAll({
                where: whereClause,
                order: [['createdAt', 'DESC']],
                attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage', 'categoryId'], // Ensure categoryId is selected
                include: [{
                    model: Sku,
                    as: 'skus',
                    attributes: ['id', 'price', 'originalPrice', 'stock', 'productId'], // Ensure productId, originalPrice are selected
                    include: [
                        {
                            model: OrderItem,
                            as: 'OrderItems',
                            required: false,
                            include: [{
                                model: Order,
                                as: 'order',
                                attributes: [],
                                required: true,
                                where: { status: { [Op.in]: ['completed', 'delivered'] } },
                            }],
                        },
                        { model: ProductMedia, as: "ProductMedia", attributes: ["mediaUrl"], separate: true, limit: 1 } // Lấy media cho SKU
                    ],
                }],
            });

            /* ===== format ===== */
            const formattedProducts = products.map((prod) => {
                /* ---- soldCount của product ---- */
                const soldCount = (prod.skus || []).reduce((sum, sku) => {
                    const sold = sku.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0;
                    return sum + sold;
                }, 0);

                /* ---- tính giá rẻ nhất + discount bằng helper ---- */
                const skuInfos = (prod.skus || []).map((sku) => {
                    const skuDataWithCategory = {
                        ...sku.toJSON(),
                        Product: { category: { id: prod.categoryId } } // Attach category for helper
                    };
                    return processSkuPrices(skuDataWithCategory, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);
                });

                const best = skuInfos.sort((a, b) => a.price - b.price)[0] || {}; // Lấy SKU có giá tốt nhất

                const totalStock = (prod.skus || []).reduce(
                    (s, x) => s + (+x.stock || 0),
                    0
                );

                return {
                    id: prod.id,
                    name: prod.name,
                    slug: prod.slug,
                    thumbnail: prod.thumbnail, // Use thumbnail as main image for listing
                    badge: prod.badge,
                    image: best.ProductMedia?.[0]?.mediaUrl || prod.thumbnail, // Use SKU media if available, else product thumbnail
                    badgeImage: prod.badgeImage,
                    price: best.price ?? null,
                    oldPrice: best.flashSaleInfo ? best.originalPrice : (best.originalPrice > best.price ? best.originalPrice : null), // Corrected oldPrice logic
                    discount: best.discount ?? null,
                    inStock: totalStock > 0,
                    rating: 0, // Placeholder, can calculate if reviews are fetched
                    soldCount,
                    isFavorite: false, // Placeholder
                };
            });

            return res.status(200).json({ products: formattedProducts });
        } catch (err) {
            console.error('Lỗi getRelatedProducts:', err);
            return res.status(500).json({ message: 'Lỗi server' });
        }
    }
    static async getCompareByIds(req, res) {
        try {
            const ids = req.query.ids ? req.query.ids.split(',') : [];
            
            if (!ids.length) {
                return res.status(200).json({ products: [], specs: [] });
            }

            const products = await Product.findAll({
                where: {
                    id: { [Op.in]: ids },
                    isActive: true,
                    deletedAt: null
                },
                attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage', 'categoryId'],
                include: [
                    {
                        model: Sku,
                        as: 'skus',
                        attributes: ['id', 'price', 'originalPrice', 'stock', 'productId'],
                        include: [
                            { model: ProductMedia, as: "ProductMedia", attributes: ["mediaUrl"], separate: true, limit: 1 }
                        ]
                    },
                    {
                        model: Category,
                        as: "category",
                        attributes: ["id", "name", "slug"],
                    },
                    {
                        model: ProductSpec,
                        as: "specs",
                        attributes: ["specKey", "specValue", "specGroup"],
                        order: [["sortOrder", "ASC"]],
                    },
                ]
            });

            const allActiveFlashSales = await FlashSale.findAll({
                where: {
                    isActive: true,
                    deletedAt: null,
                    startTime: { [Op.lte]: new Date() },
                    endTime: { [Op.gte]: new Date() },
                },
                include: [
                    {
                        model: FlashSaleItem,
                        as: 'flashSaleItems',
                        required: false,
                        attributes: ['id', 'flashSaleId', 'skuId', 'salePrice', 'quantity', 'maxPerUser'],
                        include: [{ model: Sku, as: 'sku', attributes: ['id', 'productId'] }]
                    },
                    {
                        model: FlashSaleCategory,
                        as: 'categories',
                        required: false,
                        include: [{ model: FlashSale, as: 'flashSale', attributes: ['endTime'] }]
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
                    const catId = fsc.categoryId;
                    if (!allActiveCategoryDealsMap.has(catId)) {
                        allActiveCategoryDealsMap.set(catId, []);
                    }
                    allActiveCategoryDealsMap.get(catId).push({
                        discountType: fsc.discountType,
                        discountValue: fsc.discountValue,
                        priority: fsc.priority,
                        endTime: saleEndTime,
                        flashSaleId: saleId,
                        flashSaleCategoryId: fsc.id
                    });
                });
            });

            const formattedProducts = products.map(product => {
                const productJson = product.toJSON();
                const skusWithPrices = (productJson.skus || []).map(sku => {
                    const skuDataWithCategory = {
                        ...sku,
                        Product: { category: productJson.category }
                    };
                    return processSkuPrices(skuDataWithCategory, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);
                }).sort((a, b) => a.price - b.price);

                const primarySku = skusWithPrices[0] || {};
                const totalStock = (productJson.skus || []).reduce((sum, sku) => sum + (sku.stock || 0), 0);

                return {
                    id: productJson.id,
                    name: productJson.name,
                    slug: productJson.slug,
                    thumbnail: productJson.thumbnail,
                    badge: productJson.badge,
                    badgeImage: productJson.badgeImage,
                    image: primarySku.ProductMedia?.[0]?.mediaUrl || productJson.thumbnail,
                    price: primarySku.price ?? null,
                    oldPrice: primarySku.flashSaleInfo ? primarySku.originalPrice : (primarySku.originalPrice > primarySku.price ? primarySku.originalPrice : null),
                    discount: primarySku.discount ?? null,
                    inStock: totalStock > 0,
                    features: productJson.specs.reduce((acc, spec) => {
                        acc[spec.specKey] = spec.specValue;
                        return acc;
                    }, {}),
                };
            });

            // Gộp và chuẩn hóa specs
            const allSpecKeys = new Set();
            formattedProducts.forEach(p => {
                for (const key in p.features) {
                    allSpecKeys.add(key);
                }
            });

            const uniqueSpecs = Array.from(allSpecKeys).map(key => ({
                specKey: key,
                values: formattedProducts.reduce((acc, p) => {
                    acc[p.id] = p.features[key] || '-';
                    return acc;
                }, {})
            }));
            
            // Xử lý để đảm bảo thứ tự specs là cố định và hợp lý (ví dụ: lấy từ featureOrderArray nếu có)
            // Hiện tại chỉ sắp xếp theo thứ tự xuất hiện

            return res.json({
                products: formattedProducts,
                specs: uniqueSpecs
            });

        } catch (error) {
            console.error('Lỗi getCompareByIds:', error);
            return res.status(500).json({ message: 'Lỗi server khi lấy dữ liệu so sánh' });
        }
    }
}

module.exports = ProductController;
