const validator = require("validator");
const MAX_IMAGES = 5;
const MAX_IMAGE_SIZE_MB = 10;
const bannedWords = [
  "vãi lồn",
  "địt mẹ",
  "cặc",
  "lồn",
  "đéo",
  "đụ",
  "shit",
  "fuck",
  "bitch",
  "khải"
];

const validateReview = (req, res, next) => {
  const { rating, content, skuId } = req.body;
  const errors = [];
  if (req.files) {
    if (req.files.length > MAX_IMAGES) {
      errors.push({
        field: "media",
        message: `Chỉ được tải lên tối đa ${MAX_IMAGES} ảnh.`,
      });
    }

    for (const file of req.files) {
      if (!file.mimetype.startsWith("image")) {
        errors.push({
          field: "media",
          message: `"${file.originalname}" không phải là hình ảnh.`,
        });
        break;
      }

      if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
        errors.push({
          field: "media",
          message: `"${file.originalname}" vượt quá dung lượng tối đa ${MAX_IMAGE_SIZE_MB}MB.`,
        });
        break;
      }
    }
  }
  if (!skuId || skuId.toString().trim() === "") {
    errors.push({ field: "skuId", message: "SKU không được để trống!" });
  } else if (!validator.isNumeric(skuId.toString())) {
    errors.push({ field: "skuId", message: "SKU không hợp lệ!" });
  }

  const parsedRating = Number(rating);
  if (isNaN(parsedRating)) {
    errors.push({ field: "rating", message: "Số sao đánh giá không hợp lệ!" });
  } else if (parsedRating < 1 || parsedRating > 5) {
    errors.push({ field: "rating", message: "Số sao phải từ 1 đến 5!" });
  }

  if (!content || content.trim() === "") {
    errors.push({
      field: "content",
      message: "Nội dung nhận xét không được để trống!",
    });
  } else if (content.trim().length < 15) {
    errors.push({
      field: "content",
      message: "Nội dung phải có ít nhất 15 ký tự!",
    });
  } else {
    const lowerContent = content.toLowerCase();
    for (const word of bannedWords) {
      if (lowerContent.includes(word)) {
        errors.push({
          field: "content",
          message: "Nội dung chứa ngôn từ không phù hợp!",
        });
        break;
      }
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = {
  validateReview,
};
