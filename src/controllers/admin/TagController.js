const { Tags } = require('../../models/index')
class TagController {
  static async getAll(req, res) {
    try {
      const tags = await Tags.findAll({
        attributes: ['id', 'name', 'slug'],
        order: [['createdAt', 'DESC']],
      });

      return res.status(200).json({ success: true, data: tags });
    } catch (error) {
      console.error('Lỗi khi lấy danh sách tag:', error);
      return res.status(500).json({ success: false, message: 'Lỗi server' });
    }
  }
}
module.exports = TagController