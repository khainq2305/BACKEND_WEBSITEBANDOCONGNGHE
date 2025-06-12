// src/controllers/admin/paymentTransactionController.js

const { PaymentTransaction, Order, PaymentMethod, User } = require('../../../models');
const { Op } = require('sequelize');

class PaymentTransactionController {
  // GET /admin/payment-transactions
  static async getAll(req, res) {
    try {
      const { page = 1, limit = 10, search = '' } = req.query;
      const offset = (page - 1) * limit;

      const whereClause = {};
      if (search) {
        whereClause.transactionCode = { [Op.like]: `%${search}%` };
      }

      const { count, rows } = await PaymentTransaction.findAndCountAll({
        where: whereClause,
        include: [
          {
            model: Order,
            as: 'order',
            include: [{ model: User, attributes: ['fullName'], required: false }]
          },
          {
            model: PaymentMethod,
            as: 'method',
            attributes: ['name']
          }
        ],
        order: [['createdAt', 'DESC']],
        offset: parseInt(offset),
        limit: parseInt(limit)
      });

      const data = rows.map(trx => ({
        id: trx.id,
        code: trx.transactionCode,
        customer: trx.order?.User?.fullName || '—',
        amount: trx.amount,
        status: trx.status,
        method: trx.method?.name || '—',
        paymentTime: trx.paymentTime,
        createdAt: trx.createdAt
      }));

      return res.json({
        totalItems: count,
        totalPages: Math.ceil(count / limit),
        data
      });
    } catch (err) {
      console.error('Lỗi khi lấy danh sách giao dịch:', err);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }

  // GET /admin/payment-transactions/:id
  static async getById(req, res) {
    try {
      const { id } = req.params;

      const transaction = await PaymentTransaction.findByPk(id, {
        include: [
          {
            model: Order,
            as: 'order',
            include: [{ model: User, attributes: ['fullName', 'email', 'phone'] }]
          },
          {
            model: PaymentMethod,
            as: 'method'
          }
        ]
      });

      if (!transaction) {
        return res.status(404).json({ message: 'Không tìm thấy giao dịch' });
      }

      return res.json(transaction);
    } catch (err) {
      console.error('Lỗi khi lấy chi tiết giao dịch:', err);
      return res.status(500).json({ message: 'Lỗi server' });
    }
  }
}

module.exports = PaymentTransactionController;
