const { Placement } = require('../../models');

class PlacementController {
  static async create(req, res) {
    try {
      const placement = await Placement.create(req.body);
      res.status(201).json({ message: 'Tạo khối thành công', data: placement });
    } catch (err) {
      console.error('CREATE PLACEMENT ERROR:', err);
      res.status(500).json({ message: 'Lỗi tạo khối hiển thị' });
    }
  }

  static async getAll(req, res) {
    try {
      const placements = await Placement.findAll();
      res.json({ data: placements });
    } catch (err) {
      console.error('GET PLACEMENTS ERROR:', err);
      res.status(500).json({ message: 'Lỗi lấy danh sách khối' });
    }
  }

  static async update(req, res) {
    try {
      const placement = await Placement.findByPk(req.params.id);
      if (!placement) return res.status(404).json({ message: 'Không tìm thấy khối' });
      await placement.update(req.body);
      res.json({ message: 'Cập nhật thành công', data: placement });
    } catch (err) {
      console.error('UPDATE PLACEMENT ERROR:', err);
      res.status(500).json({ message: 'Lỗi cập nhật khối' });
    }
  }

  static async delete(req, res) {
    try {
      const placement = await Placement.findByPk(req.params.id);
      if (!placement) return res.status(404).json({ message: 'Không tìm thấy khối' });
      await placement.destroy();
      res.json({ message: 'Xoá khối thành công' });
    } catch (err) {
      console.error('DELETE PLACEMENT ERROR:', err);
      res.status(500).json({ message: 'Lỗi xoá khối' });
    }
  }
}

module.exports = PlacementController;
