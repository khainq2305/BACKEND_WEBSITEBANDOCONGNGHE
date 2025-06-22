const { Subject } = require('../../models');

class SubjectController {
    /**
     * Lấy danh sách tất cả các subject để hiển thị ra các thẻ quản lý quyền
     */
    async findAll(req, res, next) {
        try {
            // Giả sử model Subject có các trường 'name' và 'description'
            const subjects = await Subject.findAll({
                attributes: ['key', ['description', 'desc'], 'label'],
                order: [['key', 'ASC']]
            });

            return res.status(200).json({
                success: true,
                message: 'Lấy danh sách subject thành công.',
                data: subjects
            });
        } catch (error) {
            console.error('[SubjectController.findAll] Error: ', error);
            next(error);
        }
    }
}

module.exports = new SubjectController();
