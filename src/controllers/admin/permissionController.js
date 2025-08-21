
const permissionService = require('../../services/admin/permission.service');


class PermissionController {
    async getAllSubject(req, res, next) {
        try {
            const subjects = await permissionService.getAllSubjects();
            res.status(200).json({
                success: true,
                message: 'Lấy danh sách subject thành công.',
                data: subjects
            });
        } catch (err) {
            next(err);
        }
    }

    async getActionsForSubject(req, res, next) {
        try {
            const { subject } = req.params;
            const actions = await permissionService.getActionsForSubject(subject);
            res.status(200).json({
                success: true,
                message: `Lấy danh sách action cho subject '${subject}' thành công.`,
                data: actions
            });
        } catch (err) {
            next(err);
        }
    }

    async getMatrix(req, res, next) {
        try {
            const { subject } = req.params;
            const matrix = await permissionService.getMatrix(subject);
            res.status(200).json({
                success: true,
                message: `Lấy ma trận quyền cho subject '${subject}' thành công.`,
                data: matrix
            });
        } catch (err) {
            console.error('Lỗi khi lấy ma trận quyền:', err.message);
            next(err);
        }
    }

    async updatePermission(req, res, next) {
        const updates = req.body;
        // Nếu là mảng, xử lý bulk
        if (Array.isArray(updates)) {
            const results = await permissionService.updatePermission(updates);
            return res.status(200).json({ success: true, results });
        }
        // Nếu là object đơn lẻ, xử lý như cũ
        const { roleId, subject, action, hasPermission } = updates;
        console.log("🔑 roleId:", roleId);
        console.log("📌 subject:", subject);
        console.log("⚡ action:", action);
        console.log("✅ hasPermission:", hasPermission);
        if (!roleId || !subject || !action || typeof hasPermission !== 'boolean') {
            return res.status(400).json({
                success: false,
                message: 'Thiếu dữ liệu đầu vào: roleId, subject, action, hasPermission là bắt buộc.'
            });
        }
        const message = await permissionService.updatePermission({
            roleId,
            subjectKey: subject,
            actionKey: action,
            hasPermission
        });
        res.status(200).json({ success: true, message });
    }


    async getPermissionsByRole(req, res, next) {
        try {
            const { roleId } = req.params;
            const { grouped, total } = await permissionService.getPermissionsByRole(roleId);
            res.status(200).json({
                success: true,
                message: `Lấy danh sách quyền cho roleId ${roleId} thành công.`,
                data: grouped,
                totalActions: total
            });
        } catch (err) {
            next(err);
        }
    }
}

module.exports = new PermissionController();
