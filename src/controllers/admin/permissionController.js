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
            next(err);
        }
    }

    async updatePermission(req, res, next) {
    try {
        const { roleId, subject, action, hasPermission } = req.body;

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
    } catch (err) {
        console.log('Lỗi cập nhật quyền:', err.message);
        res.status(500).json({ success: false, message: err.message });
    }
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
