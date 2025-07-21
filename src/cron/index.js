const cron = require('node-cron');
require("./birthdayGift");
require("./blockScheduledUsers");
require("./inactiveUserCleanup");
require("./autoCompleteOrders");

require("./cron"); // cron.js xử lý hoàn đơn hết hạn (Order Cancel)
require("./token"); // cron.js xử lý hoàn đơn hết hạn (Order Cancel)
cron.schedule('*/30 * * * *', require('./returnRequestAutoCancel')); // chạy mỗi 30 phút