const http = require('http');
const app = require('./src/app');
const { init } = require('./src/socket');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);

// Khởi tạo socket
const io = init(server);
app.locals.io = io;

server.listen(PORT, () => {
  console.log(`Server đang chạy tại cổng: ${PORT}`);
});
