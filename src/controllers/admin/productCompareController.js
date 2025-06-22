const { Product, ProductSpec } = require("../../models");
const { Op } = require("sequelize");

const ProductCompareController = {
  // [GET] /admin/product-compare?ids=1,2,3
  async getCompareSpecs(req, res) {
    try {
      const ids = req.query.ids?.split(",").map(id => parseInt(id)).filter(id => !isNaN(id));
      if (!ids || ids.length === 0) {
        return res.status(400).json({ message: "Thiếu danh sách ID sản phẩm" });
      }

      // Lấy thông tin sản phẩm kèm categoryId để kiểm tra cùng danh mục
      const products = await Product.findAll({
        where: { id: ids },
        attributes: ["id", "name", "thumbnail", "slug", "categoryId"], // ✅ thêm categoryId để kiểm tra
      });

      // ✅ Kiểm tra tất cả sản phẩm có cùng categoryId hay không
      const categoryIds = new Set(products.map(p => p.categoryId));
      if (categoryIds.size > 1) {
        return res.status(400).json({ message: "Chỉ có thể so sánh sản phẩm trong cùng danh mục" });
      }

      // Lấy thông số kỹ thuật của các sản phẩm
      const specs = await ProductSpec.findAll({
        where: { productId: ids },
        attributes: ["productId", "specKey", "specValue", "specGroup", "sortOrder"],
        order: [["sortOrder", "ASC"]],
      });

      // Gom thông số theo specKeyy
      const specMap = {};
      specs.forEach(spec => {
        const key = spec.specKey;
        if (!specMap[key]) {
          specMap[key] = {
            specKey: key,
            specGroup: spec.specGroup,
            sortOrder: spec.sortOrder,
            values: {},
          };
        }
        specMap[key].values[spec.productId] = spec.specValue;
      });

      // Trả về dữ liệu
      return res.json({
        products: products.map(p => ({
          id: p.id,
          name: p.name,
          thumbnail: p.thumbnail,
          slug: p.slug,
        })),
        specs: Object.values(specMap).sort((a, b) => a.sortOrder - b.sortOrder),
      });
    } catch (err) {
      console.error("Lỗi getCompareSpecs:", err);
      return res.status(500).json({ message: "Lỗi server", error: err.message });
    }
  },
};
module.exports = ProductCompareController;
