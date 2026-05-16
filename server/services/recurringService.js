const cron = require('node-cron');
const { db } = require('../config/db');
const { getCycleKey } = require('../routes/expenses');

/**
 * Process recurring transactions for all users
 * Runs daily to check if any recurring items need to be applied
 */
function processRecurring() {
  const today = new Date();
  const dayOfMonth = today.getDate();
  const todayStr = today.toISOString().split('T')[0];

  const items = db.prepare(
    'SELECT r.*, u.cycle_start_day FROM recurring r JOIN users u ON r.user_id = u.id WHERE r.is_active = 1 AND r.day_of_month = ? AND (r.last_applied IS NULL OR r.last_applied < ?)'
  ).all(dayOfMonth, todayStr);

  for (const item of items) {
    try {
      if (item.type === 'income') {
        db.prepare('UPDATE budget SET balance = balance + ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
          .run(item.amount, item.user_id);
      } else {
        const cycleKey = getCycleKey(todayStr, item.cycle_start_day);
        db.prepare(
          'INSERT INTO expenses (user_id, category_id, amount, description, date, cycle_key) VALUES (?, ?, ?, ?, ?, ?)'
        ).run(item.user_id, item.category_id, item.amount, `[Auto] ${item.description}`, todayStr, cycleKey);

        db.prepare('UPDATE budget SET balance = balance - ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ?')
          .run(item.amount, item.user_id);
      }

      db.prepare('UPDATE recurring SET last_applied = ? WHERE id = ?').run(todayStr, item.id);
      console.log(`✅ Recurring applied: ${item.type} ${item.amount}€ for user ${item.user_id}`);
    } catch (err) {
      console.error(`❌ Recurring error for item ${item.id}:`, err);
    }
  }
}

/**
 * Send daily reminder push notification at 20:00
 */
function sendDailyReminder() {
  const webpush = require('web-push');
  const vapidPublic = process.env.VAPID_PUBLIC_KEY || '';
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY || '';
  if (!vapidPublic || !vapidPrivate) return;

  webpush.setVapidDetails(process.env.VAPID_EMAIL || 'mailto:admin@budgetvault.local', vapidPublic, vapidPrivate);

  const subs = db.prepare('SELECT * FROM push_subscriptions').all();
  const payload = JSON.stringify({
    title: '💰 BudgetVault',
    body: 'N\'oubliez pas d\'ajouter vos dépenses du jour !',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: 'daily-reminder'
  });

  for (const sub of subs) {
    try {
      webpush.sendNotification(JSON.parse(sub.subscription), payload).catch(() => {
        db.prepare('DELETE FROM push_subscriptions WHERE id = ?').run(sub.id);
      });
    } catch (err) { /* subscription invalid, will be cleaned up */ }
  }
}

function startScheduler() {
  // Process recurring transactions daily at 00:05
  cron.schedule('5 0 * * *', () => {
    console.log('🔄 Processing recurring transactions...');
    processRecurring();
  });

  // Send daily reminder at 20:00
  cron.schedule('0 20 * * *', () => {
    console.log('🔔 Sending daily reminders...');
    sendDailyReminder();
  });

  // Also run recurring check on startup (for missed days)
  processRecurring();

  console.log('⏰ Scheduler started (recurring: 00:05, reminders: 20:00)');
}

module.exports = { startScheduler, processRecurring };
