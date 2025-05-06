const nodemailer = require("nodemailer");

const sendEmail = async (to, subject, htmlContent) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER, // gmail của bạn
      pass: process.env.EMAIL_PASS  // mật khẩu ứng dụng
    }
  });

  await transporter.sendMail({
    from: `"No-Reply" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html: htmlContent
  });
};

module.exports = sendEmail;
