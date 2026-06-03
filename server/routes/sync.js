const express = require('express');
const { db } = require('../config/db');
const { getCycleKey } = require('./expenses');

const router = express.Router();

/**
 * GET /api/sync
 * Pull changes from server since a given timestamp
 * Query params: since (ISO timestamp), fullSync (boolean)
 */
router.get('/', (req, res) => {
  try {
    const { since, fullSync } = req.query;
    const userId = req.userId;
    const serverTimestamp = new Date().toISOString();

    if (fullSync === 'true' || !since) {
      // Full sync — return everything (not soft-deleted)
      const expenses = db.prepare(
        `SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon
         FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
         WHERE e.user_id = ? AND e.deleted_at IS NULL
         ORDER BY e.date DESC, e.created_at DESC`
      ).all(userId);

      const categories = db.prepare(
        'SELECT * FROM categories WHERE user_id = ? AND deleted_at IS NULL ORDER BY sort_order ASC, name ASC'
      ).all(userId);

      const recurring = db.prepare(
        `SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
         FROM recurring r LEFT JOIN categories c ON r.category_id = c.id
         WHERE r.user_id = ? AND r.deleted_at IS NULL ORDER BY r.type ASC, r.day_of_month ASC`
      ).all(userId);

      const budget = db.prepare('SELECT * FROM budget WHERE user_id = ?').get(userId);

      return res.json({
        expenses,
        categories,
        recurring,
        budget: budget || { balance: 0 },
        serverTimestamp,
        fullSync: true,
      });
    }

    // Incremental sync — return only records modified since 'since'
    // Include soft-deleted records so client can remove them
    const expenses = db.prepare(
      `SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon
       FROM expenses e LEFT JOIN categories c ON e.category_id = c.id
       WHERE e.user_id = ? AND e.updated_at > ?
       ORDER BY e.date DESC, e.created_at DESC`
    ).all(userId, since);

    const categories = db.prepare(
      'SELECT * FROM categories WHERE user_id = ? AND updated_at > ? ORDER BY sort_order ASC, name ASC'
    ).all(userId, since);

    const recurring = db.prepare(
      `SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
       FROM recurring r LEFT JOIN categories c ON r.category_id = c.id
       WHERE r.user_id = ? AND r.updated_at > ? ORDER BY r.type ASC, r.day_of_month ASC`
    ).all(userId, since);

    const budget = db.prepare(
      'SELECT * FROM budget WHERE user_id = ? AND updated_at > ?'
    ).get(userId, since);

    res.json({
      expenses,
      categories,
      recurring,
      budget: budget || null,
      serverTimestamp,
      fullSync: false,
    });
  } catch (err) {
    console.error('Sync pull error:', err);
    res.status(500).json({ error: 'Erreur de synchronisation' });
  }
});

/**
 * POST /api/sync
 * Push local changes to server
 * Body: { operations: [{ type, entity, data, clientTimestamp, tempId? }] }
 */
router.post('/', (req, res) => {
  try {
    const { operations } = req.body;
    const userId = req.userId;

    if (!operations || !Array.isArray(operations)) {
      return res.status(400).json({ error: 'Operations requises' });
    }

    const results = [];

    const processSyncOperations = db.transaction(() => {
      for (const op of operations) {
        try {
          const result = processOperation(op, userId);
          results.push(result);
        } catch (opErr) {
          console.error(`Sync operation error [${op.type} ${op.entity}]:`, opErr);
          results.push({
            tempId: op.tempId || null,
            entity: op.entity,
            type: op.type,
            status: 'error',
            error: opErr.message || 'Erreur opération',
          });
        }
      }
    });

    processSyncOperations();

    const serverTimestamp = new Date().toISOString();
    res.json({ results, serverTimestamp });
  } catch (err) {
    console.error('Sync push error:', err);
    res.status(500).json({ error: 'Erreur de synchronisation' });
  }
});

/**
 * Process a single sync operation
 */
function processOperation(op, userId) {
  const { type, entity, data, clientTimestamp, tempId } = op;

  switch (entity) {
    case 'expense':
      return processExpenseOp(type, data, userId, clientTimestamp, tempId);
    case 'category':
      return processCategoryOp(type, data, userId, clientTimestamp, tempId);
    case 'recurring':
      return processRecurringOp(type, data, userId, clientTimestamp, tempId);
    case 'budget':
      return processBudgetOp(type, data, userId, clientTimestamp, tempId);
    default:
      return { tempId, entity, type, status: 'error', error: `Entité inconnue: ${entity}` };
  }
}

