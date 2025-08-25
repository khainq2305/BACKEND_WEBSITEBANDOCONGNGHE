function generateReturnRequestHtml({ 
  orderCode,
  userName,
  userEmail,
  reason,
  detailedReason,
  situation, // seller_pays | customer_pays
  refundAmount,
  returnFee,
  returnCode,
  orderItems,
  evidenceImages = [],
  evidenceVideos = [],
  companyName = "CYBERZONE",
  companyLogoUrl = "https://yourdomain.com/logo.png",
  companySupportEmail = "support@yourdomain.com",
  requestDetailUrl = `https://yourdomain.com/return-requests/${returnCode}`
}) {
  const orderItemsHtml = orderItems.map(item => `
    <tr>
      <td style="padding: 10px; border-top: 1px solid #eee;">${item.productName}</td>
      <td style="padding: 10px; border-top: 1px solid #eee; text-align:center;">${item.quantity}</td>
      <td style="padding: 10px; border-top: 1px solid #eee; text-align:right;">${Number(item.price).toLocaleString('vi-VN')} đ</td>
    </tr>
  `).join('');

  const imagesHtml = evidenceImages.map(url => `
    <img src="${url}" style="max-width:120px; margin:5px; border:1px solid #ccc;" />
  `).join('');

  const videosHtml = evidenceVideos.map(url => `
    <a href="${url}" target="_blank" style="display:block; margin:5px; color:#007bff;">Xem video</a>
  `).join('');

  return `
    <mjml>
      <mj-head>
        <mj-title>Yêu cầu trả hàng ${returnCode}</mj-title>
      </mj-head>
      <mj-body background-color="#f9f9f9">

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-image width="150px" src="${companyLogoUrl}" />
            <mj-divider border-color="#333333" border-width="1px" />
            <mj-text font-size="20px" font-weight="bold" align="center" color="#333333">
              Xác nhận yêu cầu trả hàng
            </mj-text>
          </mj-column>
        </mj-section>

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-text font-size="16px">
              Xin chào ${userName} (${userEmail}),<br/>
              Yêu cầu trả hàng của bạn cho đơn <strong>${orderCode}</strong> đã được ghi nhận.
            </mj-text>
            <mj-text font-size="14px">
              <strong>Mã yêu cầu:</strong> ${returnCode}<br/>
              <strong>Lý do:</strong> ${reason}<br/>
              <strong>Chi tiết:</strong> ${detailedReason || "Không có"}<br/>
              <strong>Tình huống phí:</strong> ${situation === "seller_pays" ? "Người bán chịu phí" : "Khách hàng chịu phí"}<br/>
              <strong>Phí trả hàng:</strong> ${Number(returnFee).toLocaleString('vi-VN')} đ<br/>
              <strong>Số tiền hoàn dự kiến:</strong> ${Number(refundAmount).toLocaleString('vi-VN')} đ
            </mj-text>
          </mj-column>
        </mj-section>

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-text font-size="16px" font-weight="bold">Sản phẩm trả:</mj-text>
            <mj-divider border-width="1px" border-style="dashed" border-color="#eee" />
            <mj-table>
              <tr style="background:#f2f2f2;">
                <th style="padding:10px; width:60%;">Sản phẩm</th>
                <th style="padding:10px; text-align:center; width:15%;">SL</th>
                <th style="padding:10px; text-align:right; width:25%;">Đơn giá</th>
              </tr>
              ${orderItemsHtml}
            </mj-table>
          </mj-column>
        </mj-section>

        ${imagesHtml || videosHtml ? `
        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-text font-size="16px" font-weight="bold">Bằng chứng:</mj-text>
            <mj-divider border-width="1px" border-style="dashed" border-color="#eee" />
            <mj-text>${imagesHtml}</mj-text>
            <mj-text>${videosHtml}</mj-text>
          </mj-column>
        </mj-section>` : ''}

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-button background-color="#F45E43" color="#ffffff" font-weight="bold" href="${requestDetailUrl}" width="220px">
              Xem chi tiết yêu cầu
            </mj-button>
          </mj-column>
        </mj-section>

        <mj-section padding="20px">
          <mj-column>
            <mj-text font-size="12px" color="#888888" align="center">
              Nếu bạn cần hỗ trợ, vui lòng liên hệ:<br/>
              Email: <a href="mailto:${companySupportEmail}" style="color:#007bff;">${companySupportEmail}</a>
            </mj-text>
          </mj-column>
        </mj-section>

      </mj-body>
    </mjml>
  `;
}

module.exports = { generateReturnRequestHtml };
