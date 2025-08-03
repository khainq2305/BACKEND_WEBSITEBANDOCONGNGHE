let io;

module.exports = {
  init: (server) => {
    const socketIo = require('socket.io')(server, {
      cors: {
        origin: ['http://localhost:9999', 'http://localhost:3000'], // hoặc thêm ngrok nếu cần
        credentials: true
      }
    });

    io = socketIo;

    socketIo.on('connection', (socket) => {
      console.log('📡 Socket connected:', socket.id);

      // ✅ LẮNG NGHE USER JOIN ROOM
      socket.on('join', (room) => {
        console.log('👥 Join room:', room);
        socket.join(room);
      });

      socket.on('disconnect', () => {
        console.log('❌ Socket disconnected:', socket.id);
      });
    });

    return io;
  },

  getIO: () => {
    if (!io) {
      throw new Error('Socket.io chưa được khởi tạo!');
    }
    return io;
  }
};
