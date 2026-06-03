const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const fs = require('fs');

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'budget.db');
const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');

// Ensure data directories exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read/write performance
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

/**
 * Initialize database schema and seed default data
 */
function initDatabase() {
  db.exec(`
    -- Users table
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      display_name TEXT,
      cycle_start_day INTEGER DEFAULT 1 CHECK(cycle_start_day >= 1 AND cycle_start_day <= 28),
      currency TEXT DEFAULT 'EUR' CHECK(currency IN ('EUR', 'USD', 'DZD')),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Budget / account balance
    CREATE TABLE IF NOT EXISTS budget (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE,
      balance REAL NOT NULL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Categories
    CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL DEFAULT '#6366f1',
      icon TEXT DEFAULT 'tag',
      custom_icon_path TEXT,
      sort_order INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Expenses
    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      category_id INTEGER,
      amount REAL NOT NULL CHECK(amount > 0),
      description TEXT,
      note TEXT,
      date DATE NOT NULL,
      receipt_image TEXT,
      cycle_key TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    -- Recurring income/expenses
    CREATE TABLE IF NOT EXISTS recurring (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income', 'expense')),
      amount REAL NOT NULL CHECK(amount > 0),
      description TEXT NOT NULL,
      category_id INTEGER,
      day_of_month INTEGER NOT NULL CHECK(day_of_month >= 1 AND day_of_month <= 28),
      is_active INTEGER DEFAULT 1,
      last_applied DATE,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );

    -- Cycle history
    CREATE TABLE IF NOT EXISTS cycles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      cycle_key TEXT NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      starting_balance REAL,
      ending_balance REAL,
      total_income REAL DEFAULT 0,
      total_expenses REAL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      UNIQUE(user_id, cycle_key)
    );

    -- Push notification subscriptions
    CREATE TABLE IF NOT EXISTS push_subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      subscription TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    -- Create indexes for performance
    CREATE INDEX IF NOT EXISTS idx_expenses_user_date ON expenses(user_id, date);
    CREATE INDEX IF NOT EXISTS idx_expenses_cycle ON expenses(user_id, cycle_key);
    CREATE INDEX IF NOT EXISTS idx_expenses_category ON expenses(user_id, category_id);
    CREATE INDEX IF NOT EXISTS idx_recurring_user ON recurring(user_id);
    CREATE INDEX IF NOT EXISTS idx_cycles_user ON cycles(user_id, cycle_key);
  `);

  // Migration: add currency column if missing (for existing databases)
  try {
    db.prepare('SELECT currency FROM users LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE users ADD COLUMN currency TEXT DEFAULT \'EUR\'');
    console.log('✅ Migration: added currency column');
  }

  // Migration: add 'type' column to expenses table (income vs expense)
  try {
    db.prepare('SELECT type FROM expenses LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE expenses ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'");
    console.log('✅ Migration: added type column to expenses');
  }

  // Migration: rename 'Administrateur' display name to 'Adam'
  try {
    const adminUser = db.prepare('SELECT id, display_name FROM users WHERE username = ?').get('admin');
    if (adminUser && adminUser.display_name === 'Administrateur') {
      db.prepare('UPDATE users SET display_name = ? WHERE id = ?').run('Adam', adminUser.id);
      console.log('✅ Migration: renamed Administrateur to Adam');
    }
  } catch (e) {
    // Ignore if migration fails
  }

  // Migration: add updated_at column to expenses
  try {
    db.prepare('SELECT updated_at FROM expenses LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE expenses ADD COLUMN updated_at DATETIME");
    db.exec("UPDATE expenses SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL");
    console.log('✅ Migration: added updated_at column to expenses');
  }

  // Migration: add deleted_at column to expenses (soft-delete for sync)
  try {
    db.prepare('SELECT deleted_at FROM expenses LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE expenses ADD COLUMN deleted_at DATETIME');
    console.log('✅ Migration: added deleted_at column to expenses');
  }

  // Migration: add updated_at column to categories
  try {
    db.prepare('SELECT updated_at FROM categories LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE categories ADD COLUMN updated_at DATETIME");
    db.exec("UPDATE categories SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL");
    console.log('✅ Migration: added updated_at column to categories');
  }

  // Migration: add deleted_at column to categories (soft-delete for sync)
  try {
    db.prepare('SELECT deleted_at FROM categories LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE categories ADD COLUMN deleted_at DATETIME');
    console.log('✅ Migration: added deleted_at column to categories');
  }

  // Migration: add updated_at column to recurring
  try {
    db.prepare('SELECT updated_at FROM recurring LIMIT 1').get();
  } catch {
    db.exec("ALTER TABLE recurring ADD COLUMN updated_at DATETIME");
    db.exec("UPDATE recurring SET updated_at = COALESCE(created_at, datetime('now')) WHERE updated_at IS NULL");
    console.log('✅ Migration: added updated_at column to recurring');
  }

  // Migration: add deleted_at column to recurring (soft-delete for sync)
  try {
    db.prepare('SELECT deleted_at FROM recurring LIMIT 1').get();
  } catch {
    db.exec('ALTER TABLE recurring ADD COLUMN deleted_at DATETIME');
    console.log('✅ Migration: added deleted_at column to recurring');
  }

  // Create index for sync queries
  db.exec('CREATE INDEX IF NOT EXISTS idx_expenses_updated ON expenses(user_id, updated_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_categories_updated ON categories(user_id, updated_at)');
  db.exec('CREATE INDEX IF NOT EXISTS idx_recurring_updated ON recurring(user_id, updated_at)');

  // Seed default admin user if not exists
  const existingAdmin = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
  if (!existingAdmin) {
    const passwordHash = bcrypt.hashSync('adminadmin', 12);
    const insertUser = db.prepare(
      'INSERT INTO users (username, password_hash, display_name, cycle_start_day) VALUES (?, ?, ?, ?)'
    );
    const result = insertUser.run('admin', passwordHash, 'Adam', 1);
    const userId = result.lastInsertRowid;

    // Create initial budget record
    db.prepare('INSERT INTO budget (user_id, balance) VALUES (?, ?)').run(userId, 0);

    // Create default categories
    const insertCategory = db.prepare(
      'INSERT INTO categories (user_id, name, color, icon, sort_order) VALUES (?, ?, ?, ?, ?)'
    );
    const defaultCategories = [
      ['Alimentation', '#ef4444', 'shopping-cart', 1],
      ['Viande', '#b91c1c', 'beef', 2],
      ['Poisson', '#0ea5e9', 'fish', 3],
      ['Fruits & Légumes', '#22c55e', 'apple', 4],
      ['Transport', '#3b82f6', 'car', 5],
      ['Logement', '#8b5cf6', 'home', 6],
      ['Loisirs', '#f59e0b', 'gamepad-2', 7],
      ['Santé', '#10b981', 'heart-pulse', 8],
      ['Vêtements', '#ec4899', 'shirt', 9],
      ['Éducation', '#06b6d4', 'book-open', 10],
      ['Restauration', '#f97316', 'utensils', 11],
      ['Abonnements', '#6366f1', 'repeat', 12],
      ['Divers', '#64748b', 'package', 13],
    ];
    for (const [name, color, icon, order] of defaultCategories) {
      insertCategory.run(userId, name, color, icon, order);
    }

    console.log('✅ Default admin user created (admin / adminadmin)');
    console.log('✅ Default categories created');
  }
}

module.exports = { db, initDatabase, DATA_DIR, UPLOADS_DIR };
