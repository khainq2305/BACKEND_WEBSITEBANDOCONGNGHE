const mjml = require("mjml");
// Mapping trạng thái sang tiếng Việt
function getStatusLabel(status) {
  switch (status) {
    case "approved":
      return "Đã duyệt";
    case "rejected":
      return "Từ chối";
    case "cancelled":
      return "Đã hủy";
    case "refunded":
      return "Đã hoàn tiền";
    default:
      return status;
  }
}

function generateReturnStatusEmailHtml({
  status,
  returnCode,
  orderCode,
  userName,
  message,
  refundAmount,
  companyName = "CYBERZONE",
  companyLogoUrl = "https://res.cloudinary.com/dzrp2hsvh/image/upload/v1753761547/uploads/ohs6h11zyavrv2haky9f.png",
  supportEmail = "support@yourdomain.com",
  requestDetailUrl
}) {
  let color = "#333";
  if (status === "approved") color = "#28a745";
  if (status === "rejected") color = "#dc3545";
  if (status === "cancelled") color = "#6c757d";
  if (status === "refunded") color = "#007bff";

  const mjmlTemplate = `
    <mjml>
      <mj-head>
        <mj-title>Cập nhật yêu cầu trả hàng ${returnCode}</mj-title>
        <mj-font name="Roboto" href="https://fonts.googleapis.com/css?family=Roboto" />
      </mj-head>
      <mj-body background-color="#f4f4f4" font-family="Roboto, Arial, sans-serif">
        
        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-image width="120px" src="${companyLogoUrl}" />
            <mj-divider border-color="#eee" />
           <mj-text font-size="20px" font-weight="bold" align="center" color="${color}">
  Trạng thái: ${getStatusLabel(status)}
</mj-text>

          </mj-column>
        </mj-section>

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-text font-size="16px" color="#333">
              Xin chào <strong>${userName}</strong>,<br/>
              Yêu cầu trả hàng <strong>${returnCode}</strong> của đơn <strong>${orderCode}</strong> đã được cập nhật.
            </mj-text>
            <mj-text font-size="14px" color="${color}">
              ${message}
            </mj-text>
            ${
              status === "refunded"
                ? `<mj-text font-size="14px" color="#28a745">
                  Số tiền hoàn trả: <strong>${Number(refundAmount).toLocaleString("vi-VN")} đ</strong>
                </mj-text>`
                : ""
            }
          </mj-column>
        </mj-section>

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-button background-color="#F45E43" color="#ffffff" font-weight="bold" href="${requestDetailUrl}">
              Xem chi tiết yêu cầu
            </mj-button>
          </mj-column>
        </mj-section>

        <mj-section>
          <mj-column>
            <mj-text font-size="12px" color="#888" align="center">
              Nếu bạn cần hỗ trợ, vui lòng liên hệ:<br/>
              <a href="mailto:${supportEmail}" style="color:#007bff;">${supportEmail}</a>
            </mj-text>
          </mj-column>
        </mj-section>

      </mj-body>
    </mjml>
  `;

  // Compile MJML -> HTML
  const { html } = mjml(mjmlTemplate, { validationLevel: "soft" });
  return html;
}

module.exports = { generateReturnStatusEmailHtml };
