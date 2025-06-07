const { Op } = require('sequelize');
const { Post, Category, User } = require('../../models');

class PostController {
ư
  static async create(req, res) {
    
  try {
  
    const {
      title,
      content,
      thumbnail,
      categoryId = 1,
      authorId = 39,
      status = 'draft',
      orderIndex = 0,
      publishAt
    } = req.body;

    if (!title || !content || !categoryId || !authorId) {
      return res.status(400).json({ message: 'Thiếu trường bắt buộc' });
    }

    const newPost = await Post.create({
      title,
      content,
      thumbnail,
      categoryId,
      authorId,
      orderIndex,
      publishAt: publishAt ? new Date(publishAt) : null,
      status: publishAt ? 'scheduled' : status
    });

    return res.status(201).json({ message: 'Tạo bài viết thành công', data: newPost });
  } catch (error) {
    console.error('CREATE POST ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi tạo bài viết' });
  }
}




  static async getAll(req, res) {

    try {

      const posts = await Post.findAll({
  include: [
    { model: Category, attributes: ['id', 'name'] },
    { model: User, attributes: ['id', 'fullName'] }
  ],
  paranoid: false 
});


      return res.json({ data: posts });
    } catch (error) {
      console.error('GET POSTS ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy danh sách bài viết' });
    }
  }

  
  static async getById(req, res) {
    try {
      const { id } = req.params;
      const post = await Post.findByPk(id);
      if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });
      return res.json({ data: post });
    } catch (error) {
      console.error('GET POST BY ID ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi lấy bài viết' });
    }
  }

  // [UPDATE] Cập nhật bài viết
  static async update(req, res) {
    try {
      const { id } = req.params;
      const post = await Post.findByPk(id);
      if (!post) return res.status(404).json({ message: 'Không tìm thấy bài viết' });

      const { title, content, thumbnail, categoryId, authorId, status, orderIndex } = req.body;
      await post.update({ title, content, thumbnail, categoryId, authorId, status, orderIndex });

      return res.json({ message: 'Cập nhật thành công', data: post });
    } catch (error) {
      console.error('UPDATE POST ERROR:', error);
      return res.status(500).json({ message: 'Lỗi server khi cập nhật bài viết' });
    }
  }
  // [SOFT DELETE] Xoá mềm bài viết
static async softDelete(req, res) {
  try {
    console.log('=== Đã vào BE softDelete ===');
console.log('Body:', req.body);

    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }

    const posts = await Post.findAll({
      where: { id: ids }
    });

    const existingIds = posts.map(p => p.id);
    const notFound = ids.filter(id => !existingIds.includes(id));

    // Xoá mềm các bài viết tìm được
    await Post.destroy({
      where: { id: existingIds }
    });

    return res.json({
      message: `Đã đưa ${existingIds.length} bài viết vào thùng rác`,
      trashed: existingIds,
      notFound
    });
  } catch (error) {
    console.error('SOFT DELETE ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi xóa mềm bài viết' });
  }
}


  
  static async forceDelete(req, res) {
  try {
  
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Danh sách ID không hợp lệ' });
    }

    const deletedCount = await Post.destroy({
      where: { id: ids },
      force: true 
    });

    return res.json({
      message: `Đã xóa vĩnh viễn ${deletedCount} bài viết`,
      deleted: ids
    });
  } catch (error) {
    console.error('FORCE DELETE ERROR:', error);
    return res.status(500).json({ message: 'Lỗi server khi xóa vĩnh viễn' });
  }
}

  static async restore(req, res) {
  try {
    const { ids } = req.body;

    if (!Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ message: 'Vui lòng truyền danh sách ID hợp lệ' });
    }

    
    const posts = await Post.findAll({
      where: { id: ids },
      paranoid: false
    });

    const existingIds = posts.map(p => p.id);
    const notFound = ids.filter(id => !existingIds.includes(id));

 
    const toRestore = posts.filter(p => p.deletedAt !== null).map(p => p.id);
    const notTrashed = posts.filter(p => p.deletedAt === null).map(p => p.id);


    await Post.restore({
      where: { id: toRestore }
    });

    return res.json({
      message: `Đã khôi phục ${toRestore.length} bài viết`,
      restored: toRestore,
      notTrashed,
      notFound
    });
  } catch (err) {
    console.error('Lỗi khi khôi phục:', err);
    return res.status(500).json({ message: 'Lỗi server' });
  }
}

}

module.exports = PostController;
