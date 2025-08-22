const { DataTypes } = require("sequelize");
const sequelize = require("../config/database");

const ReturnRequest = sequelize.define(
  "ReturnRequest",
  {
    orderId: {
      type: DataTypes.INTEGER,
      allowNull: false,
    },
    reason: {
      type: DataTypes.TEXT,
      allowNull: false,
    },
    shippingProviderId: {
      type: DataTypes.INTEGER,
      allowNull: true,
      comment: "ID hãng vận chuyển mà user chọn",
    },
    cancelledBy: {
      type: DataTypes.ENUM("user", "admin"),
      allowNull: true,
    },
    evidenceImages: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Danh sách URL ảnh, ngăn cách bằng dấu ,",
    },
    returnCode: {
      type: DataTypes.STRING,
      unique: true,
      allowNull: false,
    },
    evidenceVideos: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Danh sách URL video, ngăn cách bằng dấu ,",
    },
    returnFee: {
      type: DataTypes.INTEGER,
      allowNull: true,
      defaultValue: 0,
      comment: "Phí vận chuyển trả hàng",
    },
    detailedReason: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "Mô tả chi tiết lý do trả hàng",
    },
    deadlineChooseReturnMethod: {
      type: DataTypes.DATE,
      allowNull: true,
      comment:
        "Hạn cuối để người dùng chọn phương thức trả hàng sau khi được duyệt",
    },
    dateChooseReturnMethod: {
      type: DataTypes.DATE,
      allowNull: true,
      comment: "Thời điểm người dùng chọn phương thức hoàn hàng",
    },

    // ✅ MỚI: Phương thức gửi hàng hoàn
    returnMethod: {
      type: DataTypes.ENUM("ghn_pickup", "self_send"),
      allowNull: true,
      comment: "Phương thức trả hàng: GHN đến lấy hoặc tự gửi",
    },
    returnLabelUrl: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment: "URL phiếu gửi hàng (label) từ GHN",
    },
    situation: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: "other",
      comment: "Tình huống khách chọn",
    },
    refundAmount: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      comment: "Số tiền hoàn lại cho khách (chốt khi tạo yêu cầu)",
    },
    trackingCode: {
      type: DataTypes.STRING,
      allowNull: true,
      comment: "Mã vận đơn trả hàng (nếu có)",
    },

    status: {
      type: DataTypes.ENUM(
        "pending",
        "approved",
        "awaiting_pickup",
        "awaiting_dropoff",
        "shipping",
        "pickup_booked",
        "received",
        "refunded",
        "rejected",
        "cancelled",
        "return_failed"
      ),
      defaultValue: "pending",
    },

    responseNote: {
      type: DataTypes.TEXT,
      allowNull: true,
      comment:
        "Ghi chú phản hồi từ phía admin (lý do từ chối, lý do hàng không hợp lệ...)",
    },
  },
  {
    tableName: "returnrequests",
    timestamps: true,
  }
);

module.exports = ReturnRequest;
