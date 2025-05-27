const { BannerPlacementAssignment, Banner, Placement } = require('../../models');

class BannerAssignmentController {
  static async assign(req, res) {
    try {
      const assignment = await BannerPlacementAssignment.create(req.body);
      res.status(201).json({ message: 'Gán banner thành công', data: assignment });
    } catch (err) {
      console.error('ASSIGN BANNER ERROR:', err);
      res.status(500).json({ message: 'Lỗi gán banner vào khối' });
    }
  }

  static async getByPlacement(req, res) {
    try {
      const { placementId } = req.params;
      const list = await BannerPlacementAssignment.findAll({
        where: { placementId },
        include: [{ model: Banner, as: 'banner' }],
        order: [['displayOrder', 'ASC']]
      });
      res.json({ data: list });
    } catch (err) {
      console.error('GET BY PLACEMENT ERROR:', err);
      res.status(500).json({ message: 'Lỗi lấy banner theo khối' });
    }
  }

  static async delete(req, res) {
    try {
      const assignment = await BannerPlacementAssignment.findByPk(req.params.id);
      if (!assignment) return res.status(404).json({ message: 'Không tìm thấy assignment' });
      await assignment.destroy();
      res.json({ message: 'Xoá banner khỏi khối thành công' });
    } catch (err) {
      console.error('DELETE ASSIGNMENT ERROR:', err);
      res.status(500).json({ message: 'Lỗi xoá gán banner' });
    }
  }
}

module.exports = BannerAssignmentController;
