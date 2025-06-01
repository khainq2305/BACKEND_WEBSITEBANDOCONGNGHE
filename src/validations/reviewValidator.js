exports.validateReply = (req, res, next) => {
    const { replyContent } = req.body;

    if (!replyContent || typeof replyContent !== 'string' || replyContent.trim().length === 0) {
        return res.status(400).json({
            success: false,
            message: 'Nội dung phản hồi không được để trống.'
        });
    }

    if (replyContent.length > 1000) {
        return res.status(400).json({
            success: false,
            message: 'Nội dung phản hồi quá dài (tối đa 1000 ký tự).'
        });
    }

    next();
};
