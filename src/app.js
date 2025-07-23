// server.js hoặc app.js
const express = require('express');
const app = express();
const cors = require('cors');
const path = require('path');
const cookieParser = require('cookie-parser');
const stripeWebhookRoute = require('./webhook/stripeWebhookRoute'); // <== thêm dòng này
app.use('/orders', stripeWebhookRoute);
app.use(cookieParser());

const clientRoutes = require('./routes/client'); 
const adminRoutes = require('./routes/admin'); 

const sequelize = require('./config/database'); 


sequelize.authenticate().then(() => {
 

require('./cron');


}).catch(err => {
  console.error("Lỗi kết nối MySQL:", err);
});


app.use(cors({
  origin: [
    'http://localhost:9999',
    'https://ad1e-2402-800-6343-1157-602d-5d2b-2fa2-232d.ngrok-free.app'
  ],
  credentials: true
}));

app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));
app.use('/', clientRoutes);
app.use('/admin', adminRoutes); 






module.exports = app;
