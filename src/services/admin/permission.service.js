const { Role, Action, Subject, RolePermission } = require('../../models');
const { Op } = require('sequelize');

const SUBJECT_COMMENT = 'Comment';
const SUBJECT_DASHBOARD = 'Dashboard';
const SUBJECT_USER = 'User';
class PermissionService {
    async getAllSubjects() {
        return Subject.findAll({
            attributes: ['key', ['description', 'desc'], 'label'],
            order: [['key', 'ASC']]
        });
    }

    async getActionsForSubject(subjectKey) {
        let allowedActions;
        switch (subjectKey) {
            case SUBJECT_COMMENT:
                allowedActions = ['read', 'reply'];
                break;
            case SUBJECT_DASHBOARD:
                allowedActions = ['read', 'export'];
                break;
            case SUBJECT_USER:
                allowedActions = ['read', 'resetPassword', 'lockAccount', 'unlockAccount'];
                break;
            default:
                return Action.findAll({
                    where: {
                        key: { [Op.notIn]: ['reply', 'export', 'resetPassword', 'lockAccount', 'unlockAccount'] }
                    },
                    attributes: ['id', ['key', 'action'], 'description']
                });
        }
        const actions = await Action.findAll({
            where: {
                key: {
                    [Op.in]: allowedActions
                }
            },
            attributes: ['id', ['key', 'action'], 'description']
        });
        return actions.map(a => ({
            id: a.id,
            action: a.action,
            description: a.description,
            label: a.label
        }));
    }

    async getMatrix(subjectKey) {
        const subject = await Subject.findOne({ where: { key: subjectKey } });
        if (!subject) throw new Error('Subject không tồn tại');

        const [roles, actions, permissions] = await Promise.all([
            Role.findAll(),
            Action.findAll(),
            RolePermission.findAll({ where: { subjectId: subject.id } })
        ]);

        const matrix = {};
        roles.forEach(role => {
            matrix[role.id] = {};
            actions.forEach(action => {
                const hasPermission = permissions.some(p =>
                    p.roleId === role.id && p.actionId === action.id
                );
                matrix[role.id][action.key] = hasPermission;
            });
        });

        return matrix;
    }

    async updatePermission({ roleId, subjectKey, actionKey, hasPermission }) {
      
        const subject = await Subject.findOne({ where: { key: subjectKey } });
        const action = await Action.findOne({ where: { key: actionKey } });
        if (!subject || !action) {
            throw new Error('Subject hoặc Action không hợp lệ.');
        }

        if (hasPermission) {
            await RolePermission.findOrCreate({
                where: { roleId, subjectId: subject.id, actionId: action.id }
            });
            return 'Thêm quyền thành công.';
        } else {
            await RolePermission.destroy({
                where: { roleId, subjectId: subject.id, actionId: action.id }
            });
            return 'Xóa quyền thành công.';
        }
    }

    async getPermissionsByRole(roleId) {
        const rawPermissions = await RolePermission.unscoped().findAll({
            where: { roleId },
            attributes: ['subjectId', 'actionId'],
            raw: true
        });

        if (rawPermissions.length === 0) return { grouped: [], total: 0 };

        const subjectIds = [...new Set(rawPermissions.map(p => p.subjectId))];
        const actionIds = [...new Set(rawPermissions.map(p => p.actionId))];

        const [subjects, actions] = await Promise.all([
            Subject.findAll({ where: { id: subjectIds }, attributes: ['id', 'key', 'label'], raw: true }),
            Action.findAll({ where: { id: actionIds }, attributes: ['id', 'key', 'label', 'description'], raw: true })
        ]);

        const subjectMap = new Map(subjects.map(s => [s.id, { key: s.key, label: s.label }]));
        const actionMap = new Map(actions.map(a => [a.id, { key: a.key, label: a.label, desc: a.description }]));

        const grouped = rawPermissions.reduce((acc, perm) => {
            const subjectData = subjectMap.get(perm.subjectId);
            const actionData = actionMap.get(perm.actionId);

            if (subjectData && actionData) {
                const subjectKey = subjectData.key;
                if (!acc[subjectKey]) {
                    acc[subjectKey] = {
                        subject: subjectKey,
                        label: subjectData.label,
                        actions: []
                    };
                }
                if (!acc[subjectKey].actions.some(a => a.key === actionData.key)) {
                    acc[subjectKey].actions.push({
                        key: actionData.key,
                        label: actionData.label,
                        desc: actionData.desc
                    });
                }
            }
            return acc;
        }, {});

        const result = Object.values(grouped).sort((a, b) => a.subject.localeCompare(b.subject));
        return { grouped: result, total: rawPermissions.length };
    }

}

module.exports = new PermissionService();
