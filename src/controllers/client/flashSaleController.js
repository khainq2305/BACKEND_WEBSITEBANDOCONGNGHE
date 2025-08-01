const {
    FlashSale, FlashSaleItem, FlashSaleCategory,
    Sku, Product, ProductMedia, Category, OrderItem, Order, Review
} = require('../../models');

const { Sequelize, Op } = require('sequelize');

class FlashSaleClientController {
    static async getAll(req, res) {
        try {
            const allSales = await FlashSale.findAll({
                where: {
                    isActive: true,
                    deletedAt: null,
                    [Op.or]: [
                        { startTime: { [Op.lte]: new Date() }, endTime: { [Op.gte]: new Date() } },
                        { startTime: { [Op.gt]: new Date() } }
                    ]
                },
                include: [{
                    model: FlashSaleItem,
                    as: 'flashSaleItems',
                    include: [{
                        model: Sku,
                        as: 'sku',
                        required: true,
                        attributes: [
                            'id', 'skuCode', 'price', 'originalPrice', 'stock',
                            [Sequelize.literal(`(SELECT COALESCE(SUM(oi.quantity),0) FROM orderitems oi INNER JOIN orders o ON oi.orderId = o.id WHERE oi.skuId = \`flashSaleItems->sku\`.\`id\` AND o.status IN ('completed', 'delivered'))`), 'totalSoldCount'],
                            [Sequelize.literal(`(SELECT AVG(r.rating) FROM reviews r WHERE r.skuId = \`flashSaleItems->sku\`.\`id\`)`), 'averageRating']
                        ],
                        include: [{
                            model: Product,
                            as: 'product',
                            attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage']
                        }, {
                            model: ProductMedia,
                            as: 'ProductMedia',
                            attributes: ['mediaUrl', 'type', 'sortOrder'],
                            required: false
                        }]
                    }]
                }, {
                    model: FlashSaleCategory,
                    as: 'categories',
                    attributes: ['id', 'discountType', 'discountValue', 'maxPerUser', 'priority'],
                    include: [{
                        model: Category,
                        as: 'category',
                        attributes: ['id', 'name', 'slug'],
                        include: [{
                            model: Product,
                            as: 'products',
                            attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage'],
                            include: [{
                                model: Sku,
                                as: 'skus',
                                required: true,
                                where: { isActive: true, deletedAt: null },
                                attributes: [
                                    'id', 'skuCode', 'price', 'originalPrice', 'stock',
                                    [Sequelize.literal(`(SELECT COALESCE(SUM(oi.quantity),0) FROM orderitems oi INNER JOIN orders o ON oi.orderId = o.id WHERE oi.skuId = \`categories->category->products->skus\`.\`id\` AND o.status IN ('completed', 'delivered'))`), 'totalSoldCount'],
                                    [Sequelize.literal(`(SELECT AVG(r.rating) FROM reviews r WHERE r.skuId = \`categories->category->products->skus\`.\`id\`)`), 'averageRating']
                                ],
                                include: [{
                                    model: Product,
                                    as: 'product',
                                    attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage']
                                }, {
                                    model: ProductMedia,
                                    as: 'ProductMedia',
                                    attributes: ['mediaUrl', 'type', 'sortOrder'],
                                    required: false
                                }]
                            }]
                        }]
                    }]
                }],
                order: [
                    ['orderIndex', 'ASC'],
                    ['startTime', 'ASC']
                ]
            });

            const processedSales = allSales.map(flashSale => {
                const now = new Date();
                const isActive = now >= flashSale.startTime && now <= flashSale.endTime;
                const isUpcoming = now < flashSale.startTime;

                const allSkusInSale = new Map();
                
                // ✅ FIX: Cấu trúc lại để tính toán và gán soldCount chính xác
                flashSale.flashSaleItems?.forEach(item => {
                    if (item.sku) {
                        const finalSku = item.sku.toJSON();
                        const sold = item.originalQuantity - item.quantity;
                        
                        finalSku.flashSaleInfo = {
                             quantity: item.quantity,
                             soldQuantity: sold,
                             originalQuantity: item.originalQuantity,
                             flashSaleId: flashSale.id,
                             isSoldOut: item.quantity <= 0,
                             limitPerUser: item.maxPerUser,
                             isFlashSaleItem: true,
                        };
                        finalSku.salePrice = item.salePrice;
                        finalSku.soldCount = sold; // ✅ Gán soldCount đúng
                        
                        allSkusInSale.set(finalSku.id, finalSku);
                    }
                });

                // Các logic xử lý category sau đó
                flashSale.categories?.forEach(cat => {
                    cat.category?.products?.forEach(prod => {
                        prod.skus?.forEach(sku => {
                            if (!allSkusInSale.has(sku.id)) {
                                const finalSku = sku.toJSON();
                                const basePrice = finalSku.originalPrice ?? finalSku.price;
                                const { discountType, discountValue, maxPerUser } = cat;

                                let newPrice = basePrice;
                                if (isActive) {
                                    newPrice = discountType === 'percent'
                                        ? basePrice * (100 - discountValue) / 100
                                        : basePrice - discountValue;
                                    newPrice = Math.max(0, Math.round(newPrice / 1000) * 1000);
                                    
                                    finalSku.salePrice = newPrice;
                                    finalSku.flashSaleInfo = {
                                        quantity: finalSku.stock,
                                        soldQuantity: parseInt(finalSku.totalSoldCount || 0),
                                        originalQuantity: finalSku.stock,
                                        flashSaleId: flashSale.id,
                                        isSoldOut: finalSku.stock <= 0,
                                        limitPerUser: maxPerUser,
                                        isFlashSaleItem: false,
                                    };
                                    finalSku.soldCount = parseInt(finalSku.totalSoldCount || 0);
                                } else {
                                    finalSku.salePrice = undefined;
                                    finalSku.flashSaleInfo = undefined;
                                    finalSku.soldCount = parseInt(finalSku.totalSoldCount || 0);
                                }
                                
                                allSkusInSale.set(sku.id, finalSku);
                            }
                        });
                    });
                });

                // ✅ FIX: Gán lại soldCount cho các item gốc
                flashSale.flashSaleItems?.forEach(item => {
                    if (item.sku) {
                        const skuData = allSkusInSale.get(item.sku.id);
                        if (skuData) {
                            // Ghi đè các thuộc tính đã xử lý vào đối tượng SKU gốc
                            Object.assign(item.sku.dataValues, skuData);
                            // Cần đảm bảo thuộc tính soldCount cũng được gán lại
                            item.soldCount = skuData.soldCount;
                        }
                    }
                });

                flashSale.categories?.forEach(cat => {
                    cat.category?.products?.forEach(prod => {
                        prod.skus?.forEach(sku => {
                            const skuData = allSkusInSale.get(sku.id);
                            if (skuData) {
                                Object.assign(sku.dataValues, skuData);
                                // Không cần gán lại soldCount ở đây vì nó được lấy từ totalSoldCount
                            }
                        });
                    });
                });
                
                // Dọn dẹp thuộc tính totalSoldCount sau khi đã sử dụng
                flashSale.flashSaleItems?.forEach(item => {
                    if (item.sku?.dataValues) delete item.sku.dataValues.totalSoldCount;
                });
                flashSale.categories?.forEach(cat => {
                    cat.category?.products?.forEach(prod => {
                        prod.skus?.forEach(sku => {
                            if (sku?.dataValues) delete sku.dataValues.totalSoldCount;
                        });
                    });
                });
            });

            res.json({ data: allSales });
        } catch (err) {
            console.error('Lỗi getAll Flash Sale (client):', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }
}

module.exports = FlashSaleClientController;