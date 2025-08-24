// src/validators/validateSystemSetting.js

const validateSystemSetting = (req, res, next) => {
  const { hotline, hotlineSales, hotlineWarranty, hotlineFeedback } = req.body;
  const errors = [];

  const phoneFields = [
    { field: "hotline", label: "Hotline chính", value: hotline },
    { field: "hotlineSales", label: "Hotline mua nhanh", value: hotlineSales },
    { field: "hotlineWarranty", label: "Hotline bảo hành", value: hotlineWarranty },
    { field: "hotlineFeedback", label: "Hotline phản ánh", value: hotlineFeedback },
  ];

  phoneFields.forEach(({ field, label, value }) => {
    if (value && value.trim() !== "") {
      // không được chứa chữ hoặc ký tự đặc biệt
      if (!/^[0-9]+$/.test(value)) {
        errors.push({ field, message: `${label} chỉ được nhập số, không được chứa chữ hoặc ký tự đặc biệt!` });
      }

      // độ dài tối đa
      if (value.length > 10) {
        errors.push({ field, message: `${label} không được vượt quá 10 số!` });
      }

      // độ dài tối thiểu
      if (value.length < 9) {
        errors.push({ field, message: `${label} phải có ít nhất 9 số!` });
      }
    }
  });

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateSystemSetting };
