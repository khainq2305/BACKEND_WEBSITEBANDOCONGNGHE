const { HomeSection, HomeSectionBanner, Product, Sku } = require('../../models'); // ✅ Thay đổi model import

class SectionClientController {
    static async getHomeSections(req, res) {
        try {
            const sections = await HomeSection.findAll({
                where: { isActive: true },
                order: [['orderIndex', 'ASC']],
                include: [
                    {
                        model: HomeSectionBanner,
                        as: 'banners',
                        attributes: ['id', 'imageUrl', 'linkType', 'linkValue', 'sortOrder'],
                        // Dùng separate: true để chạy câu query riêng cho banner, tránh nhân bản dữ liệu
                        separate: true, 
                        order: [['sortOrder', 'ASC']],
                    },
                    // ✅ THAY ĐỔI HOÀN TOÀN KHỐI INCLUDE DƯỚI ĐÂY
                    {
                        model: Product, // 1. Include thẳng vào Product
                        as: 'products', // 2. Dùng alias 'products' đã định nghĩa trong belongsToMany
                        required: false,
                        attributes: ['id', 'name', 'thumbnail', 'slug'],
                        // 3. Dùng 'through' để lấy các trường từ bảng trung gian
                        through: {
                            attributes: ['sortOrder'] // Lấy sortOrder từ bảng ProductHomeSection
                        },
                        include: [
                            {
                                // 4. Include Sku từ Product
                                model: Sku,
                                as: 'skus',
                                required: false,
                                attributes: [
                                    'id',
                                    'skuCode',
                                    'price', // Giờ đây Sku sẽ có giá của nó
                                    'originalPrice',
                                    'stock',
                                    
                                ],
                            }
                        ]
                    }
                ]
            });

            // Sắp xếp lại product trong mỗi section theo sortOrder từ bảng trung gian
            for (const section of sections) {
                if (section.products) {
                    section.products.sort((a, b) => {
                        return a.ProductHomeSection.sortOrder - b.ProductHomeSection.sortOrder;
                    });
                }
            }

            res.json({ success: true, data: sections });
        } catch (error) {
            console.error('[getHomeSections]', error);
            res.status(500).json({ success: false, message: 'Lỗi server', error: error.message });
        }
    }
}

module.exports = SectionClientController;