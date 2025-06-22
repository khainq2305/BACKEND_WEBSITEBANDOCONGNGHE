const { ProductView, Product, Category, Brand, Sku, FlashSaleItem, FlashSale } = require('../../models'); 
const { Op, fn, col } = require('sequelize');

class ProductViewController {
  
  static async addView(req, res) {
    try {
      const { productId } = req.body;

      if (!productId) {
        return res.status(400).json({ message: 'Thiếu productId' });
      }

      await ProductView.create({
        userId: null,
        productId
      });

      return res.status(201).json({ message: 'Đã ghi nhận lượt xem (ẩn danh)' });
    } catch (err) {
      console.error('Lỗi khi thêm lượt xem ẩn danh:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

 
   static async getByIds(req, res) {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ids không hợp lệ' });
    }

    // 1) Lấy tất cả products + skus + flash sale nếu có
    const products = await Product.findAll({
      where: {
        id: { [Op.in]: ids },
        isActive: true,
        deletedAt: null
      },
      attributes: ['id', 'name', 'slug', 'thumbnail'],
      include: [
        { model: Brand, as: 'brand', attributes: ['id', 'name'] },
        { model: Category, as: 'category', attributes: ['id', 'name'] },
        {
          model: Sku,
          as: 'skus',
          attributes: ['id', 'price', 'originalPrice', 'stock'],
          required: false,
          include: [
            {
              model: FlashSaleItem,
              as: 'flashSaleSkus',
              required: false,
              include: [
                {
                  model: FlashSale,
                  as: 'flashSale',
                  where: {
                    isActive: true,
                    startTime: { [Op.lte]: new Date() },
                    endTime:   { [Op.gte]: new Date() }
                  },
                  required: true,
                  attributes: ['id', 'endTime']
                }
              ]
            }
          ]
        }
      ]
    });

    // 2) Map theo đúng thứ tự ids và override giá nếu có flash sale
    const sorted = ids
      .map(id => products.find(p => p.id === id))
      .filter(Boolean)
      .map(p => {
        const pj = p.toJSON();
        // tìm sku ưu tiên flash sale, nếu không thì lấy sku đầu tiên
        const best = pj.skus.find(sku => sku.flashSaleSkus?.length > 0) || pj.skus[0] || {};

        const fsItem = best.flashSaleSkus?.[0];
        let price, originalPrice;

        if (fsItem) {
          // Có flash sale → salePrice và gạch giá thường
         price         = parseFloat(fsItem.salePrice)       || 0;
originalPrice = parseFloat(best.originalPrice)     || 0; // ✅ GẠCH GIÁ GỐC

        } else if (best.price != null) {
          // Không có flash sale nhưng có giá thường
          price         = parseFloat(best.price)         || 0;
          originalPrice = parseFloat(best.originalPrice) || 0;
        } else {
          // Không có flash sale, không có giá thường → chỉ có giá gốc
          price         = parseFloat(best.originalPrice) || 0;
          originalPrice = 0;
        }

        return {
          id: pj.id,
          name: pj.name,
          slug: pj.slug,
          thumbnail: pj.thumbnail,
          brand: pj.brand,
          category: pj.category,
          price,          // salePrice hoặc price thường hoặc originalPrice
          originalPrice,  // giá gốc nếu có sale hoặc price, ngược lại = 0
          inStock: best.stock > 0
        };
      });

    return res.json({ products: sorted });
  } catch (err) {
    console.error('Lỗi khi lấy sản phẩm theo ID:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

  static async getTopViewedProducts(req, res) {
    try {
      const limit = parseInt(req.query.limit) || 10;

      const topViewed = await Product.findAll({
        attributes: {
          include: [
            [fn('COUNT', col('views.id')), 'viewCount']
          ]
        },
        include: [
          {
            model: ProductView,
            as: 'views',
            attributes: []
          },
          { model: Brand, as: 'brand', attributes: ['id', 'name'] },
          { model: Category, as: 'category', attributes: ['id', 'name'] }
        ],
        group: ['Product.id', 'brand.id', 'category.id'],
        order: [[fn('COUNT', col('views.id')), 'DESC']],
        limit
      });

      res.json({ products: topViewed });
    } catch (err) {
      console.error('Lỗi khi lấy top sản phẩm được xem nhiều:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

module.exports = ProductViewController;
