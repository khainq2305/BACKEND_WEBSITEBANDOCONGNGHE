const {
  Wishlist,
  WishlistItem,
  Product,
  Sku, 
} = require("../../models");

class WishlistController {
  static async getAll(req, res) {
    try {
      const userId = req.user.id;

      const wishlist = await Wishlist.findOne({
        where: { userId, isDefault: true },
        include: [
          {
            model: WishlistItem,
            as: "items",
            include: [
              {
                model: Product,
                as: "product", 
                attributes: ["id", "name", "thumbnail"],
                include: [
                  {
                    model: Sku,
                    as: "skus", 
                    attributes: ["id", "price", "originalPrice"],
                    required: false,
                  },
                ],
              },
            ],
          },
        ],
      });

      if (!wishlist) {
        return res.status(200).json([]); 
      }

      const result = wishlist.items.map((item) => ({
        id: item.id,
        productId: item.productId,
        product: item.product,
      }));

      res.json(result);
    } catch (err) {
      console.error("Lỗi lấy wishlist:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async add(req, res) {
    try {
      const userId = req.user.id;
      const productId = parseInt(req.params.productId);

      let wishlist = await Wishlist.findOne({
        where: { userId, isDefault: true },
      });
      if (!wishlist) {
        wishlist = await Wishlist.create({
          userId,
          name: "Danh sách yêu thích mặc định",
          isDefault: true,
        });
      }

      const exists = await WishlistItem.findOne({
        where: { wishlistId: wishlist.id, productId },
      });
      if (exists)
        return res
          .status(400)
          .json({ message: "Đã tồn tại trong danh sách yêu thích" });

      const item = await WishlistItem.create({
        wishlistId: wishlist.id,
        productId,
      });
      res.status(201).json(item);
    } catch (err) {
      console.error("Lỗi thêm wishlist:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }

  static async remove(req, res) {
    try {
      const userId = req.user.id;
      const productId = parseInt(req.params.productId);

      const wishlist = await Wishlist.findOne({
        where: { userId, isDefault: true },
      });
      if (!wishlist)
        return res
          .status(404)
          .json({ message: "Không tìm thấy danh sách yêu thích" });

      const deleted = await WishlistItem.destroy({
        where: { wishlistId: wishlist.id, productId },
      });
      if (deleted === 0)
        return res
          .status(404)
          .json({ message: "Không tìm thấy mục yêu thích" });

      res.json({ message: "Đã xóa khỏi yêu thích" });
    } catch (err) {
      console.error("Lỗi xoá wishlist:", err);
      res.status(500).json({ message: "Lỗi server" });
    }
  }
}

module.exports = WishlistController;
