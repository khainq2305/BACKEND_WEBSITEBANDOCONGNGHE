const {
  FlashSale, FlashSaleItem, FlashSaleCategory,
  Sku, Product, ProductMedia, Category, OrderItem, Order, Review // Thêm Order, OrderItem, Review nếu cần cho soldCount, averageRating
} = require('../../models');

const { Sequelize, Op } = require('sequelize');

class FlashSaleClientController {
  static async getAll(req, res) {
    try {
      const allSales = await FlashSale.findAll({
        where: {
          isActive: true,
          deletedAt: null,
          // Thêm điều kiện thời gian để chỉ lấy flash sale đang hoặc sắp diễn ra
          // Điều này giúp giảm tải và chỉ hiển thị các sale có liên quan
          [Op.or]: [
            { startTime: { [Op.lte]: new Date() }, endTime: { [Op.gte]: new Date() } }, // Đang diễn ra
            { startTime: { [Op.gt]: new Date() } } // Sắp diễn ra
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
        order: [['startTime', 'ASC']]
      });

      const resetAllSkuSalePrices = (flashSale) => {
        // Reset salePrice và flashSaleInfo cho tất cả SKUs để đảm bảo tính toán mới
        // flashSaleItems
        flashSale.flashSaleItems?.forEach((it) => {
          if (it?.sku?.dataValues) {
            delete it.sku.dataValues.salePrice;
            delete it.sku.dataValues.flashSaleInfo;
            delete it.sku.dataValues.isSoldOut;
            delete it.sku.dataValues._bestPriority; // Xóa cả ưu tiên nếu có
          }
        });
        // categories (cho sản phẩm liên quan đến category)
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
        // Luôn reset thông tin khuyến mãi cho từng SKU trong mỗi Flash Sale để tính toán lại
        resetAllSkuSalePrices(flashSale);

        const currentTime = new Date();
        const saleIsActive = currentTime >= flashSale.startTime && currentTime <= flashSale.endTime;

        // --- Bước 1: Xử lý giá từ FlashSaleItem (Sản phẩm cụ thể trong Flash Sale) ---
        // Ưu tiên cao nhất
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

          // Lọc các flashSaleItems còn suất và có salePrice hợp lệ
          const availableItems = items.filter(it => {
            const sold = parseInt(it.dataValues?.soldQuantity || 0);
            const limit = it.quantity;
            // Một flashSaleItem được coi là hợp lệ nếu:
            // 1. Có salePrice
            // 2. Chưa hết suất (quantity > 0 và sold < quantity, hoặc quantity là null/0 có nghĩa là không giới hạn)
            const hasValidSalePrice = it.salePrice !== undefined && it.salePrice !== null;
            const hasAvailableSlots = (limit === null || limit === 0 || (limit > 0 && sold < limit));
            return hasValidSalePrice && hasAvailableSlots;
          });

          // console.log(`SKU ${skuId} (Item): availableItems count: ${availableItems.length}`);
availableItems.sort((a, b) =>
  (a.dataValues.soldQuantity || 0) - (b.dataValues.soldQuantity || 0)
);

          if (saleIsActive && availableItems.length > 0) {
            // Chọn flashSaleItem tốt nhất (ví dụ: giảm giá nhiều nhất)
            // Hiện tại, ta chỉ lấy cái đầu tiên vì ít khi có nhiều item cho cùng 1 SKU trong 1 flash sale
            const selectedItem = availableItems[0];
            const basePrice = sku.originalPrice ?? sku.price;
            let calculatedSalePrice = selectedItem.salePrice;

            // Đảm bảo giá sale không cao hơn giá gốc
            if (calculatedSalePrice >= basePrice) {
              calculatedSalePrice = basePrice;
            }

            sku.dataValues.salePrice = calculatedSalePrice;
            sku.dataValues.flashSaleInfo = {
                flashSaleId: selectedItem.flashSaleId,
  quantity: selectedItem.quantity, // Số suất được cấu hình
  sold: parseInt(selectedItem.dataValues?.soldQuantity || 0),
  originalQuantity: selectedItem.quantity, // ✅ CHỈ DÙNG quantity thôi
              isSoldOut: false,
              limitPerUser: selectedItem.maxPerUser,
              isFlashSaleItem: true // Đánh dấu đây là FlashSaleItem
            };
            sku.dataValues.isSoldOut = false; // Ở cấp độ SKU, chưa hết hàng trong flash sale này
          } else {
            // Nếu flash sale không hoạt động HOẶC tất cả flashSaleItems cho SKU này đều hết suất/không hợp lệ
            // Đặt isSoldOut = true nếu nó đã hết suất trong flash sale (dù flash sale có đang chạy hay không)
            // hoặc đơn giản là không có ưu đãi FlashSaleItem hợp lệ
         sku.dataValues.isSoldOut = true;
sku.dataValues.flashSaleInfo = { isSoldOut: true, isFlashSaleItem: true };
delete sku.dataValues.salePrice; // ✅ Quan trọng: phải xóa giá sale đi

          }
        });

        // --- Bước 2: Xử lý giá từ FlashSaleCategory (Danh mục trong Flash Sale) ---
        // Ưu tiên thấp hơn FlashSaleItem
        (flashSale.categories || []).forEach((cat) => {
          const { discountType = 'percent', discountValue = 0, priority = 0 } = cat;

          (cat.category?.products || []).forEach((prod) => {
            (prod.skus || []).forEach((sku) => {
              // Cập nhật soldCount và averageRating cho SKU từ category
              if (sku?.dataValues) {
                sku.soldCount = parseInt(sku.dataValues.soldCount || 0);
                sku.averageRating = parseFloat(sku.dataValues.averageRating || 0);
              }

              // Chỉ áp dụng giảm giá theo danh mục nếu flash sale đang hoạt động
              if (!saleIsActive) {
                // Nếu flash sale không hoạt động, không áp dụng giảm giá theo danh mục của flash sale này
                return;
              }

              // Kiểm tra xem SKU này đã có salePrice từ FlashSaleItem chưa
              // Hoặc nếu nó đã bị đánh dấu là hết hàng (isSoldOut) từ FlashSaleItem
              // FlashSaleItem có ưu tiên cao nhất, nếu đã có salePrice hoặc đã hết suất ở cấp FlashSaleItem,
              // thì không áp dụng giảm giá theo category nữa.
if (
  sku.dataValues.flashSaleInfo?.isFlashSaleItem &&
  sku.dataValues.flashSaleInfo?.isSoldOut === false
) {
  return;
}


              // Nếu không có salePrice từ FlashSaleItem, tính toán giá từ FlashSaleCategory
              const basePrice = sku.originalPrice ?? sku.price;
              let newPrice;

              if (discountType === 'percent') {
                newPrice = basePrice * (100 - discountValue) / 100;
              } else { // 'fixed'
                newPrice = basePrice - discountValue;
              }
              newPrice = Math.max(0, Math.round(newPrice / 1000) * 1000);

              // Chỉ cập nhật nếu giá mới tốt hơn giá hiện tại (hoặc chưa có giá nào)
              // Hoặc nếu chưa có flashSaleInfo cụ thể (tức là không phải là FlashSaleItem)
              if (sku.dataValues.salePrice === undefined || newPrice < sku.dataValues.salePrice) {
                sku.dataValues.salePrice = newPrice;
           

                sku.dataValues.flashSaleInfo = {
                  flashSaleId: flashSale.id, // Gán flashSaleId của Flash Sale chính
                  discountType: discountType,
                  
                  discountValue: discountValue,
                  isSoldOut: false, // Category discount không có khái niệm hết suất riêng lẻ
                  isFlashSaleItem: false // Đánh dấu đây là category discount
                };
                sku.dataValues.isSoldOut = false; // Đánh dấu là còn hàng vì category discount không có suất cụ thể
              }
            });
          });
        });

        // --- Bước 3: Chuẩn hóa dữ liệu cho Frontend ---
        // Đảm bảo rằng mỗi SKU có flashSaleInfo và isSoldOut rõ ràng
        // Duyệt qua tất cả flashSaleItems và category products để chuẩn hóa
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
            // Nếu SKU không có salePrice sau tất cả các tính toán
            // và không phải là isSoldOut = true (do hết suất item),
            // thì giá hiển thị sẽ là giá price mặc định của SKU.
            if (sku.dataValues.salePrice === undefined) {
                // Xóa flashSaleInfo nếu không có salePrice cụ thể từ flash sale nữa
                delete sku.dataValues.flashSaleInfo;
                // Nếu isSoldOut đã được set từ FlashSaleItem và là true, giữ nguyên
                // Nếu chưa được set, mặc định là false (không hết hàng do flash sale)
                if (sku.dataValues.isSoldOut === undefined) {
                    sku.dataValues.isSoldOut = false; // Không hết hàng nếu không có flash sale cụ thể
                }
            } else {
                // Nếu có salePrice, nhưng flashSaleInfo chưa được set đầy đủ từ category discount
                if (!sku.dataValues.flashSaleInfo && !sku.dataValues.isFlashSaleItem) {
                    sku.dataValues.flashSaleInfo = {
                        flashSaleId: flashSale.id,
                        isSoldOut: false,
                        isFlashSaleItem: false // Là category discount
                    };
                    sku.dataValues.isSoldOut = false;
                }
            }
            // Đảm bảo không có _bestPriority được gửi ra frontend
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