const { User, MembershipTier } = require("../../models");
const { Op } = require("sequelize");

class MembershipController {
  /**
   * Trả về thông tin hội viên của người dùng
   * @route GET /api/membership/:userId
   */
  static async getMembershipInfo(req, res) {
 
  const userId = req.user?.id; // 👈 fix ở đây

  if (!userId) {
    return res.status(401).json({ message: "Chưa đăng nhập" });
  }

  try {
    const user = await User.findByPk(userId, {
      include: [
        {
          model: MembershipTier,
          as: "membershipTier",
        },
      ],
    });

    if (!user) {
      return res.status(404).json({ message: "Không tìm thấy người dùng" });
    }

    const allTiers = await MembershipTier.findAll({
      order: [["priority", "ASC"]],
    });

    const currentTier = user.membershipTier;
    const nextTier = allTiers.find((tier) => tier.priority > (currentTier?.priority || 0));

    const nextTierProgress = nextTier
      ? {
          name: nextTier.name,
          minSpent: nextTier.minSpent,
          minOrders: nextTier.minOrders,
          remainingSpent: Math.max(0, nextTier.minSpent - user.totalSpent),
          remainingOrders: Math.max(0, nextTier.minOrders - user.totalOrders),
        }
      : null;

    return res.status(200).json({
      userId: user.id,
      currentTier: currentTier
        ? {
            id: currentTier.id,
            name: currentTier.name,
            discountPercent: currentTier.discountPercent,
            pointBonusRate: currentTier.pointBonusRate,
            expireInMonths: currentTier.expireInMonths,
          }
        : null,
      tierGrantedAt: user.tierGrantedAt,
      tierExpireAt: user.tierExpireAt,
      totalSpent: user.totalSpent,
      totalOrders: user.totalOrders,
      nextTier: nextTierProgress,
      allTiers: allTiers.map((tier) => ({
        id: tier.id,
        name: tier.name,
        minSpent: tier.minSpent,
        minOrders: tier.minOrders,
        discountPercent: tier.discountPercent,
        pointBonusRate: tier.pointBonusRate,
      })),
    });
  } catch (err) {
    console.error("❌ getMembershipInfo error:", err);
    return res.status(500).json({ message: "Lỗi khi lấy thông tin hội viên" });
  }
}

}

module.exports = MembershipController;
