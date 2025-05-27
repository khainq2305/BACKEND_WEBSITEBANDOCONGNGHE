const { Op } = require('sequelize');
const { Product, SearchHistory } = require('../../models');

class SearchController {
  // API: GET /api/search?q=ao-thun
  static async searchProducts(req, res) {
    try {
      const { q } = req.query;
      const sessionId = req.sessionID || req.headers['x-session-id'] || 'unknown';

      if (!q || !q.trim()) {
        return res.status(400).json({ message: 'Từ khóa tìm kiếm không hợp lệ.' });
      }

      // Ghi log lịch sử tìm kiếm
      await SearchHistory.create({
        keyword: q.trim(),
        sessionId
      });

      // Tìm sản phẩm theo tên
      const products = await Product.findAll({
        where: {
          name: {
            [Op.like]: `%${q.trim()}%`
          },
          isActive: true
        },
        limit: 20,
        order: [['createdAt', 'DESC']]
      });

      res.status(200).json({ products });
    } catch (err) {
      console.error('Lỗi khi tìm kiếm sản phẩm:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }

  // API: GET /api/search/history
  static async getSearchHistory(req, res) {
    try {
      const sessionId = req.sessionID || req.headers['x-session-id'] || 'unknown';

      const history = await SearchHistory.findAll({
        where: { sessionId },
        order: [['createdAt', 'DESC']],
        limit: 10
      });

      res.status(200).json({ history });
    } catch (err) {
      console.error('Lỗi khi lấy lịch sử tìm kiếm:', err);
      res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

module.exports = SearchController;
