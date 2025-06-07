const validator = require('validator');

exports.validateReply = (req, res, next) => {
    const { questionId, content, userId } = req.body;

    // Kiểm tra questionId là số nguyên dương
    if (!questionId || isNaN(questionId) || parseInt(questionId) <= 0) {
        return res.status(400).json({
            success: false,
            message: 'ID câu hỏi không hợp lệ'
        });
    }

    // Kiểm tra nội dung phản hồi
    if (!content || typeof content !== 'string' || validator.isEmpty(content.trim())) {
        return res.status(400).json({
            success: false,
            message: 'Nội dung phản hồi không được để trống'
        });
    }

    // (Tuỳ chọn) Kiểm tra userId nếu cần
    if ('userId' in req.body && (isNaN(userId) || parseInt(userId) <= 0)) {
        return res.status(400).json({
            success: false,
            message: 'Người dùng không hợp lệ'
        });
    }

    next();
};
