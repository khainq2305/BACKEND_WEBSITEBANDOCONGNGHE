const http = require('http');
const app = require('./src/app');
const { init } = require('./src/socket'); // ✅ chính xác

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// ✅ Khởi tạo socket tại đây
const io = init(server);
app.locals.io = io;

server.listen(PORT, () => {
  console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});
