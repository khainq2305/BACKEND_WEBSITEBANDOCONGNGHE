const cron = require("node-cron");
const { Op } = require("sequelize");
const User = require("../models/userModel");


cron.schedule("*/10 * * * * *", async () => {
 

  const threshold = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000);

  const users = await User.findAll({
    where: {
      status: 0,
      lastLoginAt: { [Op.lt]: threshold },
      deletedAt: null,
    },
  });

  for (const user of users) {
    await user.destroy(); 


  }
});
