const { ProductQuestion, ProductAnswer, User } = require('../../models');
const COOLDOWN_SECONDS = 30;

class ProductQuestionController {
    static async create(req, res) {
        try {
            const { productId, content } = req.body;
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ message: 'Bạn cần đăng nhập để gửi câu hỏi.' });
            }

            if (!productId || !content?.trim()) {
                return res.status(400).json({ message: 'Thiếu thông tin hoặc nội dung không hợp lệ.' });
            }

            const last = await ProductQuestion.findOne({
                where: { userId },
                order: [['createdAt', 'DESC']],
            });

            if (last) {
                const now = new Date();
                const diff = Math.floor((now - new Date(last.createdAt)) / 1000);
                if (diff < COOLDOWN_SECONDS) {
                    return res.status(429).json({
                        message: `Vui lòng đợi ${COOLDOWN_SECONDS - diff} giây trước khi gửi tiếp.`,
                        remaining: COOLDOWN_SECONDS - diff,
                    });
                }
            }

            const created = await ProductQuestion.create({
                productId,
                userId,
                content: content.trim(),
                isHidden: false,
            });

            return res.status(201).json({ message: 'Gửi câu hỏi thành công!', data: created });
        } catch (error) {
            console.error('Lỗi tạo câu hỏi:', error);
            return res.status(500).json({ message: 'Lỗi tạo câu hỏi.', error: error.message });
        }
    }

    static async reply(req, res) {
        try {
            const { questionId, content, parentId = null } = req.body;
            const userId = req.user?.id;

            if (!userId) {
                return res.status(401).json({ message: 'Bạn cần đăng nhập để gửi phản hồi.' });
            }

            if (!questionId || !content?.trim()) {
                return res.status(400).json({ message: 'Thiếu thông tin phản hồi.' });
            }

            const last = await ProductAnswer.findOne({
                where: { userId },
                order: [['createdAt', 'DESC']],
            });

            if (last) {
                const now = new Date();
                const diff = Math.floor((now - new Date(last.createdAt)) / 1000);
                if (diff < COOLDOWN_SECONDS) {
                    return res.status(429).json({
                        message: `Vui lòng đợi ${COOLDOWN_SECONDS - diff} giây trước khi gửi tiếp.`,
                        remaining: COOLDOWN_SECONDS - diff,
                    });
                }
            }

            const reply = await ProductAnswer.create({
                questionId,
                userId,
                content: content.trim(),
                parentId,
                isOfficial: false,
                isHidden: false,
            });

            await ProductQuestion.update({ isAnswered: true }, { where: { id: questionId } });

            return res.status(201).json({ message: 'Gửi phản hồi thành công!', data: reply });
        } catch (error) {
            console.error('Lỗi gửi phản hồi:', error);
            return res.status(500).json({ message: 'Lỗi gửi phản hồi.', error: error.message });
        }
    }

    static async getByProductId(req, res) {
        try {
            const { productId } = req.params;

            const questions = await ProductQuestion.findAll({
                where: { productId, isHidden: false },
                include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'avatarUrl'] }],
                order: [['createdAt', 'DESC']],
            });

            const allAnswers = await ProductAnswer.findAll({
                where: { isHidden: false },
                include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'avatarUrl'] }], 
            });

            const questionMap = {};
            questions.forEach((q) => {
                questionMap[q.id] = { ...q.toJSON(), answers: [] };
            });

            const replyByParent = {};
            const answerMap = {};
            allAnswers.forEach((a) => {
                const ans = a.toJSON();
                ans.replies = [];
                answerMap[ans.id] = ans;

                const parentId = ans.parentId || 0;
                if (!replyByParent[parentId]) replyByParent[parentId] = [];
                replyByParent[parentId].push(ans);
            });

            const buildTree = (parentId) => {
                const children = (replyByParent[parentId] || []).sort(
                    (a, b) => new Date(a.createdAt) - new Date(b.createdAt)
                );
                return children.map((child) => ({
                    ...child,
                    replies: buildTree(child.id),
                }));
            };

            for (const q of questions) {
                const qid = q.id;
                const rootAnswers = (replyByParent[0] || [])
                    .filter((a) => a.questionId === qid)
                    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

                questionMap[qid].answers = rootAnswers.map((root) => ({
                    ...root,
                    replies: buildTree(root.id),
                }));
            }

            return res.json(Object.values(questionMap));
        } catch (error) {
            console.error("Lỗi lấy câu hỏi:", error);
            return res.status(500).json({ message: "Lỗi lấy câu hỏi.", error: error.message });
        }
    }
}

module.exports = ProductQuestionController;