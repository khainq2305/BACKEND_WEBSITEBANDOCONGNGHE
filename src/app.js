const express = require('express');
const app = express();
const cors = require('cors');
const clientRoutes = require('./routes/client/index'); // Import client routes
// const adminRoutes = require('./routes/admin/index'); 

app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
  }));
  
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/', clientRoutes); 
// app.use('/admin', adminRoutes); // Nếu có Admin

module.exports = app;
