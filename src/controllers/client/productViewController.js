const { ProductView, Product, Category, Brand, Sku } = require('../../models'); 
const { Op, fn, col } = require('sequelize');

class ProductViewController {
  // ✅ Ghi nhận lượt xem (không cần userId)
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
      console.error('❌ Lỗi khi thêm lượt xem ẩn danh:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  // ✅ Lấy danh sách sản phẩm đã xem từ danh sách ID (gửi từ FE localStorage)
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
          // ⭐ Sửa đổi quan trọng: Thêm include cho Sku để lấy giá
          {
            model: Sku,
            as: 'skus', // Giữ alias là 'skus' để khớp với frontend
            attributes: ['price', 'originalPrice'], // Chỉ cần lấy trường giá
            required: false // Dùng `required: false` để vẫn lấy sản phẩm dù nó chưa có SKU
          }
        ]
      });

      // Sắp xếp lại theo thứ tự đã xem
      const sortedProducts = ids.map(id => products.find(p => p.id === id)).filter(Boolean);

      res.json({ products: sortedProducts });
    } catch (err) {
      console.error('❌ Lỗi khi lấy sản phẩm theo ID:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  // ✅ Lấy top sản phẩm được xem nhiều nhất
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
      console.error('❌ Lỗi khi lấy top sản phẩm được xem nhiều:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

module.exports = ProductViewController;
