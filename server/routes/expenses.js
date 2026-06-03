const express = require('express');
const { db } = require('../config/db');

const router = express.Router();

/**
 * Helper: get cycle key for a given date and start day
 */
function getCycleKey(date, startDay) {
  const d = new Date(date);
  let year = d.getFullYear();
  let month = d.getMonth() + 1; // 1-based

  // If current day is before the cycle start day, we're in the previous cycle
  if (d.getDate() < startDay) {
    month -= 1;
    if (month < 1) {
      month = 12;
      year -= 1;
    }
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * GET /api/expenses
 * List expenses with optional filters
 * Query params: cycle, startDate, endDate, categoryId, limit, offset
 */
router.get('/', (req, res) => {
  try {
    const { cycle, startDate, endDate, categoryId, limit = 50, offset = 0 } = req.query;

    let query = 'SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.user_id = ? AND e.deleted_at IS NULL';
    const params = [req.userId];

    if (cycle) {
      query += ' AND e.cycle_key = ?';
      params.push(cycle);
    }

    if (startDate) {
      query += ' AND e.date >= ?';
      params.push(startDate);
    }

    if (endDate) {
      query += ' AND e.date <= ?';
      params.push(endDate);
    }

    if (categoryId) {
      query += ' AND e.category_id = ?';
      params.push(parseInt(categoryId));
    }

    // Get total count for pagination
    const countQuery = query.replace('SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon FROM', 'SELECT COUNT(*) as total FROM');
    const { total } = db.prepare(countQuery).get(...params);

    query += ' ORDER BY e.date DESC, e.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

    const expenses = db.prepare(query).all(...params);

    res.json({ expenses, total, limit: parseInt(limit), offset: parseInt(offset) });
  } catch (err) {
    console.error('Get expenses error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * POST /api/expenses
 * Add a new expense (auto-deducts from balance)
 */
router.post('/', (req, res) => {
  try {
    const { amount, description, note, date, categoryId, receiptImage, type } = req.body;

    if (!amount || isNaN(parseFloat(amount)) || parseFloat(amount) <= 0) {
      return res.status(400).json({ error: 'Montant invalide' });
    }
    if (!date) {
      return res.status(400).json({ error: 'Date requise' });
    }

    const entryType = type === 'income' ? 'income' : 'expense';
    const numAmount = parseFloat(amount);

    // Get user's cycle start day
    const user = db.prepare('SELECT cycle_start_day FROM users WHERE id = ?').get(req.userId);
    const cycleKey = getCycleKey(date, user.cycle_start_day);

    const createExpenseTransaction = db.transaction(() => {
      const result = db.prepare(
        `INSERT INTO expenses (user_id, category_id, amount, description, note, date, receipt_image, cycle_key, type, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        req.userId,
        categoryId || null,
        numAmount,
        description || '',
        note || '',
        date,
        receiptImage || null,
        cycleKey,
        entryType
      );

      // Income adds to balance, expense deducts
      if (entryType === 'income') {
        db.prepare('UPDATE budget SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
          .run(numAmount, req.userId);
      } else {
        db.prepare('UPDATE budget SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
          .run(numAmount, req.userId);
      }

      return result;
    });

    const result = createExpenseTransaction();

    const expense = db.prepare(
      'SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.id = ?'
    ).get(result.lastInsertRowid);

    const budget = db.prepare('SELECT balance FROM budget WHERE user_id = ?').get(req.userId);

    res.status(201).json({ expense, newBalance: budget.balance });
  } catch (err) {
    console.error('Create expense error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /api/expenses/:id
 * Update an expense
 */
router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { amount, description, note, date, categoryId, receiptImage } = req.body;

    const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Entrée non trouvée' });
    }

    const entryType = existing.type || 'expense';
    const newAmount = amount !== undefined ? parseFloat(amount) : existing.amount;
    const amountDiff = newAmount - existing.amount;

    // Get user's cycle start day for cycle_key
    const user = db.prepare('SELECT cycle_start_day FROM users WHERE id = ?').get(req.userId);
    const newDate = date || existing.date;
    const cycleKey = getCycleKey(newDate, user.cycle_start_day);

    const updateExpenseTransaction = db.transaction(() => {
      db.prepare(
        `UPDATE expenses SET
          amount = ?, description = ?, note = ?, date = ?,
          category_id = ?, receipt_image = ?, cycle_key = ?,
          updated_at = datetime('now')
         WHERE id = ? AND user_id = ?`
      ).run(
        newAmount,
        description !== undefined ? description : existing.description,
        note !== undefined ? note : existing.note,
        newDate,
        categoryId !== undefined ? categoryId : existing.category_id,
        receiptImage !== undefined ? receiptImage : existing.receipt_image,
        cycleKey,
        id,
        req.userId
      );

      // Adjust balance if amount changed — income adds, expense deducts
      if (amountDiff !== 0) {
        if (entryType === 'income') {
          db.prepare('UPDATE budget SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
            .run(amountDiff, req.userId);
        } else {
          db.prepare('UPDATE budget SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
            .run(amountDiff, req.userId);
        }
      }
    });

    updateExpenseTransaction();

    const expense = db.prepare(
      'SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.id = ?'
    ).get(id);

    const budget = db.prepare('SELECT balance FROM budget WHERE user_id = ?').get(req.userId);

    res.json({ expense, newBalance: budget.balance });
  } catch (err) {
    console.error('Update expense error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * DELETE /api/expenses/:id
 * Delete an expense (restores balance)
 */
router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;

    const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(id, req.userId);
    if (!existing) {
      return res.status(404).json({ error: 'Entrée non trouvée' });
    }

    const deleteExpenseTransaction = db.transaction(() => {
      // Soft delete
      db.prepare(
        "UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?"
      ).run(id, req.userId);

      // Restore balance — reverse the original operation
      const entryType = existing.type || 'expense';
      if (entryType === 'income') {
        db.prepare('UPDATE budget SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
          .run(existing.amount, req.userId);
      } else {
        db.prepare('UPDATE budget SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
          .run(existing.amount, req.userId);
      }
    });

    deleteExpenseTransaction();

    const budget = db.prepare('SELECT balance FROM budget WHERE user_id = ?').get(req.userId);

    res.json({ message: 'Entrée supprimée', newBalance: budget.balance });
  } catch (err) {
    console.error('Delete expense error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
module.exports.getCycleKey = getCycleKey;
