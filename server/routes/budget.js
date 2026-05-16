const express = require('express');
const { db } = require('../config/db');

const router = express.Router();

/**
 * GET /api/budget
 * Get current balance
 */
router.get('/', (req, res) => {
  try {
    let budget = db.prepare('SELECT * FROM budget WHERE user_id = ?').get(req.userId);

    if (!budget) {
      db.prepare('INSERT INTO budget (user_id, balance) VALUES (?, 0)').run(req.userId);
      budget = { balance: 0 };
    }

    res.json({ balance: budget.balance, updatedAt: budget.updated_at });
  } catch (err) {
    console.error('Get budget error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

/**
 * PUT /api/budget
 * Update account balance
 */
router.put('/', (req, res) => {
  try {
    const { balance } = req.body;

    if (balance === undefined || balance === null || isNaN(parseFloat(balance))) {
      return res.status(400).json({ error: 'Montant invalide' });
    }

    const numBalance = parseFloat(balance);

    const existing = db.prepare('SELECT id FROM budget WHERE user_id = ?').get(req.userId);

    if (existing) {
      db.prepare('UPDATE budget SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
        .run(numBalance, req.userId);
    } else {
      db.prepare('INSERT INTO budget (user_id, balance) VALUES (?, ?)')
        .run(req.userId, numBalance);
    }

    res.json({ balance: numBalance });
  } catch (err) {
    console.error('Update budget error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
