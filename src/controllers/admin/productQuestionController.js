const { ProductQuestion, ProductAnswer, Product, User, Sequelize } = require('../../models');
const { Op } = Sequelize;

const adminProductQuestionController = {
    async getAll(req, res) {
        try {
            const { page = 1, pageSize = 10, filter, search } = req.query;
            const limit = parseInt(pageSize, 10);
            const offset = (parseInt(page, 10) - 1) * limit;

            const questionWhere = {};
            const userWhere = {};
            let isSearchActive = false;

            if (filter === 'unanswered' || filter === 'Chờ trả lời') {
                questionWhere.isAnswered = false;
                questionWhere.isHidden = false;
            } else if (filter === 'answered' || filter === 'Đã trả lời') {
                questionWhere.isAnswered = true;
                questionWhere.isHidden = false;
            } else if (filter === 'hidden' || filter === 'Đã ẩn') {
                questionWhere.isHidden = true;
            } else {
                questionWhere.isHidden = { [Op.in]: [true, false] };
            }

            if (search) {
                isSearchActive = true;
                questionWhere[Op.or] = [
                    { content: { [Op.like]: `%${search}%` } },
                    Sequelize.literal(`\`user\`.\`fullName\` LIKE '%${search}%'`),
                    Sequelize.literal(`\`user\`.\`email\` LIKE '%${search}%'`)
                ];
            }


            const { count, rows: questions } = await ProductQuestion.findAndCountAll({
                where: questionWhere,
                include: [
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
                        ...(isSearchActive ? { where: userWhere, required: true } : { required: false })
                    }
                ],
                order: [['createdAt', 'DESC']],
                limit,
                offset
            });

            // Tính toán số lượng cho tất cả các tab
            const [allCount, unansweredCount, answeredCount, hiddenCount] = await Promise.all([
                ProductQuestion.count({
                    where: { isHidden: { [Op.in]: [true, false] } }
                }),
                ProductQuestion.count({
                    where: { isAnswered: false, isHidden: false }
                }),
                ProductQuestion.count({
                    where: { isAnswered: true, isHidden: false }
                }),
                ProductQuestion.count({
                    where: { isHidden: true }
                })
            ]);

            const totalPages = Math.ceil(count / limit);

            return res.json({
                data: questions,
                pagination: {
                    totalItems: count,
                    totalPages,
                    currentPage: parseInt(page, 10),
                    pageSize: limit
                },
                counts: {
                    all: allCount,
                    unanswered: unansweredCount,
                    answered: answeredCount,
                    hidden: hiddenCount
                }
            });
        } catch (error) {
            console.error('Lỗi getAll câu hỏi:', error);
            return res.status(500).json({ message: 'Lỗi khi lấy danh sách câu hỏi', error: error.message });
        }
    },

    async getById(req, res) {
        try {
            const { id } = req.params;

            const question = await ProductQuestion.findByPk(id, {
                include: [
                    { model: Product, as: 'product', attributes: ['id', 'name'] },
                    { model: User, as: 'user', attributes: ['id', 'fullName', 'email'] }
                ]
            });

            if (!question) return res.status(404).json({ message: 'Không tìm thấy câu hỏi.' });

            const answers = await ProductAnswer.findAll({
                where: { questionId: id },
                include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'email'] }],
                order: [['createdAt', 'ASC']]
            });

            const answerMap = {};
            answers.forEach(a => {
                const ans = a.toJSON();
                ans.replies = [];
                answerMap[ans.id] = ans;
            });

            const rootAnswers = [];
            for (const answer of Object.values(answerMap)) {
                if (answer.parentId === null) {
                    rootAnswers.push(answer);
                } else {
                    const parent = answerMap[answer.parentId];
                    if (parent) {
                        parent.replies.push(answer);
                    }
                }
            }

            function sortRepliesRecursively(arr) {
                arr.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                arr.forEach(item => {
                    if (item.replies && item.replies.length > 0) {
                        sortRepliesRecursively(item.replies);
                    }
                });
            }
            sortRepliesRecursively(rootAnswers);

            const result = question.toJSON();
            result.answers = rootAnswers;

            res.json(result);
        } catch (error) {
            console.error('Lỗi getById:', error);
            res.status(500).json({ message: 'Lỗi khi lấy chi tiết câu hỏi', error: error.message });
        }
    },

    async reply(req, res) {
        try {
            const { questionId } = req.params;
            const { content, parentId = null } = req.body;
            const userId = req.user?.id;

            if (!content || !questionId) {
                return res.status(400).json({ message: 'Thiếu nội dung hoặc ID.' });
            }

            const answer = await ProductAnswer.create({
                questionId,
                userId,
                content,
                isOfficial: true,
                parentId,
                isHidden: false
            });

            await ProductQuestion.update({ isAnswered: true }, { where: { id: questionId } });

            const fullAnswer = await ProductAnswer.findByPk(answer.id, {
                include: [{ model: User, as: 'user', attributes: ['id', 'fullName', 'email'] }]
            });

            req.io?.emit('new-answer', fullAnswer);

            res.status(201).json(fullAnswer);
        } catch (err) {
            console.error('Lỗi phản hồi:', err);
            res.status(500).json({ message: 'Lỗi phản hồi.', error: err.message });
        }
    },

    async toggleVisibility(req, res) {
        try {
            const { id } = req.params;
            const answer = await ProductAnswer.findByPk(id);
            if (!answer) return res.status(404).json({ message: 'Không tìm thấy trả lời.' });

            answer.isHidden = !answer.isHidden;
            await answer.save();

            res.json({ message: 'Cập nhật trạng thái phản hồi thành công.', isHidden: answer.isHidden });
        } catch (err) {
            console.error('Lỗi cập nhật trạng thái phản hồi:', err);
            res.status(500).json({ message: 'Lỗi cập nhật trạng thái phản hồi.', error: err.message });
        }
    },

    async toggleQuestionVisibility(req, res) {
        try {
            const { questionId } = req.params;
            const question = await ProductQuestion.findByPk(questionId);

            if (!question) {
                return res.status(404).json({ message: 'Không tìm thấy câu hỏi.' });
            }

            question.isHidden = !question.isHidden;
            await question.save();

            return res.json({ message: 'Cập nhật trạng thái câu hỏi thành công!', isHidden: question.isHidden });
        } catch (error) {
            console.error('Lỗi khi cập nhật trạng thái câu hỏi:', error);
            return res.status(500).json({ message: 'Lỗi server khi cập nhật trạng thái câu hỏi.', error: error.message });
        }
    }
};

module.exports = adminProductQuestionController;