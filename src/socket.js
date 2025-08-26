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
   

      socket.on('join', (room) => {
       
        socket.join(room);
      });

      socket.on('disconnect', () => {
        
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
