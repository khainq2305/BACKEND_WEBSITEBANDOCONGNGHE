/**
 * Định dạng số tiền thành chuỗi tiền tệ Việt Nam Đồng (VND).
 * Ví dụ: 1234567.89 sẽ thành "1.234.567₫"
 *
 * @param {number|string} amount Số tiền cần định dạng.
 * @returns {string|null} Chuỗi tiền tệ đã định dạng hoặc null nếu đầu vào không hợp lệ.
 */
const formatCurrencyVND = (amount) => {
    // Chuyển đổi sang số nếu là chuỗi, nếu không phải số thì trả về null
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount)) {
        return null;
    }

    // Sử dụng Intl.NumberFormat để định dạng tiền tệ Việt Nam
    // `vi-VN` là locale cho tiếng Việt tại Việt Nam
    // `currency: 'VND'` chỉ định loại tiền tệ
    // `style: 'currency'` định dạng theo kiểu tiền tệ
    // `minimumFractionDigits: 0` và `maximumFractionDigits: 0` để không hiển thị phần thập phân
    // `useGrouping: true` để thêm dấu phân cách hàng nghìn
    return new Intl.NumberFormat('vi-VN', {
        style: 'currency',
        currency: 'VND',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0,
        useGrouping: true // Đảm bảo có dấu chấm phân cách hàng nghìn
    }).format(numAmount);
};

module.exports = {
    formatCurrencyVND,
};
