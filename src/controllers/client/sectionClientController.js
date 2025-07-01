// controllers/SectionClientController.js

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
} = require("../../models");
const { Op, fn, col, Sequelize } = require('sequelize');
const { literal } = Sequelize;

class SectionClientController {
    static async getHomeSections(req, res) {
    try {
      const now = new Date();

      /* 1. Section + banner + product + sku + flash-sale + sold */
      const sections = await HomeSection.findAll({
        where : { isActive: true },
        order : [['orderIndex', 'ASC']],
        include: [
          /* Banners */
          {
            model      : HomeSectionBanner,
            as         : 'banners',
            attributes : ['id', 'imageUrl', 'linkType', 'linkValue', 'sortOrder'],
            separate   : true,
            order      : [['sortOrder', 'ASC']],
          },
          /* Shortcut category chips */
          {
            model      : Category,
            as         : 'linkedCategories',
            attributes : ['id', 'name', 'slug'],
            through    : { attributes: ['sortOrder'] },
          },
          /* PRODUCTS */
          {
            model      : Product,
            as         : 'products',
            required   : false,
            attributes : [
              'id', 'name', 'slug', 'thumbnail', 'badge', 'badgeImage',
            ],
            through    : { attributes: ['sortOrder'] },
            include: [
              /* SKU */
              {
                model      : Sku,
                as         : 'skus',
                required   : false,
                attributes : [
                  'id', 'skuCode', 'price', 'originalPrice', 'stock',
                ],
                include: [
                  /* Flash-sale SKU riêng */
                  {
                    model      : FlashSaleItem,
                    as         : 'flashSaleSkus',
                    required   : false,
                    include: [{
                      model : FlashSale,
                      as    : 'flashSale',
                      where : {
                        isActive : true,
                        startTime: { [Op.lte]: now },
                        endTime  : { [Op.gte]: now },
                      },
                      required: false,
                    }],
                  },
                  /* Đơn đã giao – đếm sold */
                  {
                    model      : OrderItem,
                    as         : 'OrderItems',
                   required   : true,    
                    include   : [{
                      model      : Order,
                      as         : 'order',
                      attributes : [],
                      where      : { status: { [Op.in]: ['delivered', 'completed'] } },
                    required   : true,    
                    }],
                  },
                  /* Review trên SKU  */
                  {
                    model      : Review,
                    as         : 'reviews',
                    attributes : ['rating'],
                    required   : false,
                  },
                ],
              },
              /* Category của product (để check deal) */
              {
                model      : Category,
                as         : 'category',
                attributes : ['id', 'name', 'slug'],
              },
            ],
          },
        ],
      });

      /* 2. Deal giảm giá theo category đang chạy */
      const activeCatDeals = await FlashSaleCategory.findAll({
        include: [{
          model      : FlashSale,
          as         : 'flashSale',
          attributes : ['endTime'],
          where      : {
            isActive : true,
            startTime: { [Op.lte]: now },
            endTime  : { [Op.gte]: now },
          },
        }],
      });

      const catDealMap = new Map();
      activeCatDeals.forEach((d) => {
        const exist = catDealMap.get(d.categoryId);
        if (!exist || d.priority > exist.priority) {
          catDealMap.set(d.categoryId, {
            discountType : d.discountType,
            discountValue: d.discountValue,
            priority     : d.priority,
            endTime      : d.flashSale.endTime,
          });
        }
      });

      /* 3. Chuẩn hoá dữ liệu trả về */
      const data = sections.map((sec) => {
        const section = sec.toJSON();

        section.products = (section.products || []).map((prod) => {
          /* ---- soldCount ---- */
          const soldCount = (prod.skus || []).reduce((tot, sku) => {
            const sold = sku.OrderItems?.reduce(
              (s, oi) => s + (oi.quantity || 0), 0,
            ) || 0;
            return tot + sold;
          }, 0);

          /* ---- rating ---- */
          let ratingSum = 0;
          let ratingCnt = 0;
          (prod.skus || []).forEach((sku) => {
            (sku.reviews || []).forEach((rv) => {
              const v = Number(rv.rating) || 0;
              if (v > 0) { ratingSum += v; ratingCnt += 1; }
            });
          });
          const rating = ratingCnt ? (ratingSum / ratingCnt).toFixed(1) : 0;

          /* ---- xử lý giá cho từng SKU ---- */
          const skus = (prod.skus || []).map((sku) => {
            /* flash-sale SKU riêng */
            const fsItem = sku.flashSaleSkus?.[0];
            if (fsItem && fsItem.flashSale) {
              return {
                ...sku,
                originalPrice: sku.originalPrice,
                price        : fsItem.salePrice,
                salePrice    : fsItem.salePrice,
                flashSaleInfo: {
                  quantity: fsItem.quantity,
                  endTime : fsItem.flashSale.endTime,
                },
              };
            }

            /* deal category */
            const deal = catDealMap.get(prod.category?.id);
            if (deal) {
              let newPrice = sku.price;
              newPrice = deal.discountType === 'percent'
                ? (sku.price * (100 - deal.discountValue)) / 100
                : sku.price - deal.discountValue;
              newPrice = Math.max(0, Math.round(newPrice / 1000) * 1000);

              return {
                ...sku,
                originalPrice  : sku.originalPrice,
                price          : newPrice,
                salePrice      : newPrice,
                flashSaleInfo  : { endTime: deal.endTime },
                discountApplied: { type: deal.discountType, value: deal.discountValue },
              };
            }
            return sku;
          });

          /* sắp SKU theo giá tăng dần */
          skus.sort((a, b) => parseFloat(a.price) - parseFloat(b.price));

          return { ...prod, skus, soldCount, rating };
        });

        /* sắp product theo sortOrder */
        section.products.sort(
          (a, b) =>
            (a.ProductHomeSection?.sortOrder || 0) -
            (b.ProductHomeSection?.sortOrder || 0),
        );

        return section;
      });

      return res.json({ success: true, data });
    } catch (err) {
      /* lỗi chung */
      console.error('[SectionClientController.getHomeSections]', err);
      return res.status(500).json({
        success: false,
        message: 'Lỗi server khi lấy danh sách section',
        error  : err.message,
      });
    }
  }
}

module.exports = SectionClientController;
