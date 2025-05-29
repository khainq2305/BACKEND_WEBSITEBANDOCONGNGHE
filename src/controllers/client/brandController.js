const { Brand } = require('../../models');

class BrandController {

  static async getAll(req, res) {
    try {
      const brands = await Brand.findAll({
        where: {
          isActive: true,
          deletedAt: null
        },
        order: [['orderIndex', 'ASC']],
        attributes: ['id', 'name', 'slug', 'logoUrl'] // thêm slug/logo nếu cần
      });

      return res.status(200).json(brands);
    } catch (error) {
      console.error('❌ Lỗi khi lấy danh sách thương hiệu:', error);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

module.exports = BrandController;
