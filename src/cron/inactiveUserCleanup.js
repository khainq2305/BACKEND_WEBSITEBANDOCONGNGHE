const cron = require("node-cron");
const { Op } = require("sequelize");
const User = require("../models/userModel");

// Chạy vào 00:00 ngày 1 tháng 1 hàng năm
cron.schedule("0 0 1 1 *", async () => {
  console.log("[CRON JOB] Checking for accounts inactive for over 3 years for soft deletion...");

  // Calculate the timestamp for 3 years ago
  const threshold = new Date(Date.now() - 3 * 365 * 24 * 60 * 60 * 1000); 

  try {
    const users = await User.findAll({
      where: {
        deletedAt: null, // Only consider accounts that haven't been soft-deleted already
        lastLoginAt: { [Op.lt]: threshold } // Find users whose last login was more than 3 years ago
      }
    });

    if (users.length > 0) {
      console.log(`[CRON JOB] Found ${users.length} user(s) to soft delete.`);
      for (const user of users) {
        await user.destroy(); // Perform soft delete
        console.log(`[CRON JOB] Soft deleted user: ${user.email}`);
      }
    } else {
      console.log("[CRON JOB] No users found for soft deletion.");
    }
  } catch (error) {
    console.error("[CRON JOB ERROR]", error);
  }
});