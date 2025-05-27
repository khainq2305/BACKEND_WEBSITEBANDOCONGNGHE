const db = require('../../models');
const { ProductQuestion, ProductQuestionReply, Product, User, sequelize } = db;
const { Op } = require('sequelize');

const ProductQuestionController = {
    async getAll(req, res) {
        try {
            const { page = 1, limit = 10, search = '', status } = req.query;
            const offset = (page - 1) * parseInt(limit);

            const whereClause = {};
            if (search) {
                whereClause[Op.or] = [
                    { '$user.fullName$': { [Op.like]: `%${search}%` } },
                    { '$user.email$': { [Op.like]: `%${search}%` } }
                ];
            }

            if (status === 'answered') {
                whereClause.isAnswered = true;
            } else if (status === 'unanswered') {
                whereClause.isAnswered = false;
            }

            const { count, rows } = await ProductQuestion.findAndCountAll({
                include: [
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'name']
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'fullName', 'email']
                    },
                    {
                        model: ProductQuestionReply,
                        as: 'replies',
                        separate: true,
                        order: [['createdAt', 'ASC']],
                        attributes: ['id', 'content', 'isAdminReply', 'createdAt']
                    }
                ],
                where: whereClause,
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset,
                subQuery: false // BẮT BUỘC nếu dùng $user.xxx$
            });

            const data = rows.map((q) => ({
                id: q.id,
                content: q.content,
                createdAt: q.createdAt?.toISOString().replace('T', ' ').slice(0, 19),
                isAnswered: q.isAnswered,
                productId: q.product?.id,
                productName: q.product?.name,
                userId: q.user?.id,
                fullName: q.user?.fullName,
                email: q.user?.email,
                replies: q.replies.map(r => ({
                    id: r.id,
                    content: r.content,
                    isAdminReply: r.isAdminReply,
                    createdAt: r.createdAt?.toISOString().replace('T', ' ').slice(0, 19)
                }))
            }));

            return res.json({
                success: true,
                data,
                total: count,
                currentPage: parseInt(page),
                totalPages: Math.ceil(count / limit)
            });
        } catch (err) {
            console.error('❌ Lỗi khi lấy danh sách câu hỏi:', err);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
        }
    },


    // [POST] /admin/product-questions/reply
    async reply(req, res) {
        const t = await sequelize.transaction();
        try {
            const { questionId, content } = req.body;

            if (!questionId || !content?.trim()) {
                return res.status(400).json({ success: false, message: 'Thiếu ID hoặc nội dung phản hồi' });
            }

            const reply = await ProductQuestionReply.create({
                questionId,
                content,
                isAdminReply: true
            }, { transaction: t });

            await ProductQuestion.update(
                { isAnswered: true },
                { where: { id: questionId }, transaction: t }
            );

            await t.commit();

            return res.json({
                success: true,
                message: 'Phản hồi thành công',
                data: {
                    id: reply.id,
                    questionId: reply.questionId,
                    content: reply.content,
                    isAdminReply: reply.isAdminReply,
                    createdAt: reply.createdAt?.toISOString().replace('T', ' ').slice(0, 19),
                    fullName: 'Admin'
                }
            });
        } catch (err) {
            await t.rollback();
            console.error('❌ Lỗi khi phản hồi:', err);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
        }
    }
};

module.exports = ProductQuestionController;
