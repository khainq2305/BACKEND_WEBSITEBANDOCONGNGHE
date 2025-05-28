const { ProductQuestionReply, ProductQuestion } = require('../../models');

const ProductQuestionController = {
    async replyToAdmin(req, res) {
        try {
            const { questionId, content } = req.body;
            const userId = req.user.id;

            if (!questionId || !content?.trim()) {
                return res.status(400).json({ success: false, message: 'Thiếu thông tin phản hồi' });
            }

            // Kiểm tra quyền sở hữu câu hỏi
            const question = await ProductQuestion.findOne({ where: { id: questionId, userId } });
            if (!question) {
                return res.status(403).json({ success: false, message: 'Không có quyền trả lời câu hỏi này' });
            }

            // Chống spam: kiểm tra tin gần nhất
            const lastReply = await ProductQuestionReply.findOne({
                where: { questionId, isAdminReply: false },
                order: [['createdAt', 'DESC']]
            });

            if (lastReply) {
                const diff = Date.now() - new Date(lastReply.createdAt).getTime();
                const minInterval = 15 * 1000; // 15 giây
                if (diff < minInterval) {
                    return res.status(429).json({
                        success: false,
                        message: `Bạn đang gửi quá nhanh. Vui lòng đợi ${(15 - Math.floor(diff / 1000))} giây nữa.`
                    });
                }
            }

            // Tạo phản hồi
            const reply = await ProductQuestionReply.create({
                questionId,
                content,
                isAdminReply: false
            });

            return res.json({
                success: true,
                message: 'Đã gửi phản hồi',
                data: {
                    id: reply.id,
                    content: reply.content,
                    createdAt: reply.createdAt,
                    fullname: req.user.fullname || 'Bạn',
                    isAdminReply: false
                }
            });
        } catch (error) {
            console.error('❌ Lỗi gửi phản hồi user:', error);
            return res.status(500).json({ success: false, message: 'Lỗi server' });
        }
    }
};

module.exports = ProductQuestionController;
