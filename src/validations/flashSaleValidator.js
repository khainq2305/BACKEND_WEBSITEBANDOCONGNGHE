const { FlashSale, Sku } = require("../models");
const slugify = require("slugify");
const validator = require("validator");
const path = require("path");
const { Op } = require("sequelize");

const validateFlashSale = async (req, res, next) => {
  const errors = [];
  const isEdit = !!req.params?.slug;
  let currentId = null;

  const { title, startTime, endTime, items, categories } = req.body;

  if (isEdit) {
    const flashSale = await FlashSale.findOne({
      where: { slug: req.params.slug },
    });
    if (!flashSale) {
      return res
        .status(404)
        .json({ message: "Không tìm thấy Flash Sale để sửa" });
    }
    currentId = flashSale.id;
  }

  if (!title || typeof title !== "string" || !title.trim()) {
    errors.push({ field: "title", message: "Tiêu đề là bắt buộc" });
  }

  const isValidStart = startTime && validator.isISO8601(startTime);
  const isValidEnd = endTime && validator.isISO8601(endTime);

  if (!isValidStart) {
    errors.push({
      field: "startTime",
      message: "Thời gian bắt đầu không hợp lệ",
    });
  }
  if (!isValidEnd) {
    errors.push({
      field: "endTime",
      message: "Thời gian kết thúc không hợp lệ",
    });
  }

  if (isValidStart && isValidEnd && new Date(startTime) >= new Date(endTime)) {
    errors.push({
      field: "endTime",
      message: "Thời gian kết thúc phải sau thời gian bắt đầu",
    });
  }

  if (!isEdit && (!req.file || !req.file.path)) {
    errors.push({ field: "bannerImage", message: "Banner là bắt buộc" });
  }

  if (req.file && req.file.originalname) {
    const ext = path.extname(req.file.originalname).toLowerCase();
    if (![".jpg", ".jpeg", ".png", ".webp"].includes(ext)) {
      errors.push({
        field: "bannerImage",
        message: "Chỉ chấp nhận ảnh .jpg, .jpeg, .png",
      });
    }
  }

  let parsedItems = [];
  try {
    parsedItems = items ? JSON.parse(items) : [];
  } catch (err) {
    errors.push({ field: "items", message: "Danh sách sản phẩm không hợp lệ" });
  }

  if (parsedItems.length) {
    const skuIds = parsedItems.map((i) => i.skuId);
    const skusInDB = await Sku.findAll({
      where: { id: { [Op.in]: skuIds } },
      attributes: ["id", "originalPrice"],
    });

    const priceMap = skusInDB.reduce((acc, s) => {
      acc[s.id] = Number(s.originalPrice);
      return acc;
    }, {});

    parsedItems.forEach((it, idx) => {
      const ori = priceMap[it.skuId];
      if (ori !== undefined && Number(it.salePrice) >= ori) {
        errors.push({
          field: `items[${idx}].salePrice`,
          message: "Giá sale phải nhỏ hơn giá gốc",
        });
      }
    });
  }

  let parsedCategories = [];
  try {
    parsedCategories = categories ? JSON.parse(categories) : [];
  } catch (err) {
    errors.push({
      field: "categories",
      message: "Danh sách danh mục không hợp lệ",
    });
  }

  if (parsedItems.length === 0 && parsedCategories.length === 0) {
    errors.push({
      field: "items",
      message:
        "Vui lòng chọn ít nhất 1 sản phẩm hoặc 1 danh mục để tạo khuyến mãi.",
    });
  } else {
    parsedItems.forEach((item, index) => {
      
      if (item.salePrice == null || item.salePrice === "") {
        errors.push({
          field: `items[${index}].salePrice`,
          message: "Giá sale là bắt buộc",
        });
      } else if (Number(item.salePrice) < 0) {
        errors.push({
          field: `items[${index}].salePrice`,
          message: "Giá sale không được âm",
        });
      }
      if (item.quantity == null || item.quantity === "") {
        errors.push({
          field: `items[${index}].quantity`,
          message: "Số lượng là bắt buộc",
        });
      } else if (
        Number(item.quantity) <= 0 ||
        !Number.isInteger(Number(item.quantity))
      ) {
        errors.push({
          field: `items[${index}].quantity`,
          message: "Số lượng phải là số nguyên dương",
        });
      }
    });

    parsedCategories.forEach((cat, index) => {
      const discountType = cat.discountType || "percent";
      const discountValueStr = cat.discountValue;

      if (
        discountValueStr == null ||
        discountValueStr === "" ||
        isNaN(Number(discountValueStr))
      ) {
        errors.push({
          field: `categories[${index}].discountValue`,
          message: "Giá trị giảm là bắt buộc",
        });
      } else {
        const discountValue = Number(discountValueStr);
        if (discountType === "percent") {
          if (discountValue <= 0 || discountValue > 100) {
            errors.push({
              field: `categories[${index}].discountValue`,
              message: "Giá trị % phải từ 1 đến 100",
            });
          }
        } else {
          if (discountValue <= 0) {
            errors.push({
              field: `categories[${index}].discountValue`,
              message: "Giá trị giảm phải là số dương",
            });
          }
        }
      }

      const maxPerUserStr = cat.maxPerUser;

      if (
        maxPerUserStr !== undefined &&
        maxPerUserStr !== null &&
        `${maxPerUserStr}`.trim() !== ""
      ) {
        const value = Number(maxPerUserStr);
        if (isNaN(value) || !Number.isInteger(value) || value <= 0) {
          errors.push({
            field: `categories[${index}].maxPerUser`,
            message: "Giới hạn/người phải là số nguyên dương",
          });
        }
      }
    });
  }

  if (title && typeof title === "string" && title.trim()) {
    const slug = slugify(title.trim(), { lower: true, strict: true });
    const whereClause = {
      slug,
      ...(isEdit && currentId ? { id: { [Op.ne]: currentId } } : {}),
    };
    const existing = await FlashSale.findOne({ where: whereClause });
    if (existing) {
      errors.push({ field: "title", message: "Tiêu đề đã tồn tại" });
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateFlashSale };
