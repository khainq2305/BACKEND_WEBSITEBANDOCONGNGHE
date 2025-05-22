const { Product, Sku, ProductMedia } = require('../../models');

class ProductController {
  // ✅ Thêm sản phẩm
 static async create(req, res) {
    const t = await Product.sequelize.transaction();
    try {
      const {
        name,
        description,
        shortDescription,
        thumbnail,
        hasVariants,
        orderIndex,
        isActive,
        categoryId,
        brandId,
        skus
      } = req.body;

      // ✅ 1. Tạo sản phẩm
      const product = await Product.create({
        name,
        description,
        shortDescription,
        thumbnail,
        hasVariants,
        orderIndex,
        isActive,
        categoryId,
        brandId
      }, { transaction: t });

      // ✅ 2. Chỉ xử lý nếu KHÔNG có biến thể
      if (!hasVariants && skus?.length) {
        const sku = skus[0]; // chỉ lấy SKU đầu tiên

        const newSKU = await Sku.create({ // ✅ Sửa SKU → Sku
          skuCode: sku.skuCode,
          originalPrice: sku.originalPrice,
          price: sku.price,
          stock: sku.stock,
          isActive: true,
          productId: product.id
        }, { transaction: t });

        // ✅ 3. Thêm ảnh media nếu có
        if (sku.mediaUrls?.length) {
          for (const url of sku.mediaUrls) {
            await ProductMedia.create({
              skuId: newSKU.id,
              mediaUrl: url,
              type: 'image'
            }, { transaction: t });
          }
        }
      }

      await t.commit();
      return res.status(201).json({ message: '✅ Thêm sản phẩm thành công', data: product });

    } catch (error) {
      await t.rollback();
      console.error('❌ Lỗi khi thêm sản phẩm:', error);
      return res.status(500).json({ message: '❌ Lỗi server', error: error.message });
    }
  }

  // ✅ Lấy danh sách sản phẩm (basic)
  static async getAll(req, res) {
    try {
      const products = await Product.findAll();
      res.json({ data: products });
    } catch (error) {
      res.status(500).json({ message: "Lỗi lấy danh sách sản phẩm" });
    }
  }
}

module.exports = ProductController;
