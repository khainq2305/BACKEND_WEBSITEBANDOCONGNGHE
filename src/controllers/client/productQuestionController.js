// controllers/client/productQuestionController.js

const db = require('../../models');
const { ProductQuestion, ProductQuestionReply, sequelize } = db;

const ProductQuestionClientController = {
    // 1) User tạo câu hỏi mới (POST /product-questions)
    createQuestion: async (req, res) => {
        const t = await sequelize.transaction();
        try {
            // Lấy userId từ request body (thay vì req.user)
            const { userId, productId, content } = req.body;
            const trimmedContent = (content || '').trim();

            if (!userId || !productId || !trimmedContent) {
                return res
                    .status(400)
                    .json({ success: false, message: 'Thiếu thông tin bắt buộc (userId, productId hoặc content).' });
            }

            // Tránh duplicate exact content
            const sameContent = await ProductQuestion.findOne({
                where: { userId, productId, content: trimmedContent },
            });
            if (sameContent) {
                return res
                    .status(400)
                    .json({ success: false, message: 'Bạn đã đặt câu hỏi với nội dung này rồi.' });
            }

            // Kiểm tra 5s giữa 2 lần gửi
            const latest = await ProductQuestion.findOne({
                where: { userId, productId },
                order: [['createdAt', 'DESC']],
            });
            if (
                latest &&
                Date.now() - new Date(latest.createdAt).getTime() < 5000
            ) {
                return res.status(429).json({
                    success: false,
                    message: 'Bạn vừa đặt câu hỏi. Vui lòng đợi 5 giây trước khi gửi tiếp.',
                });
            }

            // Giới hạn user không gửi > 10 câu hỏi liên tiếp trước khi có admin reply
            const allQuestions = await ProductQuestion.findAll({
                where: { userId, productId },
                include: [
                    {
                        model: ProductQuestionReply,
                        as: 'replies',
                        attributes: ['id', 'isAdminReply'],
                    },
                ],
                order: [['createdAt', 'DESC']],
                limit: 15,
            });
            let consecutiveUserQuestions = 0;
            for (const q of allQuestions) {
                const hasAdminReply = q.replies.some((r) => r.isAdminReply);
                if (!hasAdminReply) {
                    consecutiveUserQuestions++;
                } else {
                    break;
                }
            }
            if (consecutiveUserQuestions >= 10) {
                return res.status(429).json({
                    success: false,
                    message:
                        'Bạn đã gửi quá nhiều câu hỏi chưa được phản hồi. Vui lòng chờ phản hồi từ admin.',
                });
            }

            // Tạo ProductQuestion mới
            const question = await ProductQuestion.create(
                {
                    userId,
                    productId,
                    content: trimmedContent,
                    isHidden: false,
                },
                { transaction: t }
            );
            await t.commit();

            return res.status(201).json({
                success: true,
                message: 'Câu hỏi đã được gửi thành công',
                data: question,
            });
        } catch (err) {
            await t.rollback();
            console.error('Lỗi tạo câu hỏi:', err);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
        }
    },

    // 2) User reply vào question hoặc reply cũ (POST /product-questions/reply)
    replyFromUser: async (req, res) => {
        const t = await sequelize.transaction();
        try {
            // Lấy userId từ request body (thay vì req.user)
            const { userId, questionId, content, replyToId } = req.body;
            const trimmedContent = (content || '').trim();

            if (!userId || !questionId || !trimmedContent) {
                return res
                    .status(400)
                    .json({ success: false, message: 'Thiếu thông tin phản hồi (userId, questionId hoặc content).' });
            }

            // Lấy thông tin user kèm role để xác định admin hay user
            const user = await db.User.findByPk(userId, {
                attributes: ['id', 'fullName', 'email'],
                include: [
                    {
                        model: db.Role,
                        as: 'role',
                        attributes: ['name'],
                    },
                ],
            });
            if (!user) {
                return res
                    .status(404)
                    .json({ success: false, message: 'Người dùng không tồn tại' });
            }

            // Chống spam 5s giữa các phản hồi của cùng user cho cùng question
            const lastReply = await ProductQuestionReply.findOne({
                where: { questionId, userId },
                order: [['createdAt', 'DESC']],
            });
            if (
                lastReply &&
                Date.now() - new Date(lastReply.createdAt).getTime() < 5000
            ) {
                return res.status(429).json({
                    success: false,
                    message: 'Vui lòng chờ 5 giây trước khi gửi phản hồi tiếp theo.',
                });
            }

            // Chống duplicate nội dung
            const existed = await ProductQuestionReply.findOne({
                where: { questionId, content: trimmedContent, userId },
            });
            if (existed) {
                return res
                    .status(400)
                    .json({ success: false, message: 'Bạn đã gửi phản hồi giống hệt trước đó.' });
            }

            // Kiểm tra replyToId (nếu có)
            if (replyToId) {
                const targetReply = await ProductQuestionReply.findByPk(replyToId);
                if (!targetReply || targetReply.questionId !== questionId) {
                    return res
                        .status(400)
                        .json({ success: false, message: 'Phản hồi gốc không hợp lệ hoặc không cùng câu hỏi.' });
                }
            }

            // Xác định adminReply hay userReply dựa vào role
            const roleName = user.role?.name?.toLowerCase() || '';
            const isAdminReply = roleName === 'admin' || roleName === 'cskh';

            // Tạo ProductQuestionReply mới
            const reply = await ProductQuestionReply.create(
                {
                    questionId,
                    content: trimmedContent,
                    replyToId: replyToId || null,
                    isAdminReply,
                    userId,
                    isHidden: false,
                },
                { transaction: t }
            );
            await t.commit();

            return res.status(201).json({
                success: true,
                message: 'Phản hồi đã được gửi thành công',
                data: {
                    id: reply.id,
                    questionId: reply.questionId,
                    content: reply.content,
                    replyToId: reply.replyToId,
                    isAdminReply,
                    fullName: user.fullName,
                    email: user.email,
                    createdAt: reply.createdAt.toISOString().replace('T', ' ').slice(0, 19),
                },
            });
        } catch (err) {
            await t.rollback();
            console.error('Lỗi phản hồi user:', err);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
        }
    },

    // 3) Lấy danh sách câu hỏi & replies public theo productId  (GET /product-questions/:productId)
    getByProductId: async (req, res) => {
        try {
            const { productId } = req.params;

            const questions = await ProductQuestion.findAll({
                where: { productId, isHidden: false },
                include: [
                    {
                        model: db.User,
                        as: 'user',
                        attributes: ['id', 'fullName'],
                    },
                    {
                        model: ProductQuestionReply,
                        as: 'replies',
                        where: { isHidden: false },
                        required: false,
                        include: [
                            {
                                model: db.ProductQuestionReply,
                                as: 'replyTo',
                                attributes: ['id', 'content'],
                            },
                            {
                                model: db.User,
                                as: 'user',
                                attributes: ['id', 'fullName'],
                            },
                        ],
                    },
                ],
                order: [['createdAt', 'ASC']],
            });

            return res.json({ success: true, data: questions });
        } catch (err) {
            console.error('Lỗi lấy danh sách hỏi đáp:', err);
            return res
                .status(500)
                .json({ success: false, message: 'Lỗi server khi lấy dữ liệu hỏi đáp.' });
        }
    },
};

module.exports = ProductQuestionClientController;
