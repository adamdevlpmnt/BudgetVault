require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const path = require('path');

const { initDatabase, UPLOADS_DIR } = require('./config/db');
const { authMiddleware } = require('./middleware/auth');
const { apiLimiter } = require('./middleware/rateLimiter');
const { startScheduler } = require('./services/recurringService');

// Initialize database
initDatabase();

const app = express();
const PORT = process.env.PORT || 3001;

// Security & compression middleware
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));
app.use(compression());
app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Rate limiting on all API routes
app.use('/api', apiLimiter);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth routes — login is public, other auth routes require auth middleware
const authRouter = require('./routes/auth');

// Public auth route (login)
app.post('/api/auth/login', (req, res, next) => {
  req.url = '/login';
  authRouter(req, res, next);
});

// Protected auth routes
app.post('/api/auth/change-password', authMiddleware, (req, res, next) => {
  req.url = '/change-password';
  authRouter(req, res, next);
});
app.get('/api/auth/me', authMiddleware, (req, res, next) => {
  req.url = '/me';
  authRouter(req, res, next);
});
app.put('/api/auth/settings', authMiddleware, (req, res, next) => {
  req.url = '/settings';
  authRouter(req, res, next);
});

// Protected API routes
app.use('/api/budget', authMiddleware, require('./routes/budget'));
app.use('/api/expenses', authMiddleware, require('./routes/expenses'));
app.use('/api/categories', authMiddleware, require('./routes/categories'));
app.use('/api/recurring', authMiddleware, require('./routes/recurring'));
app.use('/api/analytics', authMiddleware, require('./routes/analytics'));
app.use('/api/upload', authMiddleware, require('./routes/upload'));
app.use('/api/push', authMiddleware, require('./routes/push'));

// Serve uploaded files
app.use('/uploads', express.static(UPLOADS_DIR));

// Serve React build in production
const clientBuildPath = path.join(__dirname, '..', 'client', 'dist');
app.use(express.static(clientBuildPath));
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api') && !req.path.startsWith('/uploads')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  }
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Fichier trop volumineux (max 5MB)' });
  }
  if (err.message && err.message.includes('Type de fichier')) {
    return res.status(400).json({ error: err.message });
  }
  res.status(500).json({ error: 'Erreur serveur interne' });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🏦 BudgetVault Server running on port ${PORT}`);
  console.log(`📊 http://localhost:${PORT}\n`);
  startScheduler();
});
