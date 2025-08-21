// autoCancelReturnRequests.js
const { Op, Sequelize } = require('sequelize');
const { ReturnRequest, Notification, NotificationUser, sequelize } = require('../models');
const { getIO } = require('../socket');

module.exports = async function autoCancelReturnRequests() {
  const io = getIO();
  const now = new Date();
  
  // LOG 1: Start of cron job
  console.log('---');
  console.log('[CRON] autoCancelReturnRequests running at', now.toISOString());

  try {
    const t = await sequelize.transaction();

    try {
      // --- CASE 1: Approved but no return method chosen (overdue by 1 minute) ---
      
      // LOG 2: Display query conditions
      console.log('[CRON] CASE 1: Querying with where:', {
        status: 'approved',
        [Op.or]: [{ returnMethod: { [Op.is]: null } }, { returnMethod: '' }],
        // Using Sequelize.literal for a database-side time comparison
        deadlineChooseReturnMethod: { [Op.lt]: Sequelize.literal("NOW() - INTERVAL 1 MINUTE") },
      });
      
      const [count1, rows1] = await ReturnRequest.update(
        {
          status: 'cancelled',
          responseNote: 'Tự động huỷ do quá hạn 1 phút chọn phương thức hoàn hàng',
          updatedAt: Sequelize.fn('NOW'),
        },
        {
          where: {
            status: 'approved',
            [Op.or]: [{ returnMethod: { [Op.is]: null } }, { returnMethod: '' }],
            // FIX: Using Sequelize.literal() to bypass Node.js timezone issues
            deadlineChooseReturnMethod: { [Op.lt]: Sequelize.literal("NOW() - INTERVAL 1 MINUTE") },
          },
          returning: true,
          transaction: t,
        }
      );

      // LOG 3: Log update results
      console.log(`[CRON] CASE 1: Updated ${count1} request(s). Rows returned: ${Array.isArray(rows1) ? rows1.length : 'N/A'}`);

      let cancelledNoMethod = [];
      if (Array.isArray(rows1) && rows1.length) {
        cancelledNoMethod = rows1;
      } else if (count1 > 0) {
        // LOG 4: Refetching for MySQL compatibility
        console.log('[CRON] CASE 1: Refetching updated requests...');
        cancelledNoMethod = await ReturnRequest.findAll({
          where: {
            status: 'cancelled',
            responseNote: 'Tự động huỷ do quá hạn 1 phút chọn phương thức hoàn hàng',
            updatedAt: { [Op.gte]: new Date(now.getTime() - 10 * 1000) },
          },
          transaction: t,
        });
      }
      
      // LOG 5: Log the cancelled requests
      console.log('[CRON] CASE 1: Cancelled requests:', cancelledNoMethod.map(req => req.id));

      for (const req of cancelledNoMethod) {
        const noti = await Notification.create(
          {
            title: 'Yêu cầu trả hàng bị huỷ',
            message: 'Yêu cầu trả hàng của bạn đã bị huỷ do quá hạn chọn phương thức hoàn hàng (1 phút).',
            type: 'order',
            targetRole: 'client',
            isGlobal: false,
            slug: `return-cancel-no-method-${req.id}-${Date.now()}`,
          },
          { transaction: t }
        );

        await NotificationUser.create(
          {
            notificationId: noti.id,
            userId: req.userId,
          },
          { transaction: t }
        );

        io.to(`client:${req.userId}`).emit('notification', noti);
      }
      
      // --- CASE 2: Self-send method chosen, but no tracking code after 3 days ---
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 3);

      // LOG 6: Display query conditions for Case 2
      console.log('[CRON] CASE 2: Cutoff date is', cutoff.toISOString());
      console.log('[CRON] CASE 2: Querying with where:', {
        status: 'awaiting_pickup',
        returnMethod: 'self_send',
        [Op.or]: [{ trackingCode: { [Op.is]: null } }, { trackingCode: '' }],
        // FIX: Using Sequelize.literal() for database-side comparison
        dateChooseReturnMethod: { [Op.lt]: Sequelize.literal("NOW() - INTERVAL 3 DAY") },
      });

      const [count2, rows2] = await ReturnRequest.update(
        {
          status: 'cancelled',
          responseNote: 'Tự động huỷ do không gửi hàng sau khi chọn tự gửi',
          updatedAt: Sequelize.fn('NOW'),
        },
        {
          where: {
            status: 'awaiting_pickup',
            returnMethod: 'self_send',
            [Op.or]: [{ trackingCode: { [Op.is]: null } }, { trackingCode: '' }],
            // FIX: Using Sequelize.literal()
            dateChooseReturnMethod: { [Op.lt]: Sequelize.literal("NOW() - INTERVAL 3 DAY") },
          },
          returning: true,
          transaction: t,
        }
      );
      
      // LOG 7: Log update results for Case 2
      console.log(`[CRON] CASE 2: Updated ${count2} request(s). Rows returned: ${Array.isArray(rows2) ? rows2.length : 'N/A'}`);

      let cancelledSelfSend = [];
      if (Array.isArray(rows2) && rows2.length) {
        cancelledSelfSend = rows2;
      } else if (count2 > 0) {
        console.log('[CRON] CASE 2: Refetching updated requests...');
        cancelledSelfSend = await ReturnRequest.findAll({
          where: {
            status: 'cancelled',
            responseNote: 'Tự động huỷ do không gửi hàng sau khi chọn tự gửi',
            updatedAt: { [Op.gte]: new Date(now.getTime() - 10 * 1000) },
          },
          transaction: t,
        });
      }

      for (const req of cancelledSelfSend) {
        // ... (create noti and emit socket for Case 2)
      }

      await t.commit();
      // LOG 8: Confirm successful commit
      console.log('[CRON] Transaction committed successfully.');

      const total = (cancelledNoMethod?.length || 0) + (cancelledSelfSend?.length || 0);
      console.log(`[CRON] Summary: noMethod=${cancelledNoMethod.length || 0}, selfSend=${cancelledSelfSend.length || 0}`);

      if (total > 0) {
        io.to('admin').emit('notification', {
          title: 'Cron huỷ yêu cầu trả hàng',
          message: `Đã tự động huỷ ${total} yêu cầu trả hàng quá hạn.`,
          type: 'order',
        });
      }
    } catch (e) {
      // LOG 9: Log detailed error before rolling back
      console.error('[CRON] Error during transaction, rolling back:', e);
      await t.rollback();
      throw e;
    }
  } catch (err) {
    // LOG 10: Log the final error
    console.error('[ReturnRequestCron] Failed to run cron job:', err);
  }
};