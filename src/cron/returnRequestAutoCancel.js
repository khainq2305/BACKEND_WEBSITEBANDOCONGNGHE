const { Op } = require('sequelize');
const { ReturnRequest } = require('../models');

module.exports = async function autoCancelReturnRequests() {
  try {
    const now = new Date();

    const expiredRequests = await ReturnRequest.findAll({
      where: {
        status: 'approved',
        returnMethod: null,
        deadlineChooseReturnMethod: {
          [Op.lt]: now
        }
      }
    });

    for (const request of expiredRequests) {
      request.status = 'cancelled';
      request.responseNote = 'Tự động hủy do quá hạn chọn phương thức hoàn hàng';
      await request.save();
    }

    if (expiredRequests.length > 0) {
      console.log(`[ReturnRequestCron] Đã hủy ${expiredRequests.length} yêu cầu trả hàng quá hạn`);
    }
  } catch (err) {
    console.error('[ReturnRequestCron] Lỗi khi hủy yêu cầu trả hàng quá hạn:', err);
  }
};