function processExpenseOp(type, data, userId, clientTimestamp, tempId) {
  switch (type) {
    case 'create': {
      const user = db.prepare('SELECT cycle_start_day FROM users WHERE id = ?').get(userId);
      const cycleKey = getCycleKey(data.date, user.cycle_start_day);
      const entryType = data.type === 'income' ? 'income' : 'expense';
      const numAmount = parseFloat(data.amount);

      const result = db.prepare(
        `INSERT INTO expenses (user_id, category_id, amount, description, note, date, receipt_image, cycle_key, type, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
      ).run(
        userId, data.categoryId || null, numAmount,
        data.description || '', data.note || '', data.date,
        data.receiptImage || null, cycleKey, entryType
      );

      // Adjust balance
      if (entryType === 'income') {
        db.prepare('UPDATE budget SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(numAmount, userId);
      } else {
        db.prepare('UPDATE budget SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(numAmount, userId);
      }

      const expense = db.prepare(
        'SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.id = ?'
      ).get(result.lastInsertRowid);

      return { tempId, entity: 'expense', type: 'create', status: 'ok', serverId: expense.id, data: expense };
    }

    case 'update': {
      const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(data.id, userId);
      if (!existing) {
        return { tempId, entity: 'expense', type: 'update', status: 'not_found' };
      }

      // Conflict check: if server version is newer, server wins
      if (clientTimestamp && existing.updated_at && existing.updated_at > clientTimestamp) {
        const current = db.prepare(
          'SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.id = ?'
        ).get(data.id);
        return { tempId, entity: 'expense', type: 'update', status: 'conflict', data: current };
      }

      const entryType = existing.type || 'expense';
      const newAmount = data.amount !== undefined ? parseFloat(data.amount) : existing.amount;
      const amountDiff = newAmount - existing.amount;

      const user = db.prepare('SELECT cycle_start_day FROM users WHERE id = ?').get(userId);
      const newDate = data.date || existing.date;
      const cycleKey = getCycleKey(newDate, user.cycle_start_day);

      db.prepare(
        `UPDATE expenses SET amount=?, description=?, note=?, date=?, category_id=?, receipt_image=?, cycle_key=?, updated_at=datetime('now')
         WHERE id=? AND user_id=?`
      ).run(
        newAmount,
        data.description !== undefined ? data.description : existing.description,
        data.note !== undefined ? data.note : existing.note,
        newDate,
        data.categoryId !== undefined ? data.categoryId : existing.category_id,
        data.receiptImage !== undefined ? data.receiptImage : existing.receipt_image,
        cycleKey, data.id, userId
      );

      if (amountDiff !== 0) {
        if (entryType === 'income') {
          db.prepare('UPDATE budget SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(amountDiff, userId);
        } else {
          db.prepare('UPDATE budget SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(amountDiff, userId);
        }
      }

      const expense = db.prepare(
        'SELECT e.*, c.name as category_name, c.color as category_color, c.icon as category_icon FROM expenses e LEFT JOIN categories c ON e.category_id = c.id WHERE e.id = ?'
      ).get(data.id);

      return { tempId, entity: 'expense', type: 'update', status: 'ok', data: expense };
    }

    case 'delete': {
      const existing = db.prepare('SELECT * FROM expenses WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(data.id, userId);
      if (!existing) {
        return { tempId, entity: 'expense', type: 'delete', status: 'ok' }; // Already deleted = OK
      }

      db.prepare("UPDATE expenses SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(data.id, userId);

      const entryType = existing.type || 'expense';
      if (entryType === 'income') {
        db.prepare('UPDATE budget SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(existing.amount, userId);
      } else {
        db.prepare('UPDATE budget SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?').run(existing.amount, userId);
      }

      return { tempId, entity: 'expense', type: 'delete', status: 'ok' };
    }

    default:
      return { tempId, entity: 'expense', type, status: 'error', error: `Type inconnu: ${type}` };
  }
}

function processCategoryOp(type, data, userId, clientTimestamp, tempId) {
  switch (type) {
    case 'create': {
      const maxOrder = db.prepare('SELECT MAX(sort_order) as max FROM categories WHERE user_id = ?').get(userId);
      const result = db.prepare(
        "INSERT INTO categories (user_id, name, color, icon, custom_icon_path, sort_order, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
      ).run(
        userId, (data.name || '').trim(), data.color || '#6366f1',
        data.icon || 'tag', data.customIconPath || null, (maxOrder?.max || 0) + 1
      );
      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(result.lastInsertRowid);
      return { tempId, entity: 'category', type: 'create', status: 'ok', serverId: category.id, data: category };
    }

    case 'update': {
      const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(data.id, userId);
      if (!existing) return { tempId, entity: 'category', type: 'update', status: 'not_found' };

      if (clientTimestamp && existing.updated_at && existing.updated_at > clientTimestamp) {
        return { tempId, entity: 'category', type: 'update', status: 'conflict', data: existing };
      }

      db.prepare(
        `UPDATE categories SET name=?, color=?, icon=?, custom_icon_path=?, sort_order=?, updated_at=datetime('now')
         WHERE id=? AND user_id=?`
      ).run(
        data.name !== undefined ? (data.name || '').trim() : existing.name,
        data.color !== undefined ? data.color : existing.color,
        data.icon !== undefined ? data.icon : existing.icon,
        data.customIconPath !== undefined ? data.customIconPath : existing.custom_icon_path,
        data.sortOrder !== undefined ? data.sortOrder : existing.sort_order,
        data.id, userId
      );

      const category = db.prepare('SELECT * FROM categories WHERE id = ?').get(data.id);
      return { tempId, entity: 'category', type: 'update', status: 'ok', data: category };
    }

    case 'delete': {
      const existing = db.prepare('SELECT * FROM categories WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(data.id, userId);
      if (!existing) return { tempId, entity: 'category', type: 'delete', status: 'ok' };

      db.prepare("UPDATE categories SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(data.id, userId);
      return { tempId, entity: 'category', type: 'delete', status: 'ok' };
    }

    default:
      return { tempId, entity: 'category', type, status: 'error', error: `Type inconnu: ${type}` };
  }
}

function processRecurringOp(type, data, userId, clientTimestamp, tempId) {
  switch (type) {
    case 'create': {
      const result = db.prepare(
        "INSERT INTO recurring (user_id, type, amount, description, category_id, day_of_month, updated_at) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))"
      ).run(userId, data.type, parseFloat(data.amount), (data.description || '').trim(), data.categoryId || null, data.dayOfMonth);
      const item = db.prepare(
        `SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
         FROM recurring r LEFT JOIN categories c ON r.category_id = c.id WHERE r.id = ?`
      ).get(result.lastInsertRowid);
      return { tempId, entity: 'recurring', type: 'create', status: 'ok', serverId: item.id, data: item };
    }

    case 'update': {
      const existing = db.prepare('SELECT * FROM recurring WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(data.id, userId);
      if (!existing) return { tempId, entity: 'recurring', type: 'update', status: 'not_found' };

      if (clientTimestamp && existing.updated_at && existing.updated_at > clientTimestamp) {
        const current = db.prepare(
          `SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
           FROM recurring r LEFT JOIN categories c ON r.category_id = c.id WHERE r.id = ?`
        ).get(data.id);
        return { tempId, entity: 'recurring', type: 'update', status: 'conflict', data: current };
      }

      db.prepare(
        `UPDATE recurring SET type=?, amount=?, description=?, category_id=?, day_of_month=?, is_active=?, updated_at=datetime('now') WHERE id=? AND user_id=?`
      ).run(
        data.type || existing.type,
        data.amount ? parseFloat(data.amount) : existing.amount,
        data.description !== undefined ? (data.description || '').trim() : existing.description,
        data.categoryId !== undefined ? data.categoryId : existing.category_id,
        data.dayOfMonth || existing.day_of_month,
        data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.is_active,
        data.id, userId
      );

      const item = db.prepare(
        `SELECT r.*, c.name as category_name, c.color as category_color, c.icon as category_icon
         FROM recurring r LEFT JOIN categories c ON r.category_id = c.id WHERE r.id = ?`
      ).get(data.id);
      return { tempId, entity: 'recurring', type: 'update', status: 'ok', data: item };
    }

    case 'delete': {
      const existing = db.prepare('SELECT * FROM recurring WHERE id = ? AND user_id = ? AND deleted_at IS NULL').get(data.id, userId);
      if (!existing) return { tempId, entity: 'recurring', type: 'delete', status: 'ok' };
      db.prepare("UPDATE recurring SET deleted_at = datetime('now'), updated_at = datetime('now') WHERE id = ? AND user_id = ?").run(data.id, userId);
      return { tempId, entity: 'recurring', type: 'delete', status: 'ok' };
    }

    default:
      return { tempId, entity: 'recurring', type, status: 'error', error: `Type inconnu: ${type}` };
  }
}

function processBudgetOp(type, data, userId, clientTimestamp, tempId) {
  if (type !== 'update') {
    return { tempId, entity: 'budget', type, status: 'error', error: 'Seule la mise à jour est supportée pour le budget' };
  }

  const existing = db.prepare('SELECT * FROM budget WHERE user_id = ?').get(userId);
  if (clientTimestamp && existing && existing.updated_at && existing.updated_at > clientTimestamp) {
    return { tempId, entity: 'budget', type: 'update', status: 'conflict', data: existing };
  }

  if (existing) {
    db.prepare('UPDATE budget SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
      .run(parseFloat(data.balance), userId);
  } else {
    db.prepare('INSERT INTO budget (user_id, balance) VALUES (?, ?)').run(userId, parseFloat(data.balance));
  }

  const budget = db.prepare('SELECT * FROM budget WHERE user_id = ?').get(userId);
  return { tempId, entity: 'budget', type: 'update', status: 'ok', data: budget };
}

module.exports = router;
