const {
    FlashSale,
    FlashSaleItem,
    Sku,
    Product,
    ProductMedia
} = require('../../models');

const { Sequelize, Op } = require('sequelize');

class FlashSaleClientController {
    static async getAll(req, res) {
        try {
            const now = new Date();

            const allActiveSales = await FlashSale.findAll({
                where: {
                    isActive: true,
                    startTime: { [Op.lte]: now },
                    endTime: { [Op.gte]: now }
                },
                include: [
                    {
                        model: FlashSaleItem,
                        as: 'flashSaleItems',
                        required: true,
                        include: [
                            {
                                model: Sku,
                                as: 'sku',
                                required: true,
                                attributes: [
                                    'id',
                                    'skuCode',
                                    'price',
                                    'originalPrice',
                                    'stock',
                                    [
                                        // ✅ SỬA LẠI SUBQUERY ĐỂ JOIN VỚI BẢNG ORDERS
                                        Sequelize.literal(`(
                                            SELECT COALESCE(SUM(oi.quantity), 0)
                                            FROM orderitems AS oi
                                            INNER JOIN orders AS o ON oi.orderId = o.id
                                            WHERE oi.skuId = \`flashSaleItems->sku\`.\`id\` AND o.status = 'completed'
                                        )`),
                                        'soldCount'
                                    ],
                                    [
                                        Sequelize.literal(`(
                                            SELECT AVG(r.rating)
                                            FROM reviews AS r
                                            WHERE r.skuId = \`flashSaleItems->sku\`.\`id\`
                                        )`),
                                        'averageRating'
                                    ]
                                ],
                                include: [
                                    {
                                        model: Product,
                                        as: 'product',
                                        attributes: ['id', 'name', 'slug', 'thumbnail', 'badge']
                                    },
                                    {
                                        model: ProductMedia,
                                        as: 'ProductMedia',
                                        required: false,
                                        attributes: ['mediaUrl', 'type', 'sortOrder']
                                    }
                                ]
                            }
                        ],
                        order: [['salePrice', 'ASC']]
                    }
                ],
                order: [['startTime', 'ASC']]
            });

            res.json({ data: allActiveSales });
        } catch (err) {
            console.error('Lỗi getAll Flash Sale (client):', err);
            res.status(500).json({ message: 'Lỗi server', error: err.message });
        }
    }
}

module.exports = FlashSaleClientController;