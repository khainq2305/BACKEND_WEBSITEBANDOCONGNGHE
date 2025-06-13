const { Placement } = require('../../models');

class PlacementController {


  static async getAll(req, res) {
    try {
      const placements = await Placement.findAll();
      res.json({ data: placements });
    } catch (err) {
      console.error('GET PLACEMENTS ERROR:', err);
      res.status(500).json({ message: 'Lỗi lấy danh sách khối' });
    }
  }
 static async toggleVisibility(req, res) {
    try {
      const { id } = req.params;
      const placement = await Placement.findByPk(id);
      if (!placement) {
        return res.status(404).json({ message: 'Không tìm thấy khối hiển thị' });
      }
      placement.isActive = !placement.isActive;
      await placement.save();

      return res.json({
        message: placement.isActive ? 'Đã bật khối hiển thị' : 'Đã ẩn khối',
        data: { id: placement.id, isActive: placement.isActive }
      });
    } catch (err) {
      console.error('TOGGLE PLACEMENT VISIBILITY ERROR:', err);
      return res.status(500).json({ message: 'Lỗi cập nhật trạng thái hiển thị' });
    }
  }
}

module.exports = PlacementController;
