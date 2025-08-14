const {
    FlashSale, FlashSaleItem, FlashSaleCategory,
    Sku, Product, ProductMedia, Category, OrderItem, Order, Review
} = require('../../models');

const { Sequelize, Op } = require('sequelize');

class FlashSaleClientController {
static async getAll(req, res) {
    try {
        const now = new Date();

        const allSales = await FlashSale.findAll({
            where: {
                isActive: true,
                deletedAt: null,
                [Op.or]: [
                    { startTime: { [Op.lte]: now }, endTime: { [Op.gte]: now } },
                    { startTime: { [Op.gt]: now } }
                ]
            },
            include: [
                {
                    model: FlashSaleItem,
                    as: 'flashSaleItems',
                    include: [
                        {
                            model: Sku,
                            as: 'sku',
                            required: true,
                            where: { isActive: true, deletedAt: null },
                            attributes: [
                                'id', 'skuCode', 'price', 'originalPrice', 'stock',
                                [Sequelize.literal(`(
                                    SELECT COALESCE(SUM(oi.quantity),0)
                                    FROM orderitems oi
                                    INNER JOIN orders o ON oi.orderId = o.id
                                    WHERE oi.skuId = \`flashSaleItems->sku\`.\`id\`
                                    AND o.status IN ('completed', 'delivered')
                                )`), 'totalSoldCount'],
                                [Sequelize.literal(`(
                                    SELECT AVG(r.rating)
                                    FROM reviews r
                                    WHERE r.skuId = \`flashSaleItems->sku\`.\`id\`
                                )`), 'averageRating']
                            ],
                            include: [
                                {
                                    model: Product,
                                    as: 'product',
                                    where: { deletedAt: null },
                                    attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage']
                                },
                                {
                                    model: ProductMedia,
                                    as: 'ProductMedia',
                                    attributes: ['mediaUrl', 'type', 'sortOrder'],
                                    required: false
                                }
                            ]
                        }
                    ]
                },
                {
                    model: FlashSaleCategory,
                    as: 'categories',
                    attributes: ['id', 'discountType', 'discountValue', 'maxPerUser', 'priority'],
                    include: [
                        {
                            model: Category,
                            as: 'category',
                            attributes: ['id', 'name', 'slug'],
                            where: { deletedAt: null },
                            include: [
                                {
                                    model: Product,
                                    as: 'products',
                                    where: { deletedAt: null },
                                    attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage'],
                                    include: [
                                        {
                                            model: Sku,
                                            as: 'skus',
                                            required: true,
                                            where: { isActive: true, deletedAt: null },
                                            attributes: [
                                                'id', 'skuCode', 'price', 'originalPrice', 'stock',
                                                [Sequelize.literal(`(
                                                    SELECT COALESCE(SUM(oi.quantity),0)
                                                    FROM orderitems oi
                                                    INNER JOIN orders o ON oi.orderId = o.id
                                                    WHERE oi.skuId = \`categories->category->products->skus\`.\`id\`
                                                    AND o.status IN ('completed', 'delivered')
                                                )`), 'totalSoldCount'],
                                                [Sequelize.literal(`(
                                                    SELECT AVG(r.rating)
                                                    FROM reviews r
                                                    WHERE r.skuId = \`categories->category->products->skus\`.\`id\`
                                                )`), 'averageRating']
                                            ],
                                            include: [
                                                {
                                                    model: Product,
                                                    as: 'product',
                                                    where: { deletedAt: null },
                                                    attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage']
                                                },
                                                {
                                                    model: ProductMedia,
                                                    as: 'ProductMedia',
                                                    attributes: ['mediaUrl', 'type', 'sortOrder'],
                                                    required: false
                                                }
                                            ]
                                        }
                                    ]
                                }
                            ]
                        }
                    ]
                }
            ],
            order: [
                ['orderIndex', 'ASC'],
                ['startTime', 'ASC']
            ]
        });

        const processedSales = allSales.map(flashSale => {
            const start = new Date(flashSale.startTime);
            const end = new Date(flashSale.endTime);

            const nowUTC = now.getTime();
            const startUTC = start.getTime();
            const endUTC = end.getTime();

            let status, countdownTo;
            if (nowUTC >= startUTC && nowUTC <= endUTC) {
                status = 'live';
                countdownTo = flashSale.endTime;
            } else if (nowUTC < startUTC) {
                status = 'upcoming';
                countdownTo = flashSale.startTime;
            } else {
                status = 'ended';
                countdownTo = null;
            }

            const isActive = status === 'live';
            const allSkusInSale = new Map();

            flashSale.flashSaleItems?.forEach(item => {
                if (item.sku) {
                    const finalSku = item.sku.get({ plain: true });
                    const sold = item.originalQuantity - item.quantity;
                    finalSku.flashSaleInfo = {
                        quantity: item.quantity,
                        soldQuantity: sold,
                        originalQuantity: item.originalQuantity,
                        flashSaleId: flashSale.id,
                        isSoldOut: item.quantity <= 0,
                        limitPerUser: item.maxPerUser,
                        isFlashSaleItem: true
                    };
                    finalSku.salePrice = item.salePrice;
                    finalSku.soldCount = sold;
                    allSkusInSale.set(finalSku.id, finalSku);
                }
            });

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
                                    isFlashSaleItem: false
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

            const processedFlashSale = flashSale.get({ plain: true });
            processedFlashSale.status = status;
            processedFlashSale.countdownTo = countdownTo;

            processedFlashSale.flashSaleItems = processedFlashSale.flashSaleItems?.map(item => {
                const skuData = allSkusInSale.get(item.skuId);
                if (skuData) {
                    return { ...item, sku: skuData };
                }
                return item;
            });

            processedFlashSale.categories = processedFlashSale.categories?.map(cat => {
                const processedCat = { ...cat };
                processedCat.category.products = processedCat.category.products?.map(prod => {
                    const processedProd = { ...prod };
                    processedProd.skus = processedProd.skus?.map(sku => {
                        const skuData = allSkusInSale.get(sku.id);
                        if (skuData) {
                            return { ...sku, ...skuData };
                        }
                        return sku;
                    });
                    return processedProd;
                });
                return processedCat;
            });

            return processedFlashSale;
        });

        res.json({ data: processedSales });
    } catch (err) {
        res.status(500).json({ message: 'Lỗi server', error: err.message });
    }
}




}

module.exports = FlashSaleClientController;