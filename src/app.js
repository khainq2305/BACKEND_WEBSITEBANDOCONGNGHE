// server.js hoặc app.js
const express = require('express');
const app = express();
const cors = require('cors');
const path = require('path');
const clientRoutes = require('./routes/client'); 
const adminRoutes = require('./routes/admin'); 

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
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

app.use('/uploads', express.static(path.join(__dirname, '../public/uploads')));

// SEO public routes (không cần authentication)
const seoController = require('./controllers/admin/seoController');
app.get('/robots.txt', (req, res) => seoController.generateRobotsTxt(req, res));
app.get('/sitemap.xml', (req, res) => seoController.generateSitemap(req, res));

app.use('/', clientRoutes);
app.use('/admin', adminRoutes); 


module.exports = app;
