const { Post, Category, User } = require('../../models/index');

class PostController {
 
  static async getFeaturePost(req, res) {
    try {
      const posts = await Post.findAll({
        where: { isFeature: true },
        limit: 5,
        order: [['createdAt', 'DESC']]
      });

      return res.json({ data: posts }); // ✅ OK
    } catch (error) {
      console.error('Lỗi khi lấy bài viết nổi bật:', error);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }

  static async getByCategorySlug(req, res) {
  try {
    const { slug } = req.params;

    const category = await Category.findOne({ where: { slug } });
    if (!category) {
      return res.status(404).json({ message: 'Không tìm thấy danh mục' });
    }

    const posts = await Post.findAll({
  where: { categoryId: category.id },
  include: [
    { model: Category, as: 'category', attributes: ['id', 'name'] },
    { model: User,  attributes: ['id', 'fullName'] }
  ],
  order: [['createdAt', 'DESC']]
});


    return res.json({ data: posts });
  } catch (error) {
    console.error('❌ Lỗi khi lấy bài viết theo danh mục:', error);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}



}

module.exports = PostController