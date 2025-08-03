function generateOrderConfirmationHtml({ 
  orderCode, 
  finalPrice, 
  totalPrice,
  shippingFee,
  couponDiscount,
  pointDiscountAmount,
  rewardPoints,
  userName,
  userPhone,
  userAddress,
  paymentMethodName, // Thêm tham số mới
  companyName = "Thiên Khởi",
  companyLogoUrl = "https://yourdomain.com/logo.png",
  companyAddress = "123 Đường ABC, Quận XYZ, TP. Hà Nội",
  companyPhone = "090-123-4567",
  companySupportEmail = "support@yourdomain.com",
  orderDetailUrl = `https://yourdomain.com/orders/${orderCode}`,
  orderItems 
}) {

  const orderItemsHtml = orderItems.map(item => `
    <tr>
      <td style="padding: 10px 0; border-top: 1px solid #eee;">
        <span style="font-size: 14px;">${item.productName}</span>
      </td>
      <td style="padding: 10px 0; border-top: 1px solid #eee; text-align: center;">
        <span style="font-size: 14px;">${item.quantity}</span>
      </td>
      <td style="padding: 10px 0; border-top: 1px solid #eee; text-align: right;">
        <span style="font-size: 14px;">${Number(item.price).toLocaleString('vi-VN')} đ</span>
      </td>
    </tr>
  `).join('');

  const paymentSummaryHtml = `
    <mj-section padding-top="10px">
      <mj-column>
        <mj-divider border-width="1px" border-style="dashed" border-color="#eee" />
      </mj-column>
    </mj-section>
    
    <mj-section padding="5px 0">
      <mj-column>
        <mj-text font-size="14px" align="right">Tổng tiền sản phẩm:</mj-text>
      </mj-column>
      <mj-column>
        <mj-text font-size="14px" align="right">${Number(totalPrice).toLocaleString('vi-VN')} đ</mj-text>
      </mj-column>
    </mj-section>

    <mj-section padding="5px 0">
      <mj-column>
        <mj-text font-size="14px" align="right">Phí vận chuyển:</mj-text>
      </mj-column>
      <mj-column>
        <mj-text font-size="14px" align="right">${Number(shippingFee).toLocaleString('vi-VN')} đ</mj-text>
      </mj-column>
    </mj-section>

    ${couponDiscount > 0 ? `
    <mj-section padding="5px 0">
      <mj-column>
        <mj-text font-size="14px" align="right">Giảm giá mã khuyến mãi:</mj-text>
      </mj-column>
      <mj-column>
        <mj-text font-size="14px" align="right" color="#d9534f">- ${Number(couponDiscount).toLocaleString('vi-VN')} đ</mj-text>
      </mj-column>
    </mj-section>
    ` : ''}

    ${pointDiscountAmount > 0 ? `
    <mj-section padding="5px 0">
      <mj-column>
        <mj-text font-size="14px" align="right">Giảm giá bằng điểm thưởng:</mj-text>
      </mj-column>
      <mj-column>
        <mj-text font-size="14px" align="right" color="#d9534f">- ${Number(pointDiscountAmount).toLocaleString('vi-VN')} đ</mj-text>
      </mj-column>
    </mj-section>
    ` : ''}

    <mj-section padding="10px 0">
      <mj-column>
        <mj-text font-size="18px" font-weight="bold" align="right">Tổng thanh toán:</mj-text>
      </mj-column>
      <mj-column>
        <mj-text font-size="18px" font-weight="bold" align="right">${Number(finalPrice).toLocaleString('vi-VN')} đ</mj-text>
      </mj-column>
    </mj-section>
  `;

  return `
    <mjml>
      <mj-head>
        <mj-title>Xác nhận đơn hàng ${orderCode}</mj-title>
      </mj-head>
      <mj-body background-color="#f9f9f9">
        
        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-image width="150px" src="${companyLogoUrl}" />
            <mj-divider border-color="#333333" border-width="1px" />
            <mj-text font-size="20px" font-weight="bold" align="center" color="#333333">
              Đơn hàng ${orderCode} đã được đặt thành công
            </mj-text>
          </mj-column>
        </mj-section>
        
        <mj-spacer height="20px" />

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-text font-size="16px" padding-bottom="10px">
              Xin chào ${userName},<br />
              Cảm ơn bạn đã đặt hàng tại <strong>${companyName}</strong>.
            </mj-text>
            <mj-text font-size="16px" padding-bottom="10px">
              Đơn hàng của bạn đã được tiếp nhận và sẽ sớm được xử lý.
            </mj-text>
            
            <mj-text font-size="16px" font-weight="bold" padding-top="15px" padding-bottom="5px">
              Thông tin người nhận
            </mj-text>
            <mj-divider border-width="1px" border-style="dashed" border-color="#eee" />
            
            <mj-text font-size="14px" padding-bottom="6px" padding-top="10px">
              <strong>Người nhận:</strong> ${userName}
            </mj-text>
            <mj-text font-size="14px" padding-bottom="6px" padding-top="0px">
              <strong>Điện thoại:</strong> ${userPhone}
            </mj-text>
            <mj-text font-size="14px" padding-bottom="6px" padding-top="0px">
              <strong>Địa chỉ:</strong> ${userAddress ? userAddress : 'N/A'}
            </mj-text>
            <mj-text font-size="14px" padding-bottom="0px" padding-top="0px">
              <strong>Phương thức thanh toán:</strong> ${paymentMethodName ? paymentMethodName : 'N/A'}
            </mj-text>
          </mj-column>
        </mj-section>
        
        <mj-spacer height="20px" />

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            <mj-text font-size="16px" font-weight="bold" color="#000000">Chi tiết đơn hàng</mj-text>
            <mj-divider border-width="1px" border-style="dashed" border-color="#eee" />
            
            <mj-table>
              <tr style="text-align: left; background-color: #f2f2f2;">
                <th style="padding: 10px; width: 60%;">Sản phẩm</th>
                <th style="padding: 10px; text-align: center; width: 15%;">SL</th>
                <th style="padding: 10px; text-align: right; width: 25%;">Đơn giá</th>
              </tr>
              ${orderItemsHtml}
            </mj-table>
          </mj-column>
        </mj-section>

        <mj-spacer height="20px" />

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            ${paymentSummaryHtml}
          </mj-column>
        </mj-section>

        <mj-spacer height="20px" />

        <mj-section background-color="#ffffff" padding="20px">
          <mj-column>
            ${rewardPoints > 0 ? `
              <mj-text font-size="14px" font-weight="bold" color="#F45E43" align="center" padding-bottom="15px">
                Bạn đã nhận được ${rewardPoints} điểm thưởng từ đơn hàng này!
              </mj-text>
            ` : ''}
            <mj-button background-color="#F45E43" color="#ffffff" font-weight="bold" href="${orderDetailUrl}" width="200px">
              Xem chi tiết đơn hàng
            </mj-button>
          </mj-column>
        </mj-section>
        
        <mj-spacer height="20px" />

        <mj-section padding="20px">
          <mj-column>
            <mj-text font-size="12px" color="#888888" align="center">
              Nếu bạn có bất kỳ câu hỏi nào, vui lòng liên hệ với chúng tôi:<br />
              <strong>Địa chỉ:</strong> ${companyAddress} <br />
              <strong>Điện thoại:</strong> ${companyPhone}<br />
              <strong>Email hỗ trợ:</strong> <a href="mailto:${companySupportEmail}" style="color: #007bff;">${companySupportEmail}</a>
            </mj-text>
            <mj-text font-size="12px" color="#888888" align="center">
              &copy; ${new Date().getFullYear()} ${companyName}. Tất cả các quyền được bảo lưu.
            </mj-text>
          </mj-column>
        </mj-section>

      </mj-body>
    </mjml>
  `;
}

module.exports = { generateOrderConfirmationHtml };