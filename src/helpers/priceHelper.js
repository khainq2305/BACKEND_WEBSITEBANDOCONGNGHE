// utils/priceHelper.js

const processSkuPrices = (skuData, allActiveFlashSaleItemsMap, allActiveCategoryDealsMap) => {
    let effectivePrice; // Giá hiệu quả cuối cùng
    let effectiveFlashSaleInfo = null; // Thông tin về Flash Sale đang áp dụng giá tốt nhất
    let isCurrentFlashSaleItemSoldOut = false; // Cờ để theo dõi trạng thái hết hàng của FlashSaleItem

    // Sử dụng skuData.originalPrice hoặc skuData.price (từ DB) làm giá cơ sở
    const rawOriginalSkuPrice = parseFloat(skuData.originalPrice || skuData.price || 0);
    const rawDefaultSkuPrice = parseFloat(skuData.price || 0);

    // Giá gốc để hiển thị gạch ngang (Ưu tiên originalPrice từ DB nếu có, nếu không thì dùng giá mặc định)
    const displayOriginalPrice = rawOriginalSkuPrice > 0 ? rawOriginalSkuPrice : rawDefaultSkuPrice;

    // console.log(`   [PriceHelper] Xử lý SKU ${skuData.skuCode} (ID: ${skuData.id}). Giá mặc định (từ DB): ${rawDefaultSkuPrice}, Giá gốc (nếu khác): ${rawOriginalSkuPrice}`);

    // --- 1. Ưu tiên giá từ FlashSaleItem tốt nhất từ MAP tổng hợp ---
    const bestFsItemForSku = allActiveFlashSaleItemsMap.get(skuData.id);

    if (bestFsItemForSku) {
        // Kiểm tra xem FlashSaleItem này đã hết suất chưa dựa trên soldQuantity và quantity từ map
        isCurrentFlashSaleItemSoldOut = bestFsItemForSku.quantity != null && bestFsItemForSku.soldQuantity >= bestFsItemForSku.quantity;

        if (!isCurrentFlashSaleItemSoldOut) {
            effectivePrice = parseFloat(bestFsItemForSku.salePrice);
            effectiveFlashSaleInfo = {
                quantity: bestFsItemForSku.quantity,
                soldQuantity: bestFsItemForSku.soldQuantity, // Truyền soldQuantity
                endTime: bestFsItemForSku.flashSaleEndTime,
                type: 'item',
                discountType: 'fixed', // FlashSaleItem thường là giảm giá cố định
                discountValue: displayOriginalPrice - effectivePrice,
                flashSaleId: bestFsItemForSku.flashSaleId,
                isSoldOut: false // Rõ ràng là chưa hết hàng
            };
            // console.log(`     [PriceHelper] Khởi tạo effectivePrice từ FlashSaleItem (MAP): ${effectivePrice} (còn suất)`);
        } else {
            // Nếu FlashSaleItem đã hết suất, nó sẽ không cung cấp giá sale
            // Giá sẽ được xử lý ở bước tiếp theo hoặc quay về giá gốc mặc định
            // console.log(`     [PriceHelper] FlashSaleItem (MAP) đã hết suất cho SKU ${skuData.id}.`);
        }
    }

    // Nếu không có FlashSaleItem đang hoạt động (hoặc nó đã hết suất), mới xem xét Category Deal
    if (!effectiveFlashSaleInfo || isCurrentFlashSaleItemSoldOut) {
        const productCategoryId = skuData.Product?.category?.id || skuData.product?.category?.id || skuData.productId; // Fallback
        const dealsForCategory = allActiveCategoryDealsMap.get(productCategoryId) || [];

        if (dealsForCategory.length > 0) {
            // console.log(`   [PriceHelper] Phát hiện ${dealsForCategory.length} Ưu đãi Danh mục cho Category ID ${productCategoryId}.`);
            let bestCategoryDealPrice = Infinity;
            let bestCategoryDealInfo = null;

            dealsForCategory.forEach(deal => {
                let currentCategoryDealPrice = displayOriginalPrice; // Dùng giá gốc của SKU để tính Category Deal

                if (deal.discountType === 'percent') {
                    currentCategoryDealPrice = (currentCategoryDealPrice * (100 - deal.discountValue)) / 100;
                } else if (deal.discountType === 'fixed' || deal.discountType === 'amount') {
                    currentCategoryDealPrice = currentCategoryDealPrice - deal.discountValue;
                }

                currentCategoryDealPrice = Math.max(0, Math.round(currentCategoryDealPrice / 1000) * 1000);

                // console.log(`     [PriceHelper] - Đang xem xét Deal Danh mục (type: ${deal.discountType}, value: ${deal.discountValue}). Giá tính toán: ${currentCategoryDealPrice}`);

                if (currentCategoryDealPrice < bestCategoryDealPrice) {
                    bestCategoryDealPrice = currentCategoryDealPrice;
                    bestCategoryDealInfo = {
                        endTime: deal.endTime,
                        type: 'category',
                        discountType: deal.discountType,
                        discountValue: deal.discountValue,
                        flashSaleId: deal.flashSaleId,
                        flashSaleCategoryId: deal.flashSaleCategoryId,
                        isSoldOut: false // Category deals không có khái niệm "hết suất" riêng cho từng SKU
                    };
                }
            });

            // Nếu chưa có effectivePrice (tức là không có FlashSaleItem hoạt động)
            // HOẶC nếu bestCategoryDealPrice thấp hơn effectivePrice hiện tại
            if (!effectiveFlashSaleInfo || bestCategoryDealPrice < effectivePrice) {
                effectivePrice = bestCategoryDealPrice;
                effectiveFlashSaleInfo = bestCategoryDealInfo;
                // console.log(`     [PriceHelper] -> Ưu đãi Danh mục tốt nhất cho giá THẤP HƠN. Giá hiệu quả: ${effectivePrice}`);
            } else if (bestCategoryDealPrice === effectivePrice && effectiveFlashSaleInfo?.type !== 'item') {
                // Nếu bằng giá VÀ ưu đãi hiện tại KHÔNG phải là FlashSaleItem trực tiếp,
                // thì ưu tiên Ưu đãi Danh mục. (Giữ FlashSaleItem nếu nó đã là nguồn và giá bằng)
                effectivePrice = bestCategoryDealPrice;
                effectiveFlashSaleInfo = bestCategoryDealInfo;
                // console.log(`     [PriceHelper] -> Ưu đãi Danh mục tốt nhất cho giá BẰNG NHAU VÀ KHÔNG từ Item. Ưu tiên Danh mục. Giá hiệu quả: ${effectivePrice}`);
            }
        }
    }

    // Nếu sau tất cả, vẫn không có effectivePrice (nghĩa là không có FlashSaleItem hoạt động
    // và cũng không có Category Deal nào tốt hơn giá mặc định/gốc),
    // thì gán effectivePrice là giá mặc định của SKU.
    if (!effectivePrice) {
        effectivePrice = rawDefaultSkuPrice;
    }

    // Nếu FlashSaleItem ban đầu đã hết suất, ghi đè effectiveFlashSaleInfo để phản ánh trạng thái này
    if (isCurrentFlashSaleItemSoldOut && bestFsItemForSku) {
        effectiveFlashSaleInfo = {
            quantity: bestFsItemForSku.quantity,
            soldQuantity: bestFsItemForSku.soldQuantity,
            endTime: bestFsItemForSku.flashSaleEndTime,
            type: 'item', // Vẫn là type item, nhưng đã hết suất
            flashSaleId: bestFsItemForSku.flashSaleId,
            isSoldOut: true // Cờ báo hiệu đã hết hàng
        };
    }


    // Tính toán discount phần trăm dựa trên giá cuối cùng và giá gốc ban đầu của SKU
    const discount = (displayOriginalPrice > effectivePrice && displayOriginalPrice > 0)
        ? Math.round(100 - (effectivePrice * 100) / displayOriginalPrice)
        : 0;

    return {
        price: effectivePrice, // Giá đã xử lý cuối cùng
        salePrice: effectivePrice, // Tên khác cho giá đã xử lý (để tương thích)
        originalPrice: displayOriginalPrice, // Giá gốc để hiển thị gạch ngang (có thể là originalPrice hoặc price từ DB)
        flashSaleInfo: effectiveFlashSaleInfo, // Thông tin flash sale nào đã áp dụng
        discount: discount,
        // hasDeal chỉ là true nếu có flashSaleInfo VÀ flashSaleInfo đó KHÔNG bị isSoldOut
        hasDeal: effectiveFlashSaleInfo !== null && effectiveFlashSaleInfo.flashSaleId !== undefined && !effectiveFlashSaleInfo.isSoldOut
    };
};

module.exports = {
    processSkuPrices,
};