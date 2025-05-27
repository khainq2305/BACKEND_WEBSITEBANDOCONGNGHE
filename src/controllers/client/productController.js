const {
  Product,
  Category,
  Brand,
  Sku,
  ProductMedia,
  SkuVariantValue,
  VariantValue,
  Variant
} = require('../../models');

class ProductController {
  static async getProductDetailBySlug(req, res) {
    try {
      const { slug } = req.params;
      const { includeInactive } = req.query;

      console.log("📌 [GET PRODUCT DETAIL] Slug nhận vào:", slug);

      const whereClause = { slug };
      if (!includeInactive || includeInactive !== 'true') {
        whereClause.isActive = 1;
      }

      const product = await Product.findOne({
        where: whereClause,
        include: [
          { model: Category, as: 'category' },
          { model: Brand, as: 'brand' },
          {
            model: Sku,
            as: 'skus',
            include: [
              {
                model: ProductMedia,
                as: 'media',
                attributes: ['type', 'mediaUrl', 'sortOrder']
              },
              {
                model: SkuVariantValue,
                as: 'variantValues',
                include: [
                  {
                    model: VariantValue,
                    as: 'variantValue',
                    include: [
                      {
                        model: Variant,
                        as: 'variant',
                        attributes: ['id', 'name', 'type']
                      }
                    ]
                  }
                ]
              }
            ]
          }
        ]
      });

      if (!product) {
        return res.status(404).json({ message: '❌ Không tìm thấy sản phẩm theo slug này!' });
      }

      return res.status(200).json({ product });
    } catch (err) {
      console.error('🔥 Lỗi khi lấy chi tiết sản phẩm:', err);
      return res.status(500).json({ message: '⚠️ Lỗi server khi lấy chi tiết sản phẩm' });
    }
  }

  static async getProductsByCategory(req, res) {
    try {
      const slug = req.query.slug;
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 20;
      const offset = (page - 1) * limit;

      const whereClause = {
        isActive: 1,
        deletedAt: null
      };

      let categoryIds = [];

      if (slug) {
        const parentCategory = await Category.findOne({
          where: {
            slug,
            isActive: 1,
            deletedAt: null
          }
        });

        if (!parentCategory) {
          return res.status(404).json({ message: 'Không tìm thấy danh mục' });
        }

        const allCategories = await Category.findAll({
          where: { isActive: 1, deletedAt: null }
        });

        const subCategoryIds = allCategories
          .filter(cat => cat.parentId === parentCategory.id)
          .map(cat => cat.id);

        categoryIds = [parentCategory.id, ...subCategoryIds];
        whereClause.categoryId = categoryIds;
      }

      const { count, rows } = await Product.findAndCountAll({
        where: whereClause,
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      res.json({
        totalItems: count,
        currentPage: page,
        totalPages: Math.ceil(count / limit),
        products: rows
      });
    } catch (error) {
      console.error('❌ Lỗi lấy sản phẩm theo danh mục (slug):', error);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

module.exports = ProductController;
