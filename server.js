require('dotenv').config();
const http = require('http');
const app = require('./src/app'); 
const { Server } = require('socket.io');

const PORT = process.env.PORT || 5000;

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: [
      'http://localhost:9999',
      'https://ad1e-2402-800-6343-1157-602d-5d2b-2fa2-232d.ngrok-free.app'
    ],
    credentials: true
  }
});

app.locals.io = io;

io.on('connection', (socket) => {
  // console.log('Socket connected:', socket.id);
});

server.listen(PORT, () => {
  console.log(`Server đang chạy tại: http://localhost:${PORT}`);
});
