// server.js hoặc app.js
const express = require('express');
const app = express();
const cors = require('cors');

const clientRoutes = require('./routes/client');
const adminRoutes = require('./routes/admin'); // 👈 THÊM

const sequelize = require('./config/database');


sequelize.authenticate().then(() => {



  require("./services/common/cron");

}).catch(err => {
  console.error("Lỗi kết nối MySQL:", err);
});


app.use(cors({
  origin: 'http://localhost:9999',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));


app.use('/', clientRoutes);
app.use('/admin', adminRoutes);
app.use((err, req, res, next) => {
  logErrorToFile(err.message, req);
  res.status(500).json({ message: "Đã xảy ra lỗi server!" });
});

module.exports = app;
