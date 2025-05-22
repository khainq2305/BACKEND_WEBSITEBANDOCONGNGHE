const sendEmail = require('../../utils/sendEmail');

const sendAccountStatusEmail = async (email, name, status, reason = '') => {
  const isBlocked = status === 0;

  const subject = isBlocked
    ? 'Cảnh báo: Tài khoản sẽ bị khóa sau 1 phút'
    : 'Thông báo: Tài khoản đã được mở khóa';

  const html = `
  <div style="font-family: Arial, sans-serif; background-color: #f4f4f4; padding: 24px;">
    <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 6px rgba(0,0,0,0.1);">
      <div style="background-color: ${isBlocked ? '#ffc107' : '#198754'}; padding: 16px 24px; color: #fff;">
        <h2 style="margin: 0;">
          ${isBlocked ? '⚠️ Cảnh báo: Sắp khóa tài khoản' : '✅ Tài khoản đã được mở khóa'}
        </h2>
      </div>
      <div style="padding: 24px; color: #333;">
        <p>Xin chào <strong>${name}</strong>,</p>
        ${
          isBlocked
            ? `
            <p>Tài khoản của bạn <strong>sẽ bị khóa sau 1 phút</strong> do vi phạm quy định.</p>
            <p><strong>Lý do:</strong> ${reason}</p>
            <p>Nếu bạn cho rằng đây là sự nhầm lẫn hoặc muốn kháng cáo, vui lòng liên hệ bộ phận hỗ trợ ngay.</p>
            <p style="margin-top: 16px;">
              👉 <strong>Email hỗ trợ:</strong> <a href="mailto:support@example.com">support@example.com</a><br/>
              👉 <strong>Hotline:</strong> 0123 456 789
            </p>
            `
            : `<p>Bạn đã có thể đăng nhập và sử dụng lại hệ thống như bình thường.</p>`
        }
        <p style="margin-top: 32px;">Trân trọng,<br/><strong>Hệ thống Quản trị</strong></p>
      </div>
      <div style="background-color: #f0f0f0; padding: 16px 24px; text-align: center; font-size: 13px; color: #888;">
        Đây là email tự động. Vui lòng không phản hồi lại email này.
      </div>
    </div>
  </div>
  `;

  await sendEmail(email, subject, html);
};

module.exports = {
  sendAccountStatusEmail
};
