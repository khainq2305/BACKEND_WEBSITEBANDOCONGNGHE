const { Post, Category, User } = require('../../models'); // ✅ GIỜ mới đúng 100%
class CategoryController {
  // [CREATE] Thêm bài viết
  static async create(req, res) {
    try {
      const { title, content, thumbnail, categoryId, authorId, status = 'draft', orderIndex = 0 } = req.body;

      if (!title || !content || !categoryId || !authorId) {
        return res.status(400).json({ message: 'Thiếu trường bắt buộc' });
      }

      const newPost = await Post.create({ title, content, thumbnail, categoryId, authorId, status, orderIndex });

      return res.status(201).json({ message: 'Tạo bài viết thành công', data: newPost });
    } catch (error) {
      console.error('CREATE POST ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi tạo bài viết' });
    }
  }

  // [READ] Lấy danh sách bài viết
  static async getAll(req, res) {

    try {

      const posts = await Post.findAll({
  include: [
    { model: Category, attributes: ['id', 'name'] },
    { model: User, attributes: ['id', 'fullName'] }
  ],
  paranoid: false // ✅ Bắt buộc để thấy bài bị xóa mềm
});


      return res.json({ data: posts });
    } catch (error) {
      console.error('GET POSTS ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy danh sách bài viết' });
    }
  }
}