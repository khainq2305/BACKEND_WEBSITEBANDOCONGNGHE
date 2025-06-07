// controllers/admin/productQuestionController.js

const { Op } = require('sequelize');
const { ProductQuestion, ProductQuestionReply, Product, User, sequelize } = require('../../models');

const ProductQuestionController = {
    // Lấy danh sách câu hỏi kèm replies, phân trang, search, filter
    async getAll(req, res) {
        try {
            const { page = 1, limit = 10, search = '', status = 'all' } = req.query;
            const offset = (page - 1) * limit;

            let whereClause = {};
            const include = [
                {
                    model: Product,
                    as: 'product',
                    attributes: ['id', 'name'],
                    required: false
                },
                {
                    model: User,
                    as: 'user',
                    attributes: ['id', 'fullName', 'email'],
                    required: false
                },
                {
                    model: ProductQuestionReply,
                    as: 'replies',
                    separate: true,
                    order: [['createdAt', 'ASC']],
                    include: [
                        {
                            model: ProductQuestionReply,
                            as: 'replyTo',
                            attributes: ['id', 'content', 'isAdminReply', 'createdAt']
                        },
                        {
                            model: User,
                            as: 'user', // include thêm thông tin user (người reply)
                            attributes: ['id', 'fullName', 'email']
                        }
                    ],
                    attributes: ['id', 'content', 'isAdminReply', 'createdAt', 'replyToId', 'userId']
                }
            ];

            if (search) {
                whereClause[Op.or] = [
                    { '$user.fullName$': { [Op.like]: `%${search}%` } },
                    { '$user.email$': { [Op.like]: `%${search}%` } },
                    { '$product.name$': { [Op.like]: `%${search}%` } }
                ];
                include[0].required = true;
                include[1].required = true;
            }

            if (status === 'answered') whereClause.isAnswered = true;
            if (status === 'unanswered') whereClause.isAnswered = false;

            const { rows, count } = await ProductQuestion.findAndCountAll({
                where: whereClause,
                include,
                order: [['createdAt', 'DESC']],
                limit: parseInt(limit),
                offset: parseInt(offset),
                subQuery: false
            });

            const data = rows.map(q => ({
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
                    createdAt: r.createdAt?.toISOString().replace('T', ' ').slice(0, 19),
                    userId: r.userId,
                    fullName: r.user?.fullName,
                    email: r.user?.email,
                    replyTo: r.replyTo
                        ? {
                            id: r.replyTo.id,
                            content: r.replyTo.content,
                            isAdminReply: r.replyTo.isAdminReply,
                            createdAt: r.replyTo.createdAt?.toISOString().replace('T', ' ').slice(0, 19)
                        }
                        : null
                }))
            }));

            const [totalAll, totalAnswered, totalUnanswered] = await Promise.all([
                ProductQuestion.count(),
                ProductQuestion.count({ where: { isAnswered: true } }),
                ProductQuestion.count({ where: { isAnswered: false } })
            ]);

            return res.json({
                success: true,
                data,
                total: count,
                currentPage: parseInt(page),
                totalPages: Math.ceil(count / limit),
                counts: {
                    all: totalAll,
                    answered: totalAnswered,
                    unanswered: totalUnanswered
                }
            });
        } catch (error) {
            console.error('LỖI getAll product-questions:', error);
            return res.status(500).json({ message: 'Lỗi server', error: error.message });
        }
    },

    // Admin phản hồi câu hỏi (có thể reply vào question gốc hoặc nested reply)
    async reply(req, res) {
        const t = await sequelize.transaction();
        try {
            const { questionId, content, replyToId, userId } = req.body;

            // 1. Validate input
            if (!userId || !questionId || !content?.trim()) {
                await t.rollback();
                return res.status(400).json({ success: false, message: 'Thiếu dữ liệu đầu vào (userId, questionId, content là bắt buộc)' });
            }
            const trimmedContent = content.trim();

            // 2. Tìm question + user
            const [productQuestion, user] = await Promise.all([
                ProductQuestion.findByPk(questionId, { transaction: t }),
                User.findByPk(userId, { transaction: t })
            ]);

            if (!productQuestion) {
                await t.rollback();
                return res.status(404).json({ success: false, message: 'ID câu hỏi không hợp lệ hoặc không tồn tại.' });
            }

            if (!user) {
                await t.rollback();
                return res.status(400).json({ success: false, message: 'ID người dùng không tồn tại.' });
            }

            // 3. Check quyền: chỉ admin (roleId=1) mới được phản hồi
            if (user.roleId && user.roleId !== 1) {
                await t.rollback();
                return res.status(403).json({ success: false, message: 'Bạn không có quyền phản hồi.' });
            }

            // 4. Nếu có replyToId, kiểm tra tồn tại và cùng question
            if (replyToId) {
                const targetReply = await ProductQuestionReply.findByPk(replyToId, { transaction: t });
                if (!targetReply) {
                    await t.rollback();
                    return res.status(404).json({ success: false, message: 'ID phản hồi gốc không hợp lệ hoặc không tồn tại.' });
                }
                if (targetReply.questionId !== questionId) {
                    await t.rollback();
                    return res.status(400).json({ success: false, message: 'Phản hồi gốc không thuộc cùng câu hỏi.' });
                }
            }

            // 5. Chống spam: không cho gửi hai reply giống hệt trong 5s
            const recentReply = await ProductQuestionReply.findOne({
                where: { questionId, isAdminReply: true },
                order: [['createdAt', 'DESC']],
                transaction: t
            });
            if (recentReply) {
                const diffSeconds = (Date.now() - new Date(recentReply.createdAt).getTime()) / 1000;
                if (diffSeconds < 5) {
                    if (trimmedContent === recentReply.content) {
                        await t.rollback();
                        return res.status(429).json({ success: false, message: 'Bạn vừa gửi phản hồi giống hệt trong vòng 5 giây. Vui lòng chờ và chỉnh sửa nội dung.' });
                    }
                    await t.rollback();
                    return res.status(429).json({ success: false, message: 'Bạn đang phản hồi quá nhanh. Vui lòng chờ vài giây.' });
                }
            }

            // 6. Tạo ProductQuestionReply mới
            const reply = await ProductQuestionReply.create({
                questionId,
                userId,
                content: trimmedContent,
                isAdminReply: true,
                replyToId: replyToId || null
            }, { transaction: t });

            // 7. Nếu câu hỏi chưa đánh dấu isAnswered, cập nhật
            if (!productQuestion.isAnswered) {
                await ProductQuestion.update(
                    { isAnswered: true },
                    { where: { id: questionId }, transaction: t }
                );
            }

            await t.commit();

            // 8. Trả về reply mới
            return res.json({
                success: true,
                message: 'Phản hồi thành công',
                data: {
                    id: reply.id,
                    questionId: reply.questionId,
                    content: reply.content,
                    replyToId: reply.replyToId,
                    isAdminReply: reply.isAdminReply,
                    createdAt: reply.createdAt, // frontend sẽ format
                    userId: reply.userId,
                    email: user.email,
                    fullName: user.fullName || 'Admin'
                }
            });
        } catch (err) {
            await t.rollback();
            console.error('Lỗi khi phản hồi:', err);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
        }
    },

    // Ẩn câu hỏi hoặc ẩn phản hồi
    async hide(req, res) {
        try {
            const { id } = req.params;

            // Nếu tìm thấy question có ID này
            const question = await ProductQuestion.findByPk(id);
            if (question) {
                await question.update({ isHidden: true });
                return res.json({ success: true, message: 'Đã ẩn câu hỏi.' });
            }

            // Nếu không, tìm thử reply có ID này
            const reply = await ProductQuestionReply.findByPk(id);
            if (reply) {
                await reply.update({ isHidden: true });
                return res.json({ success: true, message: 'Đã ẩn phản hồi.' });
            }

            return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi hoặc phản hồi.' });
        } catch (err) {
            console.error('Lỗi khi ẩn:', err);
            return res.status(500).json({ success: false, message: 'Lỗi server khi ẩn.' });
        }
    },

    // Lấy chi tiết 1 câu hỏi (Admin view), include replies và user info
    async getById(req, res) {
        try {
            const { id } = req.params;

            const question = await ProductQuestion.findOne({
                where: { id },
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
                        include: [
                            {
                                model: ProductQuestionReply,
                                as: 'replyTo',
                                attributes: ['id', 'content', 'isAdminReply', 'createdAt']
                            },
                            {
                                model: User,
                                as: 'user',
                                attributes: ['id', 'fullName', 'email']
                            }
                        ],
                        attributes: ['id', 'content', 'isAdminReply', 'createdAt', 'replyToId', 'userId']
                    }
                ]
            });

            if (!question) {
                return res.status(404).json({ success: false, message: 'Không tìm thấy câu hỏi' });
            }

            return res.json({
                success: true,
                data: {
                    id: question.id,
                    content: question.content,
                    createdAt: question.createdAt?.toISOString(),
                    isAnswered: question.isAnswered,
                    productId: question.product?.id,
                    productName: question.product?.name,
                    userId: question.user?.id,
                    fullName: question.user?.fullName,
                    email: question.user?.email,
                    replies: question.replies.map(r => ({
                        id: r.id,
                        content: r.content,
                        isAdminReply: r.isAdminReply,
                        createdAt: r.createdAt?.toISOString(),
                        userId: r.userId,
                        fullName: r.user?.fullName,
                        email: r.user?.email,
                        replyTo: r.replyTo
                            ? {
                                id: r.replyTo.id,
                                content: r.replyTo.content,
                                isAdminReply: r.replyTo.isAdminReply,
                                createdAt: r.replyTo.createdAt?.toISOString()
                            }
                            : null
                    }))
                }
            });
        } catch (err) {
            console.error('Lỗi getById:', err);
            return res.status(500).json({ success: false, message: 'Lỗi server khi lấy chi tiết câu hỏi.' });
        }
    }
};

module.exports = ProductQuestionController;
