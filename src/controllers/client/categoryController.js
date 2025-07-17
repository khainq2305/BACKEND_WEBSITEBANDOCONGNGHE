const { Category, categoryPostModel } = require("../../models");
class CategoryController {
  static async getNestedCategories(req, res) {
    try {
      const all = await Category.findAll({
        attributes: [
          "id",
          "name",
          "slug",
          "parentId",
          "thumbnail",
          "isActive",
          "sortOrder",
        ],
        where: {
          isActive: 1,
          deletedAt: null,
        },
        order: [["sortOrder", "ASC"]],
      });

      const parents = all.filter((cat) => !cat.parentId);
      const children = all.filter((cat) => cat.parentId);

      const data = parents.map((parent) => {
        const sub = children.filter((child) => child.parentId === parent.id);
        return {
          ...parent.dataValues,
          children: sub.map((s) => s.dataValues),
        };
      });

      res.json(data);
    } catch (err) {
      console.error("Lỗi lấy danh mục:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async getBySlug(req, res) {
    try {
      const { slug } = req.params;
      const category = await Category.findOne({
        where: { slug, deletedAt: null },
        include: [
          {
            model: Category,
            as: "parent",
            attributes: ["id", "name", "slug"],
          },
        ],
      });

      if (!category) {
        return res.status(404).json({ message: "Không tìm thấy danh mục" });
      }

      res.json(category);
    } catch (err) {
      console.error("❌ Lỗi khi lấy danh mục theo slug:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
  static async getCombinedMenu(req, res) {
    try {
      const [productCats, postCats] = await Promise.all([
        Category.findAll({
          attributes: [
            "id",
            "name",
            "slug",
            "parentId",
            "thumbnail",
            "isActive",
            "sortOrder",
          ],
          where: { isActive: 1, deletedAt: null },
          order: [["sortOrder", "ASC"]],
        }),
        categoryPostModel.findAll({
          attributes: [
            "id",
            "name",
            "slug",
            "parentId",
            "isActive",
            "sortOrder",
          ],
          where: { isActive: 1, deletedAt: null },
          order: [["sortOrder", "ASC"]],
        }),
      ]);

      const productParents = productCats.filter((cat) => !cat.parentId);
      const productChildren = productCats.filter((cat) => cat.parentId);

      const productTree = productParents.map((parent) => {
        const sub = productChildren.filter(
          (child) => child.parentId === parent.id
        );
        return {
          id: `product-${parent.id}`,
          name: parent.name,
          slug: parent.slug,
          thumbnail: parent.thumbnail,
          type: "product",
          children: sub.map((child) => ({
            id: `product-${child.id}`,
            name: child.name,
            slug: child.slug,
            thumbnail: child.thumbnail,
            type: "product",
          })),
        };
      });

      const postTree = postCats.map((postCat) => ({
        id: `post-${postCat.id}`,
        name: postCat.name,
        slug: postCat.slug,
        type: "post",
        children: [],
      }));

      const result = [...productTree, ...postTree];

      return res.json(result);
    } catch (error) {
      console.error("Lỗi getCombinedMenu:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy danh mục tổng hợp" });
    }
  }
}

module.exports = CategoryController;
