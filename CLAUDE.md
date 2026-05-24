# 📘 CLAUDE.md — BudgetVault Project Documentation

## 🎯 Vision du Projet

**BudgetVault** est une application web de gestion de budget familial/personnel, conçue pour être :
- **Mobile-first** : optimisée pour smartphone avec navigation tactile
- **Auto-hébergée** : déployable en une commande Docker
- **Sécurisée** : authentification, chiffrement des mots de passe, rate limiting
- **Moderne** : interface premium avec dark mode, animations, graphiques interactifs
- **Simple** : maintenance minimale, backup = copier un fichier

---

## 🏛️ Architecture

### Stack Technique

| Composant | Technologie | Version | Justification |
|-----------|-------------|---------|---------------|
| Frontend | React + Vite | 18.x + 5.x | Écosystème le plus riche, PWA native |
| Backend | Express.js | 4.x | Battle-tested, même langage que le front |
| Database | SQLite | 3.x (better-sqlite3) | Embarqué, zero-config, backup trivial |
| Charts | Chart.js | 4.x (react-chartjs-2) | Canvas = perf mobile, bundle léger |
| Auth | JWT + bcrypt | - | Standard industrie, stateless |
| Push | web-push + SW | - | Standard W3C, compatible iOS 16.4+ |
| Images | Multer + Sharp | - | Upload + compression automatique |
| Icons | Lucide React | - | 1000+ icônes, tree-shakeable |
| CSS | Vanilla CSS | - | Contrôle total, pas de dépendance |
| Docker | Multi-stage | - | Build optimisé, image ~150MB |

### Ports

| Service | Port |
|---------|------|
| Application (prod) | 3001 |
| Vite dev server | 5173 |

### Architecture Container

```
┌─────────────────────────────────┐
│     Docker Container (:3001)    │
│                                 │
│  Express.js                     │
│  ├── /api/* → API REST          │
│  ├── /uploads/* → Images        │
│  └── /* → React SPA (static)   │
│                                 │
│  SQLite: /app/data/budget.db    │
│  Uploads: /app/data/uploads/    │
└─────────────────────────────────┘
```

---

## 📁 Structure des Dossiers

```
Vault/
├── CLAUDE.md              # Cette documentation
├── README.md              # Guide utilisateur
├── docker-compose.yml     # Déploiement
├── Dockerfile             # Build multi-stage
├── .dockerignore
├── .env.example           # Template variables d'environnement
├── client/                # Frontend React/Vite
│   ├── index.html
│   ├── vite.config.js
│   ├── package.json
│   ├── public/
│   │   ├── manifest.json  # PWA manifest
│   │   ├── sw.js          # Service Worker
│   │   └── icons/         # Icônes PWA
│   └── src/
│       ├── main.jsx       # Point d'entrée
│       ├── App.jsx        # Router + Layout
│       ├── index.css      # Styles globaux + design system
│       ├── components/    # Composants réutilisables
│       ├── pages/         # Pages/Vues
│       ├── context/       # React Context (auth)
│       ├── hooks/         # Custom hooks
│       └── utils/         # Utilitaires
├── server/                # Backend Express
│   ├── package.json
│   ├── index.js           # Point d'entrée serveur
│   ├── config/
│   │   └── db.js          # Init SQLite + migrations
│   ├── middleware/
│   │   ├── auth.js        # JWT verification
│   │   └── rateLimiter.js # Anti brute-force
│   ├── routes/            # API endpoints
│   ├── services/          # Business logic
│   └── utils/             # Utilitaires serveur
└── data/                  # Données persistées (volume Docker)
    ├── budget.db          # Base SQLite
    └── uploads/           # Images tickets de caisse
```

---

## 🗃️ Modèle de Données

### Table `users`
- `id` INTEGER PK — Identifiant unique
- `username` TEXT UNIQUE — Nom d'utilisateur
- `password_hash` TEXT — Hash bcrypt du mot de passe
- `display_name` TEXT — Nom affiché
- `cycle_start_day` INTEGER (1-28) — Jour de début du cycle mensuel
- `created_at` DATETIME — Date création
- `updated_at` DATETIME — Dernière modification

### Table `budget`
- `id` INTEGER PK
- `user_id` INTEGER FK → users
- `balance` REAL — Solde actuel du compte
- `updated_at` DATETIME

