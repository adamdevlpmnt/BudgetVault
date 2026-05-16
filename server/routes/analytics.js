const express = require('express');
const { db } = require('../config/db');
const { getCycleKey } = require('./expenses');

const router = express.Router();

function getCycleDates(startDay, cycleKey) {
  const [year, month] = cycleKey.split('-').map(Number);
  const startDate = new Date(year, month - 1, startDay);
  const endDate = new Date(year, month, startDay - 1);
  return {
    startDate: startDate.toISOString().split('T')[0],
    endDate: endDate.toISOString().split('T')[0]
  };
}

function getCurrentCycleKey(startDay) {
  const today = new Date();
  return getCycleKey(today.toISOString().split('T')[0], startDay);
}

router.get('/summary', (req, res) => {
  try {
    const user = db.prepare('SELECT cycle_start_day FROM users WHERE id = ?').get(req.userId);
    const cycleKey = req.query.cycle || getCurrentCycleKey(user.cycle_start_day);
    const { startDate, endDate } = getCycleDates(user.cycle_start_day, cycleKey);

    const expenses = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?'
    ).get(req.userId, startDate, endDate);

    const budget = db.prepare('SELECT balance FROM budget WHERE user_id = ?').get(req.userId);
    const expenseCount = db.prepare(
      'SELECT COUNT(*) as count FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?'
    ).get(req.userId, startDate, endDate);

    const todayStr = new Date().toISOString().split('T')[0];
    const todayExpenses = db.prepare(
      'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date = ?'
    ).get(req.userId, todayStr);

    res.json({
      cycleKey, startDate, endDate,
      balance: budget?.balance || 0,
      totalExpenses: expenses.total,
      expenseCount: expenseCount.count,
      todayExpenses: todayExpenses.total,
      avgDaily: expenseCount.count > 0 ? expenses.total / Math.max(1, Math.ceil((new Date(endDate) - new Date(startDate)) / 86400000)) : 0
    });
  } catch (err) {
    console.error('Analytics summary error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/by-category', (req, res) => {
  try {
    const user = db.prepare('SELECT cycle_start_day FROM users WHERE id = ?').get(req.userId);
    const { startDate, endDate } = req.query.startDate && req.query.endDate
      ? { startDate: req.query.startDate, endDate: req.query.endDate }
      : getCycleDates(user.cycle_start_day, req.query.cycle || getCurrentCycleKey(user.cycle_start_day));

    const data = db.prepare(
      `SELECT c.id, c.name, c.color, c.icon, COALESCE(SUM(e.amount), 0) as total, COUNT(e.id) as count
       FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.user_id = ? AND e.date >= ? AND e.date <= ?
       GROUP BY COALESCE(c.id, 0) ORDER BY total DESC`
    ).all(req.userId, startDate, endDate);

    const grandTotal = data.reduce((s, d) => s + d.total, 0);
    const result = data.map(d => ({
      ...d, name: d.name || 'Sans catégorie', color: d.color || '#64748b',
      icon: d.icon || 'help-circle', percentage: grandTotal > 0 ? ((d.total / grandTotal) * 100).toFixed(1) : 0
    }));

    res.json({ categories: result, total: grandTotal, startDate, endDate });
  } catch (err) {
    console.error('Analytics by-category error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/history', (req, res) => {
  try {
    const user = db.prepare('SELECT cycle_start_day FROM users WHERE id = ?').get(req.userId);
    const limit = parseInt(req.query.limit) || 12;
    const today = new Date();
    const history = [];

    for (let i = 0; i < limit; i++) {
      const d = new Date(today.getFullYear(), today.getMonth() - i, 1);
      const key = getCycleKey(
        new Date(d.getFullYear(), d.getMonth(), user.cycle_start_day).toISOString().split('T')[0],
        user.cycle_start_day
      );
      const { startDate, endDate } = getCycleDates(user.cycle_start_day, key);

      const expenses = db.prepare(
        'SELECT COALESCE(SUM(amount), 0) as total FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?'
      ).get(req.userId, startDate, endDate);

      if (expenses.total > 0 || i < 3) {
        history.push({ cycleKey: key, startDate, endDate, totalExpenses: expenses.total });
      }
    }

    res.json(history);
  } catch (err) {
    console.error('Analytics history error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.get('/daily', (req, res) => {
  try {
    const user = db.prepare('SELECT cycle_start_day FROM users WHERE id = ?').get(req.userId);
    const { startDate, endDate } = req.query.startDate && req.query.endDate
      ? { startDate: req.query.startDate, endDate: req.query.endDate }
      : getCycleDates(user.cycle_start_day, req.query.cycle || getCurrentCycleKey(user.cycle_start_day));

    const data = db.prepare(
      `SELECT date, SUM(amount) as total, COUNT(*) as count
       FROM expenses WHERE user_id = ? AND date >= ? AND date <= ?
       GROUP BY date ORDER BY date ASC`
    ).all(req.userId, startDate, endDate);

    res.json({ daily: data, startDate, endDate });
  } catch (err) {
    console.error('Analytics daily error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
