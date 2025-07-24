let io;

module.exports = {
  init: (server) => {
    const socketIo = require('socket.io')(server, {
      cors: {
        origin: 'http://localhost:9999', // domain FE admin
        credentials: true
      }
    });

    io = socketIo;

    socketIo.on('connection', (socket) => {
      console.log('📡 Socket connected:', socket.id);
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