const { ProductView, Product, Category, Brand, Sku } = require('../../models'); 
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
            attributes: ['price', 'originalPrice'], 
            required: false 
          }
        ]
      });
      const sortedProducts = ids.map(id => products.find(p => p.id === id)).filter(Boolean);

      res.json({ products: sortedProducts });
    } catch (err) {
      console.error('Lỗi khi lấy sản phẩm theo ID:', err);
      res.status(500).json({ message: 'Lỗi server' });
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