### Table `categories`
- `id` INTEGER PK
- `user_id` INTEGER FK → users
- `name` TEXT — Nom de la catégorie
- `color` TEXT — Code couleur hex
- `icon` TEXT — Nom d'icône Lucide
- `custom_icon_path` TEXT — Chemin icône uploadée
- `sort_order` INTEGER — Ordre d'affichage

### Table `expenses`
- `id` INTEGER PK
- `user_id` INTEGER FK → users
- `category_id` INTEGER FK → categories
- `amount` REAL — Montant
- `description` TEXT — Description
- `note` TEXT — Note optionnelle
- `date` DATE — Date de la dépense/revenu
- `receipt_image` TEXT — Chemin image ticket
- `cycle_key` TEXT — Clé du cycle (ex: "2026-05")
- `type` TEXT — 'income' ou 'expense' (défaut: 'expense')

### Table `recurring`
- `id` INTEGER PK
- `user_id` INTEGER FK → users
- `type` TEXT — 'income' ou 'expense'
- `amount` REAL — Montant
- `description` TEXT — Description
- `category_id` INTEGER FK → categories
- `day_of_month` INTEGER (1-28) — Jour d'application
- `is_active` INTEGER — Actif/Inactif
- `last_applied` DATE — Dernière application

### Table `cycles`
- `id` INTEGER PK
- `user_id` INTEGER FK → users
- `cycle_key` TEXT — Identifiant (ex: "2026-05")
- `start_date` / `end_date` DATE — Bornes du cycle
- `starting_balance` / `ending_balance` REAL
- `total_income` / `total_expenses` REAL

### Table `push_subscriptions`
- `id` INTEGER PK
- `user_id` INTEGER FK → users
- `subscription` JSON — Objet PushSubscription
- `created_at` DATETIME

---

## 🔌 API Endpoints

### Auth
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/auth/login` | Connexion |
| POST | `/api/auth/change-password` | Changer mot de passe |
| GET | `/api/auth/me` | Info utilisateur courant |

### Budget
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/budget` | Obtenir le solde |
| PUT | `/api/budget` | Mettre à jour le solde |

### Expenses
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/expenses` | Liste des dépenses (filtres: cycle, date, catégorie) |
| POST | `/api/expenses` | Ajouter une dépense |
| PUT | `/api/expenses/:id` | Modifier |
| DELETE | `/api/expenses/:id` | Supprimer |

### Categories
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/categories` | Liste des catégories |
| POST | `/api/categories` | Créer |
| PUT | `/api/categories/:id` | Modifier |
| DELETE | `/api/categories/:id` | Supprimer |

### Recurring
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/recurring` | Liste des récurrents |
| POST | `/api/recurring` | Créer |
| PUT | `/api/recurring/:id` | Modifier |
| DELETE | `/api/recurring/:id` | Supprimer |

### Analytics
| Méthode | Route | Description |
|---------|-------|-------------|
| GET | `/api/analytics/summary` | Résumé cycle actuel |
| GET | `/api/analytics/by-category` | Répartition par catégorie |
| GET | `/api/analytics/history` | Historique des cycles |

### Upload
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/upload/receipt` | Upload image ticket |
| POST | `/api/upload/category-icon` | Upload icône catégorie |

