const { Op } = require("sequelize");
const slugify = require("slugify");
const { Post, Category, User, Tags, PostTag, categoryPostModel } = require('../../models/index');

class PostController {
  // [CREATE] Thêm bài viết
  static async create(req, res) {
    try {
      const {
        title,
        content,
        categoryId,
        authorId,
        orderIndex = 0,
        publishAt,
        slug,
        isFeature,
      } = req.body;
  
      const file = req.file;
      const tags = JSON.parse(req.body.tags || "[]");
  
      let finalPublishAt = null;
let finalStatus = 1; // mặc định đăng ngay

// Nếu publishAt là 'null' hoặc undefined thì bỏ qua
if (publishAt && publishAt !== 'null') {
  const pubDate = new Date(publishAt);
  if (!isNaN(pubDate)) { // kiểm tra date hợp lệ
    finalPublishAt = pubDate;
    finalStatus = pubDate > new Date() ? 2 : 1; // quá khứ → đăng ngay, tương lai → scheduled
  }
}
  
      const newPost = await Post.create({
        title,
        content,
        categoryId,
        authorId,
        orderIndex,
        slug,
        isFeature,
        thumbnail: file ? file.path : null,
        publishAt: finalPublishAt,
        status: finalStatus,
      });
  
      // Xử lý tags
      const tagInstances = [];
      for (const tagItem of tags) {
        const tagName = typeof tagItem === "string" ? tagItem : tagItem?.name;
        const tagSlug =
          typeof tagItem === "string"
            ? tagItem.toLowerCase().trim().replace(/\s+/g, "-")
            : tagItem?.slug || tagName?.toLowerCase().trim().replace(/\s+/g, "-");
  
        if (!tagName || !tagSlug) continue;
  
        let tag = await Tags.findOne({ where: { slug: tagSlug } });
        if (!tag) tag = await Tags.create({ name: tagName, slug: tagSlug });
  
        tagInstances.push(tag);
      }
  
      await newPost.addTags(tagInstances);
  
      return res
        .status(201)
        .json({ message: "Tạo bài viết thành công", data: newPost });
    } catch (error) {
      console.error("CREATE POST ERROR:", error);
      return res.status(500).json({ message: "Lỗi server khi tạo bài viết" });
    }
  }
  
