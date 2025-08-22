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
    ProductMedia 
} = require("../../models");
const { Op, fn, col, Sequelize } = require('sequelize');
const { literal } = Sequelize;

const { processSkuPrices } = require('../../helpers/priceHelper'); 

class SectionClientController {
static async getHomeSections(req, res) {
  try {
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
          attributes: [
            'id',
            'flashSaleId',
            'skuId',
            'salePrice',
            'quantity',
            'maxPerUser',
            [
              Sequelize.literal(`(
                SELECT COALESCE(SUM(oi.quantity), 0)
                FROM orderitems oi
                INNER JOIN orders o ON oi.orderId = o.id
                WHERE oi.flashSaleId = flashSaleItems.flashSaleId
                  AND oi.skuId = flashSaleItems.skuId
                  AND o.status IN ('completed', 'delivered')
              )`),
              'soldQuantityForFlashSaleItem',
            ],
          ],
          include: [
            {
              model: Sku,
              as: 'sku',
              attributes: [
                'id',
                'skuCode',
                'price',
                'originalPrice',
                'stock',
                'productId',
              ],
              include: [
                { model: Product, as: 'product', attributes: ['categoryId'] },
              ],
            },
          ],
        },
        {
          model: FlashSaleCategory,
          as: 'categories',
          required: false,
          include: [
            {
              model: FlashSale,
              as: 'flashSale',
              attributes: ['endTime'],
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
          if (
            !allActiveFlashSaleItemsMap.has(skuId) ||
            flashItemSalePrice < allActiveFlashSaleItemsMap.get(skuId).salePrice
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

    const sections = await HomeSection.findAll({
      where: { isActive: true },
      order: [['orderIndex', 'ASC']],
      include: [
        {
          model: HomeSectionBanner,
          as: 'banners',
          attributes: ['id', 'imageUrl', 'linkType', 'linkValue', 'sortOrder'],
          separate: true,
          order: [['sortOrder', 'ASC']],
        },
        {
          model: Category,
          as: 'linkedCategories',
          attributes: ['id', 'name', 'slug'],
          through: { attributes: ['sortOrder'] },
        },
        {
          model: Product,
          as: 'products',
          required: false,
          attributes: [
            'id',
            'name',
            'slug',
            'thumbnail',
            'badge',
            'badgeImage',
            'categoryId',
          ],
          through: { attributes: ['sortOrder'] },
          include: [
            {
              model: Sku,
              as: 'skus',
              required: false,
              attributes: [
                'id',
                'skuCode',
                'price',
                'originalPrice',
                'stock',
                'productId',
              ],
              include: [
                {
                  model: OrderItem,
                  as: 'OrderItems',
                  attributes: ['quantity'],
                  required: false,
                  include: [
                    {
                      model: Order,
                      as: 'order',
                      attributes: [],
                      where: { status: { [Op.in]: ['delivered', 'completed'] } },
                      required: true,
                    },
                  ],
                },
                {
                  model: Review,
                  as: 'reviews',
                  attributes: ['rating'],
                  required: false,
                },
                {
                  model: ProductMedia,
                  as: 'ProductMedia',
                  attributes: ['mediaUrl', 'type', 'sortOrder'],
                  required: false,
                },
              ],
            },
            { model: Category, as: 'category', attributes: ['id', 'name', 'slug'] },
          ],
        },
      ],
    });

    const TYPE_LOGIC_MAP = {
      productOnly: 'onlyProduct',
      productWithCategoryFilter: 'productWithCategoryFilter',
      productWithBanner: 'productWithBanner',
      full: 'full',
    };

    const data = sections.map((sec) => {
      const section = sec.toJSON();

      const typeNorm = TYPE_LOGIC_MAP[section.type] || section.type;
      const noBannerTypes = ['onlyProduct', 'productWithCategoryFilter'];

      if (noBannerTypes.includes(typeNorm)) {
        if (section.banners?.length) {
          console.log(
            `[getHomeSections] strip banners for section id=${section.id} type=${section.type}`
          );
        }
        section.banners = [];
      }
      if (typeNorm === 'onlyProduct') {
        if (section.linkedCategories?.length) {
          console.log(
            `[getHomeSections] strip linkedCategories for section id=${section.id} type=${section.type}`
          );
        }
        section.linkedCategories = [];
      }

      section.products = (section.products || []).map((prod) => {
        const prodData = prod.toJSON ? prod.toJSON() : prod;

        const soldCount = (prodData.skus || []).reduce((total, sku) => {
          return (
            total +
            (sku.OrderItems?.reduce((s, oi) => s + (oi.quantity || 0), 0) || 0)
          );
        }, 0);

        let ratingSum = 0,
          ratingCnt = 0;
        (prodData.skus || []).forEach((sku) => {
          (sku.reviews || []).forEach((rv) => {
            const r = Number(rv.rating);
            if (r > 0) {
              ratingSum += r;
              ratingCnt += 1;
            }
          });
        });
        const rating = ratingCnt
          ? parseFloat((ratingSum / ratingCnt).toFixed(1))
          : 0;

        const processedSkus = (prodData.skus || []).map((sku) => {
          const skuData = sku.toJSON ? sku.toJSON() : sku;
          skuData.Product = { category: { id: prodData.categoryId } };
          const priceResults = processSkuPrices(
            skuData,
            allActiveFlashSaleItemsMap,
            allActiveCategoryDealsMap
          );
          return {
            ...skuData,
            price: priceResults.price,
            originalPrice: priceResults.originalPrice,
            flashSaleInfo: priceResults.flashSaleInfo,
            discount: priceResults.discount,
            hasDeal: priceResults.hasDeal,
          };
        });

        processedSkus.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

        const selectedDefaultSku =
          processedSkus.length > 0 ? processedSkus[0] : null;

        return {
          ...prodData,
          skus: processedSkus,
          defaultSku: selectedDefaultSku,
          soldCount,
          rating,
          ProductHomeSection: prodData.ProductHomeSection || {},
        };
      });

      section.products.sort(
        (a, b) =>
          (a.ProductHomeSection?.sortOrder || 0) -
          (b.ProductHomeSection?.sortOrder || 0)
      );

      return section;
    });

    return res.json({ success: true, data });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi lấy danh sách section',
      error: err.message,
    });
  }}

}

module.exports = SectionClientController;