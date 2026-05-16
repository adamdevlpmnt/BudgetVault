const express = require('express');
const { db } = require('../config/db');

const router = express.Router();

router.get('/', (req, res) => {
  try {
    const recurring = db.prepare(
      `SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
       FROM recurring r LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.user_id = ? ORDER BY r.type ASC, r.day_of_month ASC`
    ).all(req.userId);
    res.json(recurring);
  } catch (err) {
    console.error('Get recurring error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.post('/', (req, res) => {
  try {
    const { type, amount, description, categoryId, dayOfMonth } = req.body;
    if (!type || !['income', 'expense'].includes(type)) return res.status(400).json({ error: 'Type invalide' });
    if (!amount || parseFloat(amount) <= 0) return res.status(400).json({ error: 'Montant invalide' });
    if (!description) return res.status(400).json({ error: 'Description requise' });
    if (!dayOfMonth || dayOfMonth < 1 || dayOfMonth > 28) return res.status(400).json({ error: 'Jour invalide (1-28)' });

    const result = db.prepare(
      'INSERT INTO recurring (user_id, type, amount, description, category_id, day_of_month) VALUES (?, ?, ?, ?, ?, ?)'
    ).run(req.userId, type, parseFloat(amount), description.trim(), categoryId || null, dayOfMonth);

    const item = db.prepare(
      `SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
       FROM recurring r LEFT JOIN categories c ON r.category_id = c.id WHERE r.id = ?`
    ).get(result.lastInsertRowid);
    res.status(201).json(item);
  } catch (err) {
    console.error('Create recurring error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.put('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const { type, amount, description, categoryId, dayOfMonth, isActive } = req.body;
    const existing = db.prepare('SELECT * FROM recurring WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Non trouvé' });

    db.prepare(
      `UPDATE recurring SET type=?, amount=?, description=?, category_id=?, day_of_month=?, is_active=? WHERE id=? AND user_id=?`
    ).run(
      type || existing.type, amount ? parseFloat(amount) : existing.amount,
      description !== undefined ? description.trim() : existing.description,
      categoryId !== undefined ? categoryId : existing.category_id,
      dayOfMonth || existing.day_of_month, isActive !== undefined ? (isActive ? 1 : 0) : existing.is_active,
      id, req.userId
    );

    const item = db.prepare(
      `SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
       FROM recurring r LEFT JOIN categories c ON r.category_id = c.id WHERE r.id = ?`
    ).get(id);
    res.json(item);
  } catch (err) {
    console.error('Update recurring error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

router.delete('/:id', (req, res) => {
  try {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM recurring WHERE id = ? AND user_id = ?').get(id, req.userId);
    if (!existing) return res.status(404).json({ error: 'Non trouvé' });
    db.prepare('DELETE FROM recurring WHERE id = ? AND user_id = ?').run(id, req.userId);
    res.json({ message: 'Supprimé' });
  } catch (err) {
    console.error('Delete recurring error:', err);
    res.status(500).json({ error: 'Erreur serveur' });
  }
});

module.exports = router;
