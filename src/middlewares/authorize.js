// Import cái "Khuôn Làm Bánh" gốc của bạn
const { checkPermission } = require('./casl.middleware');

// Bảng hướng dẫn cho máy: phương thức nào thì làm bánh gì
const methodToAction = {
  'GET': 'read',
  'POST': 'create',
  'PUT': 'update',
  'PATCH': 'update',
  'DELETE': 'delete'
};

// Đây là định nghĩa CỖ MÁY TỰ ĐỘNG đã được sửa lỗi
const authorize = (subject, actionOverride = null) => {
  // Máy sẽ trả về một middleware để Express sử dụng
  return (req, res, next) => {
    // Máy tự xem phương thức request (GET, POST,...) để quyết định loại bánh (action)
    const action = actionOverride || methodToAction[req.method];
    console.log('Authorize subject:', subject, 'action:', action);
    // Máy kiểm tra nguyên liệu
    if (!subject || !action) {
      console.error('Authorization Error: Subject or Action could not be determined.');
      return res.status(500).json({ message: 'Lỗi cấu hình phân quyền.' });
    }

    // Máy tạo ra middleware kiểm tra quyền cụ thể
    const specificPermissionMiddleware = checkPermission(action, subject);

    // Máy dùng middleware vừa tạo để kiểm tra request.
    // Middleware này sẽ TỰ GỌI next() nếu quyền hợp lệ, hoặc gửi lỗi nếu không hợp lệ.
    // Chúng ta không cần gọi next() ở đây nữa.
    specificPermissionMiddleware(req, res, next);
  };
};

module.exports = { authorize };
