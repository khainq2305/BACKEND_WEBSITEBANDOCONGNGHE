const {
  FlashSale, FlashSaleItem, FlashSaleCategory,   //  👈 thêm FlashSaleCategory
  Sku, Product, ProductMedia, Category           //  👈 thêm Category
} = require('../../models');

const { Sequelize, Op } = require('sequelize');

class FlashSaleClientController {
// controllers/FlashSaleClientController.js
static async getAll(req, res) {
  try {
    const now = new Date();

    /* 1️⃣  Query gốc (giữ nguyên include) */
    const allActiveSales = await FlashSale.findAll({
      where: {
        isActive: true,
        startTime: { [Op.lte]: now },
        endTime  : { [Op.gte]: now },
      },
      include: [
        /* -------- A. SKU tick riêng -------- */
        {
          model: FlashSaleItem,
          as   : 'flashSaleItems',
          required: true,
          include : [
            {
              model   : Sku,
              as      : 'sku',
              required: true,
              attributes: [
                'id','skuCode','price','originalPrice','stock',
                /* soldCount & averageRating */
                [
                  Sequelize.literal(`(
                    SELECT COALESCE(SUM(oi.quantity),0)
                    FROM orderitems oi
                    INNER JOIN orders o ON oi.orderId = o.id
                    WHERE oi.skuId = \`flashSaleItems->sku\`.\`id\` AND o.status = 'completed'
                  )`),
                  'soldCount'
                ],
                [
                  Sequelize.literal(`(
                    SELECT AVG(r.rating)
                    FROM reviews r
                    WHERE r.skuId = \`flashSaleItems->sku\`.\`id\`
                  )`),
                  'averageRating'
                ]
              ],
              include: [
                { model: Product,      as: 'product',       attributes: ['id','name','slug','thumbnail','badge'] },
                { model: ProductMedia, as: 'ProductMedia',  attributes: ['mediaUrl','type','sortOrder'], required: false }
              ]
            }
          ]
        },

        /* -------- B. Giảm theo danh mục -------- */
        {
          model: FlashSaleCategory,
          as   : 'categories',
          attributes: ['id','discountType','discountValue','maxPerUser','priority'],
          required: false,
          include : [
            {
              model: Category,
              as  : 'category',
              attributes: ['id','name','slug'],
              include: [
                {
                  model : Product,
                  as    : 'products',
                  required: true,
                  attributes: ['id','name','slug','thumbnail','badge'],
                  include: [
                    {
                      model : Sku,
                      as    : 'skus',
                      required : true,
                      where: { isActive: true, deletedAt: null },
                      attributes: [
                        'id','skuCode','price','originalPrice','stock',
                        [
                          Sequelize.literal(`(
                            SELECT COALESCE(SUM(oi.quantity),0)
                            FROM orderitems oi
                            INNER JOIN orders o ON oi.orderId = o.id
                            WHERE oi.skuId = \`categories->category->products->skus\`.\`id\` AND o.status = 'completed'
                          )`),
                          'soldCount'
                        ],
                        [
                          Sequelize.literal(`(
                            SELECT AVG(r.rating)
                            FROM reviews r
                            WHERE r.skuId = \`categories->category->products->skus\`.\`id\`
                          )`),
                          'averageRating'
                        ]
                      ],
                      include: [
                        { model: Product,      as: 'product',      attributes: ['id','name','slug','thumbnail','badge'] },
                        { model: ProductMedia, as: 'ProductMedia', attributes: ['mediaUrl','type','sortOrder'], required: false }
                      ]
                    }
                  ]
                }
              ]
            }
          ]
        }
      ],
      order: [['startTime', 'ASC']]
    });

    /* 2️⃣  Post-process để gắn salePrice cho SKU theo danh mục */
    allActiveSales.forEach((flashSale) => {
      /* map skuId → salePrice của FlashSaleItem (nếu admin đặt) */
      const itemPriceMap = new Map();
      (flashSale.flashSaleItems || []).forEach((it) => {
        if (it.salePrice !== null && it.salePrice !== undefined) {
          itemPriceMap.set(it.skuId, it.salePrice);
        }
      });

      /* duyệt từng danh mục */
      (flashSale.categories || []).forEach((cat) => {
        const { discountType = 'percent', discountValue = 0, priority = 0 } = cat;

        (cat.category?.products || []).forEach((prod) => {
          (prod.skus || []).forEach((sku) => {
            /* bỏ qua nếu SKU đã có giá riêng */
            if (itemPriceMap.has(sku.id)) return;

            /* nếu SKU bị nhiều danh mục khớp, lấy priority cao hơn */
            if (
              sku.dataValues._bestPriority !== undefined &&
              sku.dataValues._bestPriority > priority
            ) {
              return;
            }

            /* tính giá sau giảm */
            let newPrice;
            if (discountType === 'percent') {
              newPrice = sku.price * (100 - discountValue) / 100;
            } else {
              newPrice = sku.price - discountValue;
            }
            /* làm tròn về 1.000₫ cho đẹp */
            newPrice = Math.max(0, Math.round(newPrice / 1000) * 1000);

            sku.dataValues.salePrice       = newPrice;
            sku.dataValues.discountApplied = { type: discountType, value: discountValue };
            sku.dataValues._bestPriority   = priority;   // ẩn
          });
        });
      });
    });

    /* 3️⃣  Trả kết quả */
    res.json({ data: allActiveSales });
  } catch (err) {
    console.error('Lỗi getAll Flash Sale (client):', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}


}

module.exports = FlashSaleClientController;