  static async getAll(req, res) {
    console.log('da goi getall')
    try {
      const { search = "", categoryId, status } = req.query;
      const { page, limit, offset } = req.pagination;

      const whereClause = {};

      if (search) {
        whereClause.title = { [Op.like]: `%${search}%` };
      }

      if (categoryId) {
        whereClause.categoryId = parseInt(categoryId, 10);
      }
      if (status === "trash") {
        whereClause.deletedAt = { [Op.not]: null };
      } else {
        whereClause.deletedAt = null;

        if (status === "published") {
          whereClause.status = 1;
        } else if (status === "draft") {
          whereClause.status = 0;
        }
      }
      const { count, rows } = await Post.findAndCountAll({
        where: whereClause,
        limit,
        offset,
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
          {
            model: Tags,
            as: "tags",
            attributes: ["id", "name", "slug"],
            through: { attributes: [] }, // ẩn dữ liệu bảng trung gian posttag
          },
        ],
        paranoid: false,
        order: [["createdAt", "DESC"]],
      });

      // 👇 Tính số lượng từng loại bài viết (toàn bộ, kể cả xóa mềm)
      const allPosts = await Post.findAll({ paranoid: false });

      const counts = {
        all: allPosts.filter((p) => !p.deletedAt).length,
        published: allPosts.filter((p) => p.status === 1 && !p.deletedAt)
          .length,
        draft: allPosts.filter((p) => p.status === 0 && !p.deletedAt).length,
        trash: allPosts.filter((p) => p.deletedAt).length,
      };

      return res.json({
        data: rows,
        total: count,
        page,
        totalPages: Math.ceil(count / limit),
        counts, // 👈 Trả thêm counts cho FE
      });
    } catch (error) {
      console.error("GET POSTS ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi lấy danh sách bài viết" });
    }
  }

  // [READ] Lấy 1 bài viết theo slug
  static async getBySlug(req, res) {
    try {
      const { slug } = req.params;
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
            attributes: ["id", "fullName"],
          },
          {
            model: Tags,
            as: "tags",
            attributes: ["id", "name", "slug"],
            through: { attributes: [] }, // ẩn dữ liệu bảng trung gian posttag
          },
        ],
      });

      if (!post)
        return res.status(404).json({ message: "Không tìm thấy bài viết" });

      return res.json({ data: post });
    } catch (error) {
      console.error("GET POST BY SLUG ERROR:", error);
      return res.status(500).json({ message: "Lỗi server khi lấy bài viết" });
    }
  }

  // [UPDATE] Cập nhật bài viết
  static async update(req, res) {
    try {
      const { slug } = req.params;
      const file = req.file;
  
      const post = await Post.findOne({ where: { slug } });
      if (!post) {
        return res.status(404).json({ message: "Không tìm thấy bài viết" });
      }
  
      const tags = JSON.parse(req.body.tags || "[]");
      const {
        title,
        content,
        categoryId,
        authorId,
        orderIndex,
        publishAt,
        isFeature,
        thumbnail, // truyền lại thumbnail cũ nếu không đổi
      } = req.body;
  
      // Xử lý publishAt và status
      let finalPublishAt = null;
let finalStatus = 1; // mặc định đăng ngay

// Nếu publishAt là 'null' hoặc undefined thì bỏ qua
if (publishAt && publishAt !== 'null') {
  const pubDate = new Date(publishAt);
  if (!isNaN(pubDate)) { // kiểm tra date hợp lệ
    finalPublishAt = pubDate;
    finalStatus = pubDate > new Date() ? 2 : 1; // quá khứ → đăng ngay, tương lai → scheduled
  }
}

  
      await post.update({
        title,
        content,
        categoryId,
        authorId,
        status: finalStatus,
        orderIndex,
        publishAt: finalPublishAt,
        isFeature,
        thumbnail: file ? file.path : thumbnail || post.thumbnail,
      });
  
      // Xử lý tags
      const tagInstances = [];
      for (const tagItem of tags) {
        const tagName = typeof tagItem === "string" ? tagItem : tagItem?.name;
        const tagSlug =
          typeof tagItem === "string"
            ? tagItem.toLowerCase().trim().replace(/\s+/g, "-")
            : tagItem?.slug || tagName?.toLowerCase().trim().replace(/\s+/g, "-");
  
        if (!tagName || !tagSlug) continue;
  
        let tag = await Tags.findOne({ where: { slug: tagSlug } });
        if (!tag) tag = await Tags.create({ name: tagName, slug: tagSlug });
  
        tagInstances.push(tag);
      }
  
      await post.setTags(tagInstances);
  
      return res.json({ message: "Cập nhật thành công", data: post });
    } catch (error) {
      console.error("UPDATE POST ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi cập nhật bài viết" });
    }
  }
  
  
  
  

  // [SOFT DELETE] Xoá mềm bài viết theo slug
  static async softDelete(req, res) {
    try {
      console.log("=== Đã vào BE softDelete ===");
      console.log("Body:", req.body);

      const { slugs } = req.body;

      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.status(400).json({ message: "Danh sách slug không hợp lệ" });
      }

      const posts = await Post.findAll({ where: { slug: slugs } });
      const existingSlugs = posts.map((p) => p.slug);
      const notFound = slugs.filter((slug) => !existingSlugs.includes(slug));

      await Post.destroy({
        where: { slug: existingSlugs },
      });

      return res.json({
        message: `Đã đưa ${existingSlugs.length} bài viết vào thùng rác`,
        trashed: existingSlugs,
        notFound,
      });
    } catch (error) {
      console.error("SOFT DELETE ERROR:", error);
      return res
        .status(500)
        .json({ message: "Lỗi server khi xóa mềm bài viết" });
    }
  }

  // [RESTORE] Khôi phục bài viết theo id
  static async restore(req, res) {
    try {
      const { slugs } = req.body;
      console.log(req.body);
      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res
          .status(400)
          .json({ message: "Vui lòng truyền danh sách slug hợp lệ" });
      }

      // Lấy tất cả bài viết, bao gồm cả đã bị xóa mềm
      const posts = await Post.findAll({
        where: { slug: slugs },
        paranoid: false,
      });

      const existingSlugs = posts.map((p) => p.slug);
      const notFound = slugs.filter((slug) => !existingSlugs.includes(slug));

      const toRestore = posts
        .filter((p) => p.deletedAt !== null)
        .map((p) => p.slug);
      const notTrashed = posts
        .filter((p) => p.deletedAt === null)
        .map((p) => p.slug);

      await Post.restore({
        where: { slug: toRestore },
      });

      return res.json({
        message: `Đã khôi phục ${toRestore.length} bài viết`,
        restored: toRestore,
        notTrashed,
        notFound,
      });
    } catch (err) {
      console.error("Lỗi khi khôi phục:", err);
      return res.status(500).json({ message: "Lỗi server" });
    }
  }

  // [FORCE DELETE] Xoá vĩnh viễn bài viết theo slug
  static async forceDelete(req, res) {
    try {
      console.log("===> BODY:", req.body);
      const { slugs } = req.body;

      if (!Array.isArray(slugs) || slugs.length === 0) {
        return res.status(400).json({ message: "Danh sách slug không hợp lệ" });
      }

      const deletedCount = await Post.destroy({
        where: { slug: slugs },
        force: true,
      });

      return res.json({
        message: `Đã xóa vĩnh viễn ${deletedCount} bài viết`,
        deleted: slugs,
      });
    } catch (error) {
      console.error("FORCE DELETE ERROR:", error);
      return res.status(500).json({ message: "Lỗi server khi xóa vĩnh viễn" });
    }
  }
  
}

module.exports = PostController;
