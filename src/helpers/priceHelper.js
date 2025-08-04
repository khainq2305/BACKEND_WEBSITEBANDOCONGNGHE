// utils/priceHelper.js

const processSkuPrices = (skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap) => {
    // Lấy giá gốc từ originalPrice, nếu không có thì lấy price.
    // Nếu cả hai đều không có, mặc định là 0.
    const rawOriginalSkuPrice = parseFloat(skuData.originalPrice || skuData.price || 0);

    // Giá hiệu quả (effectivePrice) ban đầu sẽ là giá gốc
    let effectivePrice = rawOriginalSkuPrice; 
    let effectiveFlashSaleInfo = null;

    // --- XỬ LÝ FLASH SALE ---
    const bestFsItemForSku = allActiveFlashSaleItemsMap.get(skuData.id);
    if (bestFsItemForSku) {
        // Kiểm tra xem flash sale item này đã hết hàng chưa
        const isSoldOutForThisItem = bestFsItemForSku.quantity != null && bestFsItemForSku.soldQuantity >= bestFsItemForSku.quantity;
        
        if (!isSoldOutForThisItem) {
            const flashSalePrice = parseFloat(bestFsItemForSku.salePrice);
            // Chỉ áp dụng flash sale nếu giá sale thấp hơn giá hiện tại
            if (flashSalePrice < effectivePrice) { 
                effectivePrice = flashSalePrice;
                effectiveFlashSaleInfo = {
                    salePrice: flashSalePrice,
                    quantity: bestFsItemForSku.quantity,
                    soldQuantity: bestFsItemForSku.soldQuantity,
                    maxPerUser: bestFsItemForSku.maxPerUser,
                    flashSaleId: bestFsItemForSku.flashSaleId,
                    flashSaleEndTime: bestFsItemForSku.flashSaleEndTime,
                    type: 'item',
                    isSoldOut: false
                };
            }
        }
    }

    // --- XỬ LÝ KHUYẾN MÃI THEO DANH MỤC ---
    const productCategoryId = skuData.Product?.category?.id || skuData.product?.category?.id || skuData.productId;
    const dealsForCategory = allActiveCategoryDealsMap.get(productCategoryId) || [];
    if (dealsForCategory.length > 0) {
        dealsForCategory.forEach(deal => {
            let currentCategoryDealPrice = rawOriginalSkuPrice;
            if (deal.discountType === 'percent') {
                currentCategoryDealPrice = (currentCategoryDealPrice * (100 - deal.discountValue)) / 100;
            } else if (deal.discountType === 'fixed' || deal.discountType === 'amount') {
                currentCategoryDealPrice = currentCategoryDealPrice - deal.discountValue;
            }
            currentCategoryDealPrice = Math.max(0, Math.round(currentCategoryDealPrice / 1000) * 1000);

            // Nếu giá khuyến mãi danh mục tốt hơn giá hiện tại
            if (currentCategoryDealPrice < effectivePrice) {
                effectivePrice = currentCategoryDealPrice;
                effectiveFlashSaleInfo = {
                    salePrice: currentCategoryDealPrice,
                    quantity: null,
                    soldQuantity: null,
                    endTime: deal.endTime,
                    type: 'category',
                    discountType: deal.discountType,
                    discountValue: deal.discountValue,
                    flashSaleId: deal.flashSaleId,
                    flashSaleCategoryId: deal.flashSaleCategoryId,
                    isSoldOut: false
                };
            }
        });
    }

    // Nếu không có deal nào được áp dụng và giá bán khác giá gốc, cập nhật giá
    if (effectivePrice === rawOriginalSkuPrice && skuData.price > 0 && skuData.price < rawOriginalSkuPrice) {
        effectivePrice = parseFloat(skuData.price);
    }
    
    // Đảm bảo giá không bao giờ âm
    effectivePrice = Math.max(0, effectivePrice);

    // Tính toán lại giá trị giảm giá dựa trên giá gốc và giá hiệu quả
    const discountPercent = (rawOriginalSkuPrice > effectivePrice && rawOriginalSkuPrice > 0)
        ? Math.round((1 - effectivePrice / rawOriginalSkuPrice) * 100)
        : 0;

    return {
        price: effectivePrice,
        originalPrice: rawOriginalSkuPrice, // Trả về giá gốc
        strikethroughPrice: rawOriginalSkuPrice, // Giá gạch ngang
        discountPercent: discountPercent,
        discountAmount: rawOriginalSkuPrice - effectivePrice,
        flashSaleInfo: effectiveFlashSaleInfo,
        hasDeal: effectiveFlashSaleInfo !== null
    };
};

module.exports = {
    processSkuPrices,
};