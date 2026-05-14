# DjamikShop v5 — Restructuration & Nouveau Design

## 🎯 Objectifs de cette refonte

1. **Architecture modulaire** — CSS et JS séparés en modules réutilisables
2. **Zero duplication** — Navbar, side-menu et toast injectés automatiquement via JS
3. **Design system cohérent** — Variables CSS, thème clair/sombre natif, glassmorphism
4. **Mobile-first** — Toutes les pages pensées pour le mobile en premier

---

## 📁 Nouvelle Structure

```
djamikshop-v5/
├── pages/                        ← Toutes les pages HTML (avant: racine)
│   ├── index.html               ← Accueil (nouveau hero glassmorphism)
│   ├── login.html               ← Connexion (split layout)
│   ├── signup.html              ← Inscription
│   ├── forgot-password.html     ← Stub prêt à migrer
│   ├── reset-password.html      ← Stub prêt à migrer
│   ├── product-details.html     ← Stub prêt à migrer
│   ├── add-product.html         ← Stub prêt à migrer
│   ├── my-profile.html          ← Stub prêt à migrer
│   ├── shop.html                ← Stub prêt à migrer
│   ├── cart.html                ← Panier (fonctionnel)
│   ├── checkout.html            ← Stub prêt à migrer
│   ├── orders.html              ← Stub prêt à migrer
│   ├── messages.html            ← Stub prêt à migrer
│   ├── wishlist.html            ← Stub prêt à migrer
│   └── notifications.html       ← Stub prêt à migrer
│
├── assets/
│   ├── css/
│   │   ├── main.css             ← Point d'entrée CSS (importe tout)
│   │   ├── core/
│   │   │   ├── variables.css    ← Design tokens + dark mode
│   │   │   ├── reset.css        ← Reset + base
│   │   │   └── typography.css   ← Fonts, headings, utilities texte
│   │   ├── components/
│   │   │   ├── navbar.css       ← Glassmorphism navbar
│   │   │   ├── side-menu.css    ← Slide panel
│   │   │   ├── buttons.css      ← Tous les boutons
│   │   │   ├── cards.css        ← Product cards, flash cards, stat cards
│   │   │   ├── forms.css        ← Inputs, textarea, select, upload
│   │   │   ├── toast.css        ← Notifications toast + badges
│   │   │   └── footer.css       ← Footer sombre
│   │   └── pages/
│   │       └── (styles spécifiques aux pages si besoin)
│   └── js/
│       ├── app.js               ← Chargeur séquentiel de tous les modules
│       ├── core/
│       │   ├── config.js        ← Supabase, APP config, catégories, villes
│       │   ├── utils.js         ← formatPrice, relativeDate, escHtml
│       │   ├── state.js         ← localStorage: likes, cart, history, notifs...
│       │   └── theme.js         ← Dark mode toggle
│       ├── components/
│       │   ├── ui.js            ← toast, modal, skeletons, badges
│       │   └── shell.js         ← Injection navbar + side-menu auto
│       └── features/
│           ├── auth.js          ← Login, signup, forgot, reset, rate limit
│           ├── products.js      ← Listing produits, filtres, catégories
│           ├── cart.js          ← Panier, checkout
│           ├── details.js       ← Fiche produit (stub)
│           ├── add-product.js   ← Publier annonce (stub)
│           ├── my-profile.js    ← Profil vendeur (stub)
│           ├── messages.js      ← Chat temps réel (stub)
│           └── orders.js        ← Commandes (stub)
│
└── README.md
```

---

## 🎨 Design System v5

### Couleurs
| Token | Clair | Sombre |
|-------|-------|--------|
| Primary | `#FF5722` | `#FF7043` |
| Accent | `#6366F1` | `#818CF8` |
| Gold | `#F59E0B` | `#FBBF24` |
| Surface | `#F8FAFC` | `#0A0A0F` |
| Ink | `#0F172A` | `#F1F5F9` |

### Effets
- **Glassmorphism** sur la navbar: `backdrop-filter: blur(20px)`
- **Shadows étagées**: xs → sm → md → lg → xl
- **Animations**: transitions fluides avec `cubic-bezier(.4, 0, .2, 1)`
- **Hover states**: lift + shadow sur toutes les cards

### Fonts
- **Titres**: Outfit (800, 700, 600)
- **Corps**: Inter (400, 500, 600)

---

## 🚀 Comment migrer une page existante

### 1. Copier le stub
Chaque page stub contient déjà la structure de base :
```html
<script src="../assets/js/app.js"></script>  <!-- charge tout -->
```
L'app.js injecte automatiquement la **navbar** et le **side-menu**.

### 2. Adapter les chemins
Ancien → Nouveau:
```
css/main.css        →  ../assets/css/main.css
js/config.js        →  ../assets/js/app.js (seul script nécessaire)
js/products.js      →  ../assets/js/features/products.js
```

### 3. Supprimer le HTML dupliqué
Avant, chaque page avait:
- `<nav class="navbar">...` → **Supprimer**, injecté par `shell.js`
- `<div class="side-menu">...` → **Supprimer**, injecté par `shell.js`
- `<div id="toast-container">` → **Supprimer**, géré par `ui.js`

### 4. Migrer le contenu spécifique
Copier le contenu unique de chaque page (form, grid, chat...) dans le `<body>` après le chargement de `app.js`.

---

## ⚡ Changements majeurs par rapport à v4

| Problème v4 | Solution v5 |
|-------------|---------------|
| Navbar dupliquée dans chaque HTML | Injection automatique via `shell.js` |
| CSS monolithique (1000+ lignes) | Modules CSS séparés par responsabilité |
| Thème dark géré par JS uniquement | `data-theme` natif + `color-scheme` |
| Pas de design tokens | Variables CSS exhaustives |
| Fichiers JS à plat | Core / Components / Features |
| Pages HTML à la racine | Dossier `pages/` propre |
| Pas de loader de dépendances | `app.js` charge tout séquentiellement |

---

## 🔧 Pour tester

1. Ouvrir `pages/index.html` dans un navigateur
2. Le dark mode est persistant via `localStorage`
3. Le panier fonctionne avec `localStorage`
4. Les produits se chargent depuis Supabase ou fallback demo

---

## 📌 Pages migrées (fonctionnelles)
- ✅ `index.html` — Hero, catégories, grille produits, filtres
- ✅ `login.html` — Split layout, validation, rate limit
- ✅ `signup.html` — Split layout, jauge de force MDP
- ✅ `cart.html` — Panier complet, checkout

## 📌 Pages stubs (prêtes à migrer)
- ⏳ `product-details.html`, `add-product.html`, `my-profile.html`
- ⏳ `shop.html`, `checkout.html`, `orders.html`
- ⏳ `messages.html`, `wishlist.html`, `notifications.html`
- ⏳ `forgot-password.html`, `reset-password.html`

---

🇳🇪 Fait au Niger — DjamikShop v5.0
