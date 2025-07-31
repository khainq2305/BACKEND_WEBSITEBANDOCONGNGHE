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
        include: [
          {
            model: FlashSaleItem,
            as: 'flashSaleItems',
            attributes: {
              include: [
                [
                  Sequelize.literal(`(
                    SELECT COALESCE(SUM(oi.quantity), 0)
                    FROM orderitems oi
                    INNER JOIN orders o ON oi.orderId = o.id
                    WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                      AND oi.skuId = flashSaleItems.skuId -- Cần thêm điều kiện skuId để đảm bảo đúng item
                      AND o.status IN ('completed', 'delivered')
                  )`),
                  'soldQuantity'
                ]
              ]
            },
            include: [
              {
                model: Sku,
                as: 'sku',
                required: true,
                attributes: [
                  'id', 'skuCode', 'price', 'originalPrice', 'stock',
                  [
                    Sequelize.literal(`(
                      SELECT COALESCE(SUM(oi.quantity),0)
                      FROM orderitems oi
                      INNER JOIN orders o ON oi.orderId = o.id
                      WHERE oi.skuId = \`flashSaleItems->sku\`.\`id\` AND o.status IN ('completed', 'delivered')
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
                  {
                    model: Product,
                    as: 'product',
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
            required: false,
            include: [
              {
                model: Category,
                as: 'category',
                attributes: ['id', 'name', 'slug'],
                include: [
                  {
                    model: Product,
                    as: 'products',
                    attributes: ['id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage'],
                    include: [
                      {
                        model: Sku,
                        as: 'skus',
                        required: true,
                        where: { isActive: true, deletedAt: null },
                        attributes: [
                          'id', 'skuCode', 'price', 'originalPrice', 'stock',
                          [
                            Sequelize.literal(`(
                              SELECT COALESCE(SUM(oi.quantity),0)
                              FROM orderitems oi
                              INNER JOIN orders o ON oi.orderId = o.id
                              WHERE oi.skuId = \`categories->category->products->skus\`.\`id\` AND o.status IN ('completed', 'delivered')
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
                          {
                            model: Product,
                            as: 'product',
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

      const resetAllSkuSalePrices = (flashSale) => {
        
        flashSale.flashSaleItems?.forEach((it) => {
          if (it?.sku?.dataValues) {
            delete it.sku.dataValues.salePrice;
            delete it.sku.dataValues.flashSaleInfo;
            delete it.sku.dataValues.isSoldOut;
            delete it.sku.dataValues._bestPriority; 
          }
        });
       
        flashSale.categories?.forEach((cat) => {
          cat.category?.products?.forEach((prod) => {
            prod.skus?.forEach((sku) => {
              if (sku?.dataValues) {
                delete sku.dataValues.salePrice;
                delete sku.dataValues.flashSaleInfo;
                delete sku.dataValues.isSoldOut;
                delete sku.dataValues._bestPriority;
              }
            });
          });
        });
      };

      allSales.forEach((flashSale) => {
        
        resetAllSkuSalePrices(flashSale);

        const currentTime = new Date();
        const saleIsActive = currentTime >= flashSale.startTime && currentTime <= flashSale.endTime;

       
        const skuItemMap = new Map();
        (flashSale.flashSaleItems || []).forEach((it) => {
          if (!skuItemMap.has(it.skuId)) skuItemMap.set(it.skuId, []);
          skuItemMap.get(it.skuId).push(it);
        });

        skuItemMap.forEach((items, skuId) => {
          const sku = items[0]?.sku;
          if (!sku?.dataValues) return;

          sku.soldCount = parseInt(sku.dataValues.soldCount || 0);
          sku.averageRating = parseFloat(sku.dataValues.averageRating || 0);

    
          const availableItems = items.filter(it => {
            const sold = parseInt(it.dataValues?.soldQuantity || 0);
            const limit = it.quantity;

            const hasValidSalePrice = it.salePrice !== undefined && it.salePrice !== null;
            const hasAvailableSlots = (limit === null || limit === 0 || (limit > 0 && sold < limit));
            return hasValidSalePrice && hasAvailableSlots;
          });

        
availableItems.sort((a, b) =>
  (a.dataValues.soldQuantity || 0) - (b.dataValues.soldQuantity || 0)
);

          if (saleIsActive && availableItems.length > 0) {
           
            const selectedItem = availableItems[0];
            const basePrice = sku.originalPrice ?? sku.price;
            let calculatedSalePrice = selectedItem.salePrice;

         
            if (calculatedSalePrice >= basePrice) {
              calculatedSalePrice = basePrice;
            }

            sku.dataValues.salePrice = calculatedSalePrice;
            sku.dataValues.flashSaleInfo = {
                flashSaleId: selectedItem.flashSaleId,
  quantity: selectedItem.quantity,
  sold: parseInt(selectedItem.dataValues?.soldQuantity || 0),
  originalQuantity: selectedItem.quantity,
              isSoldOut: false,
              limitPerUser: selectedItem.maxPerUser,
              isFlashSaleItem: true 
            };
            sku.dataValues.isSoldOut = false; 
          } else {
         
         sku.dataValues.isSoldOut = true;
sku.dataValues.flashSaleInfo = { isSoldOut: true, isFlashSaleItem: true };
delete sku.dataValues.salePrice; 

          }
        });

      
        (flashSale.categories || []).forEach((cat) => {
          const { discountType = 'percent', discountValue = 0, priority = 0 } = cat;

          (cat.category?.products || []).forEach((prod) => {
            (prod.skus || []).forEach((sku) => {
            
              if (sku?.dataValues) {
                sku.soldCount = parseInt(sku.dataValues.soldCount || 0);
                sku.averageRating = parseFloat(sku.dataValues.averageRating || 0);
              }

            
              if (!saleIsActive) {
            
                return;
              }

          
if (
  sku.dataValues.flashSaleInfo?.isFlashSaleItem &&
  sku.dataValues.flashSaleInfo?.isSoldOut === false
) {
  return;
}


             
              const basePrice = sku.originalPrice ?? sku.price;
              let newPrice;

              if (discountType === 'percent') {
                newPrice = basePrice * (100 - discountValue) / 100;
              } else { 
                newPrice = basePrice - discountValue;
              }
              newPrice = Math.max(0, Math.round(newPrice / 1000) * 1000);

            
              if (sku.dataValues.salePrice === undefined || newPrice < sku.dataValues.salePrice) {
                sku.dataValues.salePrice = newPrice;
           

                sku.dataValues.flashSaleInfo = {
                  flashSaleId: flashSale.id,
                  discountType: discountType,
                  
                  discountValue: discountValue,
                  isSoldOut: false, 
                  isFlashSaleItem: false 
                };
                sku.dataValues.isSoldOut = false; 
              }
            });
          });
        });

        
        const allSkusInThisFlashSale = new Map();

        (flashSale.flashSaleItems || []).forEach(it => {
            if (it?.sku?.dataValues) {
                allSkusInThisFlashSale.set(it.sku.id, it.sku);
            }
        });

        (flashSale.categories || []).forEach(cat => {
            (cat.category?.products || []).forEach(prod => {
                prod.skus?.forEach(sku => {
                    if (sku?.dataValues) {
                        allSkusInThisFlashSale.set(sku.id, sku);
                    }
                });
            });
        });

        allSkusInThisFlashSale.forEach(sku => {
       
            if (sku.dataValues.salePrice === undefined) {
             
                delete sku.dataValues.flashSaleInfo;
             
                if (sku.dataValues.isSoldOut === undefined) {
                    sku.dataValues.isSoldOut = false;
                }
            } else {
           
                if (!sku.dataValues.flashSaleInfo && !sku.dataValues.isFlashSaleItem) {
                    sku.dataValues.flashSaleInfo = {
                        flashSaleId: flashSale.id,
                        isSoldOut: false,
                        isFlashSaleItem: false 
                    };
                    sku.dataValues.isSoldOut = false;
                }
            }
 
            delete sku.dataValues._bestPriority;
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