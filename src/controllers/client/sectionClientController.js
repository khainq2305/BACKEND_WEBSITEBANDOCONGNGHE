const {
    HomeSection,
    HomeSectionBanner,
    Product,
    Sku,
    Category,
    OrderItem,
    Review,
    Order,
    FlashSaleItem,
    FlashSaleCategory,
    FlashSale,
    ProductMedia // THÊM DÒNG NÀY VÀO
} = require("../../models");
const { Op, fn, col, Sequelize } = require('sequelize');
const { literal } = Sequelize;

// Import the helper function
const { processSkuPrices } = require('../../helpers/priceHelper'); // Điều chỉnh đường dẫn nếu cần

class SectionClientController {
    static async getHomeSections(req, res) {
        try {
            const now = new Date();
            console.log(`\n--- [SectionClientController] Bắt đầu tìm nạp các section trang chủ lúc: ${now.toISOString()} ---`);

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
                        include: [{
                            model: Sku,
                            as: 'sku',
                            attributes: ['id', 'skuCode', 'price', 'originalPrice', 'stock', 'productId'],
                            include: [
                                { model: Product, as: 'product', attributes: ['categoryId'] }, // Cần categoryId của Product
                            ]
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
            console.log(`\n[SectionClientController] Tìm thấy ${allActiveFlashSales.length} tổng số Flash Sale đang hoạt động.`);

            // TỔNG HỢP VÀ XỬ LÝ DỮ LIỆU FLASH SALE ĐỂ TÌM GIÁ TỐT NHẤT CHO MỖI SKU TRÊN TOÀN HỆ THỐNG
            const allActiveFlashSaleItemsMap = new Map(); // Lưu trữ FlashSaleItem tốt nhất cho mỗi SKU (nếu còn suất)
            const allActiveCategoryDealsMap = new Map(); // Lưu trữ tất cả deals category cho mỗi Category ID

            allActiveFlashSales.forEach(saleEvent => {
                const saleEndTime = saleEvent.endTime;
                const saleId = saleEvent.id;

                // 1. Xử lý FlashSaleItems của từng saleEvent để tìm FlashSaleItem tốt nhất cho mỗi SKU
                (saleEvent.flashSaleItems || []).forEach(fsi => {
                    const sku = fsi.sku;
                    if (!sku) return;

                    const skuId = sku.id;
                    const flashItemSalePrice = parseFloat(fsi.salePrice);
                    const soldForThisItem = parseInt(fsi.dataValues.soldQuantityForFlashSaleItem || 0); // Lấy soldQuantity đã được tính
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
                    // Nếu FlashSaleItem này hết suất, nó sẽ không được đưa vào allActiveFlashSaleItemsMap
                    // Điều này có nghĩa là processSkuPrices sẽ không tìm thấy nó và sẽ cân nhắc Category Deal hoặc giá gốc.
                });

                // 2. Xử lý FlashSaleCategories của từng saleEvent để tổng hợp tất cả deals
                (saleEvent.categories || []).forEach(fsc => {
                    const categoryId = fsc.categoryId;
                    if (!allActiveCategoryDealsMap.has(categoryId)) {
                        allActiveCategoryDealsMap.set(categoryId, []);
                    }
                    allActiveCategoryDealsMap.get(categoryId).push({
                        discountType: fsc.discountType,
                        discountValue: fsc.discountValue,
                        priority: fsc.priority,
                        endTime: saleEndTime, // Thời gian kết thúc của flash sale cha
                        flashSaleId: saleId,
                        flashSaleCategoryId: fsc.id
                    });
                });
            });

            console.log('[SectionClientController] allActiveFlashSaleItemsMap (Item tốt nhất cho từng SKU đang còn suất):', allActiveFlashSaleItemsMap.size, 'entries');
            console.log('[SectionClientController] allActiveCategoryDealsMap (Tất cả deals category cho từng Category ID đang hoạt động):', allActiveCategoryDealsMap.size, 'entries');

            // TRUY VẤN CÁC HOME SECTIONS
            const sections = await HomeSection.findAll({
                where: { isActive: true },
                order: [['orderIndex', 'ASC']],
                include: [
                    { model: HomeSectionBanner, as: 'banners', attributes: ['id', 'imageUrl', 'linkType', 'linkValue', 'sortOrder'], separate: true, order: [['sortOrder', 'ASC']] },
                    { model: Category, as: 'linkedCategories', attributes: ['id', 'name', 'slug'], through: { attributes: ['sortOrder'] } },
                    {
                        model: Product,
                        as: 'products',
                        required: false,
                        attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage', 'categoryId'], // Lấy categoryId của Product
                        through: { attributes: ['sortOrder'] },
                        include: [
                            {
                                model: Sku,
                                as: 'skus',
                                required: false,
                                attributes: ['id', 'skuCode', 'price', 'originalPrice', 'stock', 'productId'],
                                include: [
                                    {
                                        model: OrderItem,
                                        as: 'OrderItems',
                                        attributes: ['quantity'],
                                        required: false,
                                        include: [{
                                            model: Order,
                                            as: 'order',
                                            attributes: [],
                                            where: { status: { [Op.in]: ['delivered', 'completed'] } },
                                            required: true
                                        }]
                                    },
                                    { model: Review, as: 'reviews', attributes: ['rating'], required: false },
                                    { model: ProductMedia, as: 'ProductMedia', attributes: ['mediaUrl', 'type', 'sortOrder'], required: false }
                                ]
                            },
                            { model: Category, as: 'category', attributes: ['id', 'name', 'slug'] }, // Đảm bảo category được include ở đây
                        ],
                    },
                ],
            });

            const data = sections.map((sec) => {
                const section = sec.toJSON();
                console.log(`\n--- Đang xử lý Section: "${section.title}" (ID: ${section.id}) ---`);

                section.products = (section.products || []).map((prod) => {
                    const prodData = prod.toJSON ? prod.toJSON() : prod;

                    const soldCount = (prodData.skus || []).reduce((total, sku) => {
                        return total + (sku.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0);
                    }, 0);

                    let ratingSum = 0, ratingCnt = 0;
                    (prodData.skus || []).forEach((sku) => {
                        (sku.reviews || []).forEach((rv) => {
                            const r = Number(rv.rating);
                            if (r > 0) { ratingSum += r; ratingCnt += 1; }
                        });
                    });
                    const rating = ratingCnt ? parseFloat((ratingSum / ratingCnt).toFixed(1)) : 0;

                    console.log(`   Đang xử lý Sản phẩm: "${prodData.name}" (ID: ${prodData.id})`);

                    // Bước 1: Xử lý giá cho tất cả các SKU bằng helper
                    const processedSkus = (prodData.skus || []).map((sku) => {
                        const skuData = sku.toJSON ? sku.toJSON() : sku;
                        // Gắn thông tin category của product vào skuData để helper có thể truy cập
                        skuData.Product = { category: { id: prodData.categoryId } };

                        const priceResults = processSkuPrices(skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap);

                        const resultSku = {
                            ...skuData,
                            price: priceResults.price, // Giá đã được xử lý (cuối cùng)
                            originalPrice: priceResults.originalPrice, // Giá gốc của SKU để hiển thị gạch ngang
                            flashSaleInfo: priceResults.flashSaleInfo,
                            discount: priceResults.discount,
                            hasDeal: priceResults.hasDeal // Cờ này cũng phản ánh việc còn suất hay không
                        };
                        console.log(`     SKU: ${resultSku.skuCode} (ID: ${resultSku.id}) - Giá cuối cùng: ${resultSku.price}, Giá gốc: ${resultSku.originalPrice}, Có Deal: ${resultSku.hasDeal}, FlashSaleInfo:`, resultSku.flashSaleInfo);
                        return resultSku;
                    });

                    // Bước 2: Chọn defaultSku (ưu tiên ID nhỏ nhất)
                    let selectedDefaultSku = null;
                    if (processedSkus.length > 0) {
                        // Sắp xếp để tìm SKU có ID nhỏ nhất
                        const skusSortedById = [...processedSkus].sort((a, b) => a.id - b.id);
                        selectedDefaultSku = skusSortedById[0];
                    }

                    // Bước 3: Sắp xếp lại mảng `skus` theo giá tăng dần (để đảm bảo thứ tự hiển thị nếu cần)
                    processedSkus.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));


                    return {
                        ...prodData,
                        skus: processedSkus, // Mảng SKU đã được xử lý giá và sắp xếp theo giá
                        defaultSku: selectedDefaultSku || null, // Gán SKU có ID nhỏ nhất làm defaultSku
                        soldCount,
                        rating,
                        ProductHomeSection: prodData.ProductHomeSection || {},
                    };
                });

                section.products.sort((a, b) =>
                    (a.ProductHomeSection?.sortOrder || 0) - (b.ProductHomeSection?.sortOrder || 0)
                );

                return section;
            });

            console.log('\n--- [SectionClientController] Đang gửi dữ liệu phản hồi cuối cùng. ---');
            return res.json({ success: true, data });
        } catch (err) {
            console.error('[SectionClientController.getHomeSections] Lỗi Server:', err);
            return res.status(500).json({
                success: false,
                message: 'Lỗi server khi lấy danh sách section',
                error: err.message,
            });
        }
    }
}

module.exports = SectionClientController;