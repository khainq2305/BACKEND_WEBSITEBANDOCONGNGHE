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

// Đây là định nghĩa CỖ MÁY TỰ ĐỘNG
const authorize = (subject, actionOverride = null) => { 
  // Máy sẽ trả về một middleware để Express sử dụng
  return (req, res, next) => {
    // BƯỚC 1: MÁY NHÌN VÀO YÊU CẦU
    const err = new Error(); 
    console.log('📥 authorize được truyền vào subject:', subject, 'actionOverride:', actionOverride);
    if (subject === 'Product') {
  console.trace('🔍 GỌI authorize("Product") Ở ĐÂY');
  console.log(err.stack);
}
    // Máy tự xem phương thức request (GET, POST,...) để quyết định loại bánh (action)
    const action = actionOverride || methodToAction[req.method];
    // BƯỚC 2: MÁY KIỂM TRA NGUYÊN LIỆU
    // Nếu không có subject hoặc không tìm được action, máy sẽ báo lỗi
    console.log("subject là", subject)
    if (!subject || !action) {
      console.error('Authorization Error: Subject or Action could not be determined.');
      return res.status(500).json({ message: 'Lỗi cấu hình phân quyền.' });
    }

    // BƯỚC 3: MÁY BẮT ĐẦU LÀM BÁNH
    // Máy lấy cái Khuôn gốc `checkPermission` ra...
    // ...và tạo ra chiếc bánh cần thiết ngay tại chỗ.
    // Ví dụ: tạo ra cái bánh checkPermission('update', 'Post')
     console.log("🛡️ [authorize gọi] action:", action, "| subject:", subject); // Thêm dòng này
    const middlewareCanThiet = checkPermission(action, subject);

    // BƯỚC 4: MÁY DÙNG CHIẾC BÁNH VỪA TẠO
    // Máy dùng chính chiếc bánh đó để kiểm tra request này
    middlewareCanThiet(req, res, next);
    console.log("authorize hoajt dongo", action, subject)
  };
};

module.exports = { authorize };