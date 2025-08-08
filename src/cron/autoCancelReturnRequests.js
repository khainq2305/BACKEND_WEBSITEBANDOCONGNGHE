const { Op } = require('sequelize');
const { ReturnRequest } = require('../models');

module.exports = async function autoCancelReturnRequests() {
  try {
    const now = new Date();

    // 1. Huỷ yêu cầu chưa chọn phương thức sau deadline
    const expiredNoMethod = await ReturnRequest.findAll({
      where: {
        status: 'approved',
        returnMethod: null,
        deadlineChooseReturnMethod: { [Op.lt]: now },
      },
    });

    for (const req of expiredNoMethod) {
      req.status = 'cancelled';
      req.responseNote = 'Tự động huỷ do quá hạn chọn phương thức hoàn hàng';
      await req.save();
    }

    // 2. Huỷ yêu cầu self_send nhưng không nhập trackingCode sau 3 ngày
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 3);

    const expiredSelfSend = await ReturnRequest.findAll({
      where: {
        status: 'awaiting_pickup',
        returnMethod: 'self_send',
        trackingCode: null,
        dateChooseReturnMethod: { [Op.lt]: cutoff },
      },
    });

    for (const req of expiredSelfSend) {
      req.status = 'cancelled';
      req.responseNote = 'Tự động huỷ do không gửi hàng sau khi chọn tự gửi';
      await req.save();
    }

    const total = expiredNoMethod.length + expiredSelfSend.length;
    if (total > 0) {
      console.log(`[ReturnRequestCron] Đã tự động huỷ ${total} yêu cầu trả hàng quá hạn`);
    }
  } catch (err) {
    console.error('[ReturnRequestCron] Lỗi khi huỷ yêu cầu trả hàng quá hạn:', err);
  }
};
