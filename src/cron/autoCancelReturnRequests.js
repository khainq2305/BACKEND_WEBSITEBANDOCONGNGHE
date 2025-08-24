const { Op, Sequelize } = require('sequelize');
const { ReturnRequest, Notification, NotificationUser } = require('../models');
const { getIO } = require('../socket');

module.exports = async function autoCancelReturnRequests() {
  const io = getIO();
  const now = new Date();
  console.log('---');
  console.log('[CRON] autoCancelReturnRequests running at', now.toISOString());

  try {
    const [count1] = await ReturnRequest.update(
      {
        status: 'cancelled',
        responseNote: 'Tự động huỷ do quá hạn 1 phút chọn phương thức hoàn hàng',
        updatedAt: Sequelize.fn('NOW'),
      },
      {
        where: {
          status: 'approved',
          [Op.or]: [{ returnMethod: { [Op.is]: null } }, { returnMethod: '' }],
          deadlineChooseReturnMethod: { [Op.lt]: Sequelize.literal("NOW() - INTERVAL 1 MINUTE") },
        },
      }
    );

    let cancelledNoMethod = [];
    if (count1 > 0) {
      cancelledNoMethod = await ReturnRequest.findAll({
        where: {
          status: 'cancelled',
          responseNote: 'Tự động huỷ do quá hạn 1 phút chọn phương thức hoàn hàng',
          updatedAt: { [Op.gte]: new Date(now.getTime() - 10 * 1000) },
        },
      });
    }

    for (const req of cancelledNoMethod) {
      const noti = await Notification.create({
        title: 'Yêu cầu trả hàng bị huỷ',
        message: 'Yêu cầu trả hàng của bạn đã bị huỷ do quá hạn chọn phương thức hoàn hàng (1 phút).',
        type: 'order',
        targetRole: 'client',
        isGlobal: false,
        slug: `return-cancel-no-method-${req.id}-${Date.now()}`,
      });
      await NotificationUser.create({
        notificationId: noti.id,
        userId: req.userId,
      });
      io.to(`client:${req.userId}`).emit('notification', noti);
    }

    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);

    const [count2] = await ReturnRequest.update(
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
          dateChooseReturnMethod: { [Op.lt]: Sequelize.literal("NOW() - INTERVAL 3 DAY") },
        },
      }
    );

    let cancelledSelfSend = [];
    if (count2 > 0) {
      cancelledSelfSend = await ReturnRequest.findAll({
        where: {
          status: 'cancelled',
          responseNote: 'Tự động huỷ do không gửi hàng sau khi chọn tự gửi',
          updatedAt: { [Op.gte]: new Date(now.getTime() - 10 * 1000) },
        },
      });
    }

    for (const req of cancelledSelfSend) {
      const noti = await Notification.create({
        title: 'Yêu cầu trả hàng bị huỷ',
        message: 'Yêu cầu trả hàng của bạn đã bị huỷ do không gửi hàng sau khi chọn tự gửi.',
        type: 'order',
        targetRole: 'client',
        isGlobal: false,
        slug: `return-cancel-self-send-${req.id}-${Date.now()}`,
      });
      await NotificationUser.create({
        notificationId: noti.id,
        userId: req.userId,
      });
      io.to(`client:${req.userId}`).emit('notification', noti);
    }

    const total = (cancelledNoMethod?.length || 0) + (cancelledSelfSend?.length || 0);
    if (total > 0) {
      io.to('admin').emit('notification', {
        title: 'Cron huỷ yêu cầu trả hàng',
        message: `Đã tự động huỷ ${total} yêu cầu trả hàng quá hạn.`,
        type: 'order',
      });
    }
  } catch (err) {
    console.error('[ReturnRequestCron] Failed to run cron job:', err);
  }
};