### Push Notifications
| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/push/subscribe` | S'abonner aux notifications |
| DELETE | `/api/push/unsubscribe` | Se désabonner |
| GET | `/api/push/vapid-key` | Clé publique VAPID |

---

## 🔒 Sécurité

### Authentification
- **bcrypt** salt rounds = 12 pour hashing des mots de passe
- **JWT** access token avec expiration 24h
- Token stocké en localStorage (acceptable pour app personnelle)
- Middleware `auth.js` vérifie le token sur toutes les routes `/api/*` sauf `/api/auth/login`

### Rate Limiting
- Login : 5 tentatives par 15 minutes par IP
- API générale : 100 requêtes par minute
- Upload : 10 par minute

### Validation
- Validation des entrées côté serveur
- Sanitization des données
- Types MIME vérifiés pour les uploads
- Taille max upload : 5MB

### Headers
- Helmet.js pour les headers de sécurité HTTP
- CORS configuré

---

## 🐳 Docker

### Build
```bash
docker compose up -d
```

### Variables d'environnement (.env)
```
JWT_SECRET=votre-secret-jwt-unique-ici
VAPID_PUBLIC_KEY=généré-automatiquement
VAPID_PRIVATE_KEY=généré-automatiquement
VAPID_EMAIL=mailto:admin@budgetvault.local
NODE_ENV=production
PORT=3001
```

### Volumes
- `./data:/app/data` — Base de données SQLite + uploads images

### Backup
```bash
# Backup simple
cp data/budget.db data/budget.db.backup

# Backup avec date
cp data/budget.db "data/backup-$(date +%Y%m%d).db"
```

---

## 🎨 Design System

### Couleurs
- **Primary**: `#6366f1` (Indigo 500)
- **Primary Light**: `#818cf8` (Indigo 400)
- **Primary Dark**: `#4f46e5` (Indigo 600)
- **Success**: `#10b981` (Emerald 500)
- **Danger**: `#ef4444` (Red 500)
- **Warning**: `#f59e0b` (Amber 500)
- **Surface Dark**: `#0f0f23` (Background)
- **Surface Card**: `#1a1a3e` (Card background)
- **Surface Elevated**: `#252550` (Elevated elements)
- **Text Primary**: `#f1f5f9`
- **Text Secondary**: `#94a3b8`

### Typographie
- **Font**: Inter (Google Fonts)
- **Headings**: 600-700 weight
- **Body**: 400-500 weight
- **Sizes**: 0.75rem - 2rem scale

### Spacing
- Base unit : 4px
- Scale : 4, 8, 12, 16, 20, 24, 32, 48, 64

### Breakpoints
- Mobile : < 640px (design principal)
- Tablet : 640px - 1024px
- Desktop : > 1024px

---

## 🚀 Commandes de Développement

### Installation
```bash
cd server && npm install
cd ../client && npm install
```

### Développement
```bash
# Terminal 1 - Backend
cd server && npm run dev

# Terminal 2 - Frontend
cd client && npm run dev
```

### Production (Docker)
```bash
docker compose up -d --build
```

### Générer les clés VAPID
```bash
cd server && npx web-push generate-vapid-keys
```

---

## 📈 Roadmap

### V1.0 (Actuel)
- ✅ Auth avec admin par défaut
- ✅ Gestion du solde
- ✅ Cycles budgétaires configurables
- ✅ CRUD dépenses avec catégories
- ✅ Upload tickets de caisse
- ✅ Catégories avec icônes et couleurs
- ✅ Revenus/dépenses récurrents
- ✅ Graphiques (camembert, barres)
- ✅ Notifications push
- ✅ PWA installable
- ✅ Dark mode
- ✅ Docker ready

### V1.1 (Futur)
- [ ] Multi-utilisateurs complet
- [ ] Export CSV/PDF
- [ ] Budgets par catégorie
- [ ] Objectifs d'épargne
- [ ] Scanner OCR tickets

### V2.0 (Futur lointain)
- [ ] Connexion bancaire (API)
- [ ] IA catégorisation automatique
- [ ] Mode famille (comptes partagés)
- [ ] Apps natives (React Native)

---

## 🔧 Maintenance

### Logs
```bash
docker compose logs -f
```

### Restart
```bash
docker compose restart
```

### Mise à jour
```bash
git pull
docker compose up -d --build
```

### Réinitialiser la base
```bash
docker compose down
rm data/budget.db
docker compose up -d
```

---

## ⚡ Performance

- **SQLite WAL mode** : lecture/écriture concurrentes
- **Image compression** : Sharp réduit à 1200px max, qualité 80
- **Bundle splitting** : Vite code splitting automatique
- **Lazy loading** : Pages chargées à la demande
- **Service Worker** : Cache des assets statiques
- **Gzip** : Compression Express

---

## 📋 Conventions

### Code
- **Nommage** : camelCase (JS), kebab-case (CSS), PascalCase (composants React)
- **Indentation** : 2 espaces
- **Semicolons** : Oui
- **Quotes** : Single quotes (JS), double quotes (JSX attributes)

### Git
- **Branches** : main, develop, feature/*
- **Commits** : Conventional commits (feat:, fix:, docs:, etc.)

### Fichiers
- Un composant par fichier
- Nommage PascalCase pour les composants React
- Extension .jsx pour les composants avec JSX
- Extension .js pour les utilitaires
