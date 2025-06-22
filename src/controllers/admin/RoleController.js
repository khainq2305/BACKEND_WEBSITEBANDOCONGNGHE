const roleService = require("../../services/admin/role.service");

class RoleController {
  async findAll(req, res, next) {
    try {
      const roles = await roleService.findAll();
      res.status(200).json({
        success: true,
        message: "Lấy danh sách vai trò thành công.",
        data: roles,
      });
    } catch (error) {
      console.error("[RoleController.findAll] Error: ", error);
      next(error);
    }
  }

  async create(req, res, next) {
    try {
      const role = await roleService.create(req.body);
      res.status(201).json({
        success: true,
        message: "Tạo vai trò thành công.",
        data: role,
      });
    } catch (err) {
      if (err.message === "ROLE_EXISTS") {
        return res.status(400).json({ success: false, message: "Vai trò đã tồn tại" });
      }
      next(err);
    }
  }

  async getById(req, res, next) {
    try {
      const role = await roleService.getById(req.params.id);
      if (!role) {
        return res.status(404).json({ success: false, message: 'Không tìm thấy vai trò.' });
      }
      res.status(200).json({
        success: true,
        message: 'Lấy chi tiết vai trò thành công.',
        data: role,
      });
    } catch (err) {
      next(err);
    }
  }

  async update(req, res, next) {
    try {
      const role = await roleService.update(req.params.id, req.body);
      if (!role) {
        return res.status(404).json({ success: false, message: "Không tìm thấy vai trò." });
      }
      res.status(200).json({ success: true, message: "Cập nhật thành công.", data: role });
    } catch (err) {
      next(err);
    }
  }

  async remove(req, res, next) {
    try {
      const { force } = req.body;
      const result = await roleService.remove(req.params.id, force);

      if (result.notFound) {
        return res.status(404).json({ success: false, message: "Vai trò không tồn tại." });
      }

      if (result.isAdmin) {
        return res.status(403).json({ success: false, message: "Không thể xoá vai trò Admin." });
      }

      return res.status(200).json({ success: true, message: "Đã xoá vai trò thành công." });

    } catch (err) {
      if (err.name === 'SequelizeForeignKeyConstraintError') {
        return res.status(409).json({
          success: false,
          code: 'FK_CONSTRAINT',
          message: 'Vai trò đang được sử dụng. Bạn có muốn xoá và xử lý dữ liệu liên quan không?'
        });
      }
      console.error('Lỗi xoá role:', err);
      res.status(500).json({
        success: false,
        message: 'Lỗi khi xoá vai trò.',
        error: err.message
      });
    }
  }
}

module.exports = new RoleController();
