const { Province, District, Ward } = require('../models');

const validateUserAddress = async (req, res, next) => {
  const {
    fullName,
    phone,
    streetAddress,
    provinceId,
    districtId,
      wardId,      // ✅ đổi từ wardCode → wardId
    label,
  } = req.body;

  const errors = [];

  // Tên người nhận
  if (!fullName || fullName.trim() === '') {
    errors.push({ field: 'fullName', message: 'Họ tên không được để trống!' });
  }

  // Số điện thoại
  if (!phone || !/^(0\d{9})$/.test(phone)) {
    errors.push({ field: 'phone', message: 'Số điện thoại không hợp lệ!' });
  }

  // Địa chỉ cụ thể
  if (!streetAddress || streetAddress.trim() === '') {
    errors.push({ field: 'streetAddress', message: 'Vui lòng nhập địa chỉ cụ thể!' });
  }

  // Kiểm tra ID tỉnh
  const province = await Province.findByPk(provinceId);
  if (!province) {
    errors.push({ field: 'provinceId', message: 'Tỉnh/Thành không hợp lệ!' });
  }

  // Kiểm tra ID huyện
console.log('[DEBUG] districtId:', districtId);  // xem có undefined/null không
const district = await District.findByPk(districtId);

  if (!district) {
    errors.push({ field: 'districtId', message: 'Quận/Huyện không hợp lệ!' });
  }

  // Kiểm tra mã xã/phường
  const ward = await Ward.findByPk(wardId);
 if (!ward) {
   errors.push({ field: 'wardId', message: 'Phường/Xã không hợp lệ!' });
 }

 

  // Label (tuỳ chọn nhưng vẫn giới hạn nếu có)
  const allowedLabels = ['Nhà Riêng', 'Văn Phòng', 'Nhà Người Yêu', 'Bố Mẹ', 'Khác'];
  if (label && !allowedLabels.includes(label)) {
    errors.push({ field: 'label', message: 'Loại địa chỉ không hợp lệ!' });
  }

  if (errors.length > 0) {
    return res.status(400).json({ errors });
  }

  next();
};

module.exports = { validateUserAddress };
