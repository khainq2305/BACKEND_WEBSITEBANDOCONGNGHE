const { Banner } = require('../../models');

class BannerController {
  static async create(req, res) {
    try {
      const banner = await Banner.create(req.body);
      res.status(201).json({ message: 'Tạo banner thành công', data: banner });
    } catch (error) {
      console.error('CREATE BANNER ERROR:', error);
      res.status(500).json({ message: 'Lỗi tạo banner' });
    }
  }

  static async getAll(req, res) {
    try {
      const banners = await Banner.findAll();
      res.json({ data: banners });
    } catch (error) {
      console.error('GET BANNERS ERROR:', error);
      res.status(500).json({ message: 'Lỗi lấy danh sách banner' });
    }
  }

  static async getById(req, res) {
    try {
      const banner = await Banner.findByPk(req.params.id);
      if (!banner) return res.status(404).json({ message: 'Không tìm thấy banner' });
      res.json({ data: banner });
    } catch (error) {
      console.error('GET BANNER BY ID ERROR:', error);
      res.status(500).json({ message: 'Lỗi lấy banner' });
    }
  }

  static async update(req, res) {
    try {
      const banner = await Banner.findByPk(req.params.id);
      if (!banner) return res.status(404).json({ message: 'Không tìm thấy banner' });
      await banner.update(req.body);
      res.json({ message: 'Cập nhật banner thành công', data: banner });
    } catch (error) {
      console.error('UPDATE BANNER ERROR:', error);
      res.status(500).json({ message: 'Lỗi cập nhật banner' });
    }
  }

  static async delete(req, res) {
    try {
      const banner = await Banner.findByPk(req.params.id);
      if (!banner) return res.status(404).json({ message: 'Không tìm thấy banner' });
      await banner.destroy();
      res.json({ message: 'Xoá banner thành công' });
    } catch (error) {
      console.error('DELETE BANNER ERROR:', error);
      res.status(500).json({ message: 'Lỗi xoá banner' });
    }
  }
}

module.exports = BannerController;
