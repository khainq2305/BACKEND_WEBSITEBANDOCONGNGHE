// socket.js
let io;

module.exports = {
  init: (server) => {
    const allowOrigins = (process.env.CORS_ORIGIN || 'http://localhost:9999,http://localhost:3000')
      .split(',')
      .map(s => s.trim());

    const socketIo = require('socket.io')(server, {
      cors: {
        origin: allowOrigins,
        credentials: true
      }
    });

    io = socketIo;

    socketIo.on('connection', (socket) => {
      console.log('📡 Socket connected:', socket.id);

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
