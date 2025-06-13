const { Post, categoryPostModel, User } = require("../../models/index");
const { Op } = require("sequelize");

class PostController {
  static async getFeaturePost(req, res) {
    try {
      const posts = await Post.findAll({
        where: { isFeature: true },
        limit: 5,
        order: [["createdAt", "DESC"]],
      });

      return res.json({ data: posts });
    } catch (error) {
      console.error("Lỗi khi lấy bài viết nổi bật:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async getByCategorySlug(req, res) {
    try {
      const { slug } = req.params;
      const limit = parseInt(req.query.limit) || 10;
      console.log(limit);
      const category = await categoryPostModel.findOne({ where: { slug } });
      if (!category) {
        return res.status(404).json({ message: "Không tìm thấy danh mục" });
      }

      const posts = await Post.findAll({
        where: { categoryId: category.id },
        include: [
          {
            model: categoryPostModel,
            as: "category",
            attributes: ["id", "name"],
          },
          {
            model: User,
            as: "author",
            attributes: ["id", "fullName"],
          },
        ],
        order: [["createdAt", "DESC"]],
        limit,
      });

      return res.json({ data: posts });
    } catch (error) {
      console.error("Lỗi khi lấy bài viết theo danh mục:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async getBySlug(req, res) {
    try {
      console.log("Đã gọi API chi tiết bài viết");
      const { slug } = req.params;
      console.log(slug);
      const post = await Post.findOne({
        where: { slug },
        include: [
          {
            model: categoryPostModel,
            as: "category",
            attributes: ["id", "name"],
          },
          {
            model: User,
            as: "author",
            attributes: ["id", "fullName", "avatarUrl"],
          },
        ],
      });

      if (!post) {
        return res.status(404).json({ message: "Không tìm thấy bài viết" });
      }

      return res.json({ data: post });
    } catch (error) {
      console.error("getBySlug error:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async getRelatedPosts(req, res) {
    try {
      const { slug } = req.params;
      console.log("lấy bài viết liên quan theo ", slug);
      const post = await Post.findOne({
        where: { slug },
        attributes: ["id", "categoryId"],
      });

      if (!post) {
        return res.status(404).json({ message: "Không tìm thấy bài viết" });
      }

      const related = await Post.findAll({
        where: {
          categoryId: post.categoryId,
          slug: { [Op.ne]: slug },
        },
        order: [["createdAt", "DESC"]],
        limit: 6,
      });
      return res.json({ data: related });
    } catch (error) {
      console.error("getRelatedPosts error:", error);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = PostController;
