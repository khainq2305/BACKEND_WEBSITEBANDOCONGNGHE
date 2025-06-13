const { ProductQuestion, ProductAnswer, Product, User } = require('../../models');

const adminProductQuestionController = {
    async getAll(req, res) {
        try {
            const questions = await ProductQuestion.findAll({
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
                    }
                ],
                order: [['createdAt', 'DESC']]
            });

            const questionIds = questions.map(q => q.id);

            const answers = await ProductAnswer.findAll({
                where: {
                    questionId: questionIds,
                    parentId: null
                },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'fullName', 'email']
                    }
                ],
                order: [['createdAt', 'ASC']]
            });

            const answersGrouped = {};
            for (const ans of answers) {
                const qid = ans.questionId;
                if (!answersGrouped[qid]) answersGrouped[qid] = [];
                answersGrouped[qid].push(ans.toJSON());
            }

            const result = questions.map(q => {
                const qData = q.toJSON();
                qData.answers = answersGrouped[q.id] || [];
                return qData;
            });

            return res.json(result);
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
                    {
                        model: Product,
                        as: 'product',
                        attributes: ['id', 'name']
                    },
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'fullName', 'email']
                    }
                ]
            });

            if (!question) return res.status(404).json({ message: 'Không tìm thấy câu hỏi.' });

            const answers = await ProductAnswer.findAll({
                where: { questionId: id },
                include: [
                    {
                        model: User,
                        as: 'user',
                        attributes: ['id', 'fullName', 'email']
                    }
                ],
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

            if (!content || !questionId) return res.status(400).json({ message: 'Thiếu nội dung hoặc ID.' });

            const answer = await ProductAnswer.create({
                questionId,
                userId,
                content,
                isOfficial: true,
                parentId,
                isHidden: false,
            });

            await ProductQuestion.update({ isAnswered: true }, { where: { id: questionId } });

            res.status(201).json(answer);
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