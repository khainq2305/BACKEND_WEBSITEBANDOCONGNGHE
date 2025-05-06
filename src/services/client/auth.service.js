const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../../models/userModel");
const sendEmail = require("../../utils/sendEmail");

const JWT_SECRET = process.env.JWT_SECRET || "your_secret";
const BASE_URL = process.env.BASE_URL || "http://localhost:3000";
function generateRandomName() {
  return "user_" + Math.random().toString(36).substring(2, 8);
}

async function registerUser({ fullName, email, password }) {
  const existingUser = await User.findOne({ where: { email } });
  if (existingUser) throw new Error("Email đã tồn tại!");

  const name = fullName?.trim() || generateRandomName();

const user = await User.create({
  fullName: name,
  email,
  password,
  status: 1,
  roleId: 2,
  isVerified: 0
});


  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: "1d" });
  const verifyLink = `${BASE_URL}/verify-email?token=${token}`;

  const html = `
  <div style="font-family: Arial, sans-serif; background-color: #f7f7f7; padding: 30px;">
    <div style="max-width: 600px; margin: auto; background: #fff; padding: 20px; border-radius: 8px; border: 1px solid #eee;">
      <h2 style="color: #333;">🛡️ Xác thực tài khoản</h2>
      <p>Chào <strong>${name}</strong>,</p>
      <p style="margin: 10px 0;">
        Cảm ơn bạn đã đăng ký. Vui lòng nhấn vào nút bên dưới để xác thực tài khoản:
      </p>
      <a href="${verifyLink}" 
         style="display: inline-block; padding: 12px 24px; background-color: #ee4d2d; color: #fff; text-decoration: none; border-radius: 6px; font-weight: bold; margin: 20px 0;">
        Xác thực email
      </a>
      <p style="color: #999; font-size: 12px;">
        Nếu bạn không đăng ký, vui lòng bỏ qua email này.
      </p>
    </div>
  </div>
`;

await sendEmail(email, "Xác thực tài khoản", html);


  return user;
}

async function verifyEmail(token) {
  const decoded = jwt.verify(token, JWT_SECRET);
  const user = await User.findByPk(decoded.id);
  if (!user) throw new Error("Người dùng không tồn tại!");
  user.isVerified = 1;
  await user.save();
  return true;
}

async function loginUser({ email, password }) {
  const user = await User.findOne({ where: { email } });
  if (!user) throw new Error("Email hoặc mật khẩu không đúng!");
  if (user.status === 0) throw new Error("Tài khoản bị khóa!");
  if (user.isVerified === 0) throw new Error("Vui lòng xác thực email trước!");
  console.log("PASSWORD INPUT:", password);
  console.log("HASHED PASSWORD:", user.password);
  
  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error("Email hoặc mật khẩu không đúng!");

  return user;
}



module.exports = { registerUser, verifyEmail, loginUser };
