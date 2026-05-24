// ═══════════════════════════════════════════════════════════════════
//  COMPONENTS / SHELL — Navbar + side-menu structuré
//  Le side-menu absorbe tout le footer (navigation, paiements, aide,
//  copyright). Les pages n'ont plus besoin d'élément <footer>.
// ═══════════════════════════════════════════════════════════════════

(function() {
  var basePath = window.location.pathname.includes('/pages/') ? '../' : '';

  // ── Liens hors contexte pages/ ──
  function getPath(page) { return basePath + 'pages/' + page; }

  // ── Session courante (synchrone, depuis le cache user_id maintenu par auth.js) ──
  // Renvoie un mini-objet {id, full_name, email, avatar_url} ou null.
  // Pour le drawer initial : on lit le cache local (rapide, sync). Une fonction
  // async _hydrateSession() rafraîchit ensuite avec le profil Supabase complet.
  function _getSession() {
    var uid = (window.currentUserId && window.currentUserId()) || localStorage.getItem('dj_user_id');
    if (!uid) {
      // Rétrocompat : ancien dj_demo_session
      try {
        var raw = localStorage.getItem('dj_demo_session');
        if (raw) return JSON.parse(raw);
      } catch(e) {}
      return null;
    }
    // Lit le snapshot du profil cached pour accélérer le rendu initial
    try {
      var snap = JSON.parse(localStorage.getItem('dj_profile_snap::' + uid) || 'null');
      if (snap) return Object.assign({ id: uid }, snap);
    } catch(e) {}
    return { id: uid };
  }

  // Récupère le profil complet depuis Supabase et re-render le drawer.
  async function _hydrateSession() {
    if (!window._supabase) return;
    var uid = window.currentUserId && window.currentUserId();
    if (!uid) return;
    try {
      var r = await window._supabase.from('profiles').select('full_name, email, avatar_url').eq('id', uid).single();
      if (r && r.data) {
        var snap = { full_name: r.data.full_name, email: r.data.email, avatar_url: r.data.avatar_url };
        localStorage.setItem('dj_profile_snap::' + uid, JSON.stringify(snap));
        _refreshMenu();   // re-render avec les vraies infos
      }
    } catch(e) {}
  }

  // ── Icônes additionnelles si manquantes ──
  window.ICONS = window.ICONS || {};
  Object.assign(window.ICONS, {
    search:    window.ICONS.search    || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>',
    heart:     window.ICONS.heart     || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>',
    cart:      window.ICONS.cart      || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 001.95-1.57l1.65-8.42H6"/></svg>',
    bell:      window.ICONS.bell      || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>',
    moon:      window.ICONS.moon      || '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>'
  });

  // ── Détecte si on est sur une sous-page (≠ accueil)
  function _isSubpage() {
    var path = window.location.pathname.split('/').pop() || '';
    return path !== 'index.html' && path !== '' && path !== '/';
  }

  // ── NAVBAR ──
  function _navHTML() {
    var subpage = _isSubpage();
    var backBtn = subpage
      ? '<button class="nav-back-btn" aria-label="Retour" onclick="if(history.length>1){history.back()}else{window.location.href=\'' + getPath('index.html') + '\'}">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="20" height="20"><polyline points="15 18 9 12 15 6"/></svg>' +
        '</button>'
      : '';
    return '<nav class="navbar' + (subpage ? ' has-back' : '') + '" id="navbar">' +
      '<div class="nav-inner">' +
        backBtn +
        '<a href="' + getPath('index.html') + '" class="nav-logo">' +
          '<img class="nav-logo-mark" src="' + basePath + 'assets/icons/icon-96.png" alt="DjamikShop" width="36" height="36">Djamik<span>Shop</span>' +
        '</a>' +
        '<div class="nav-search" style="position:relative">' +
          '<input type="search" id="nav-search-input" placeholder="Chercher un produit…" autocomplete="off">' +
          '<button class="nav-search-btn" id="nav-search-submit">' + window.ICONS.search + '</button>' +
          '<div class="search-suggestions" id="nav-suggestions"></div>' +
        '</div>' +
        '<div class="nav-actions">' +
          '<button class="theme-toggle-btn" id="theme-toggle" onclick="window.toggleTheme && window.toggleTheme()" title="Mode sombre">' + window.ICONS.moon + '</button>' +
          '<a href="' + getPath('wishlist.html') + '" class="nav-icon-btn" title="Favoris">' + window.ICONS.heart + '<span class="badge hidden" id="wishlist-badge">0</span></a>' +
          '<a href="' + getPath('notifications.html') + '" class="nav-icon-btn">' + window.ICONS.bell + '<span class="badge hidden notif-badge" id="notif-badge">0</span></a>' +
          // Panier retiré (modèle marketplace : négociation directe acheteur/vendeur)
          '<button class="nav-menu-btn" id="nav-menu-btn" aria-label="Menu"><span></span><span></span><span></span></button>' +
        '</div>' +
      '</div>' +
    '</nav>';
  }

  // ── SIDE MENU — structure complète absorbant le footer ──
  function _sideMenuHTML(session) {
    var loggedIn = !!session;
    var name     = loggedIn ? (session.full_name || session.email || 'Mon compte') : '';
    var email    = loggedIn ? (session.email || '') : '';
    var initial  = (name.charAt(0) || 'U').toUpperCase();
    var avatar   = (session && session.avatar_url) ||
                   ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'U') + '&background=E8501A&color=fff&size=120');

    // Header (auth ou guest)
    var header = loggedIn
      ? '<div class="side-menu-header">' +
          '<button class="side-menu-close" data-close>' + _close() + '</button>' +
          '<img class="side-menu-avatar" src="' + avatar + '" alt="">' +
          '<div class="side-menu-name">' + _esc(name) + '</div>' +
          '<div class="side-menu-email">' + _esc(email) + '</div>' +
        '</div>'
      : '<div class="side-menu-guest">' +
          '<button class="side-menu-close" data-close>' + _close() + '</button>' +
          '<div style="font-family:Outfit,sans-serif;font-weight:800;font-size:1.4rem;color:#fff">Djamik<span style="color:#FF5722">Shop</span></div>' +
          '<p style="font-size:.8rem;color:rgba(255,255,255,.55);margin-top:6px">Connectez-vous pour acheter et vendre</p>' +
          '<div style="display:flex;gap:8px;margin-top:14px">' +
            '<a href="' + getPath('login.html') + '" class="sm-cta sm-cta-primary">Se connecter</a>' +
            '<a href="' + getPath('signup.html') + '" class="sm-cta sm-cta-outline">S\'inscrire</a>' +
          '</div>' +
        '</div>';

    // Marketplace (toujours visible)
    var marketplace =
      '<div class="sm-section">' +
        '<div class="sm-section-title">Marketplace</div>' +
        '<a href="' + getPath('comment-ca-marche.html') + '" class="side-menu-item sm-highlight">' + _icon('info') + ' Comment ça marche</a>' +
        '<a href="' + getPath('add-product.html') + '" class="side-menu-sell">' + _icon('plus') + ' Vendre</a>' +
        '<a href="' + getPath('tarifs.html') + '" class="side-menu-item sm-tarifs">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/></svg>' +
          ' Booster mon compte' +
        '</a>' +
        '<a href="' + getPath('index.html') + '" class="side-menu-item">' + _icon('home') + ' Accueil</a>' +
        '<a href="' + getPath('shop.html') + '" class="side-menu-item">' + _icon('search') + ' Rechercher</a>' +
        '<a href="' + getPath('messages.html') + '" class="side-menu-item">' + _icon('msg') + ' Messages <span class="sm-badge hidden" id="sm-msg-badge">0</span></a>' +
      '</div>';

    // Mon compte (logged uniquement)
    var account = loggedIn
      ? '<div class="sm-section">' +
          '<div class="sm-section-title">Mon compte</div>' +
          '<a href="' + getPath('my-profile.html') + '" class="side-menu-item">' + _icon('user') + ' Mon profil</a>' +
          '<a href="' + getPath('offers.html') + '" class="side-menu-item">' + _icon('chat') + ' Mes offres</a>' +
          '<a href="' + getPath('wishlist.html') + '" class="side-menu-item">' + _icon('heart') + ' Mes favoris <span class="sm-badge hidden" id="sm-fav-badge">0</span></a>' +
          '<a href="' + getPath('notifications.html') + '" class="side-menu-item">' + _icon('bell') + ' Notifications <span class="sm-badge hidden" id="sm-notif-badge">0</span></a>' +
          // Lien admin (caché par défaut, dévoilé par JS si user est admin)
          '<a href="' + getPath('admin.html') + '" class="side-menu-item sm-admin-link" id="sm-admin-link" style="display:none">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>' +
            ' Administration <span class="sm-badge hidden" id="sm-admin-badge">0</span>' +
          '</a>' +
        '</div>'
      : '';

    // Paiements acceptés (read-only chips)
    var methods = (window.APP && window.APP.paymentMethods) || [];
    var paymentChips = methods.map(function(m) {
      return '<div class="sm-pay-chip" title="' + m.label + '">' +
        '<span class="sm-pay-dot" style="background:' + m.color + '"></span>' + m.label +
      '</div>';
    }).join('');
    var payments =
      '<div class="sm-section">' +
        '<div class="sm-section-title">Paiements acceptés</div>' +
        '<div class="sm-pay-grid">' + paymentChips + '</div>' +
      '</div>';

    // Aide & Infos
    var help =
      '<div class="sm-section">' +
        '<div class="sm-section-title">Aide &amp; Infos</div>' +
        '<a href="' + getPath('cgu.html') + '" class="sm-text-link">Conditions d\'utilisation</a>' +
        '<a href="' + getPath('confidentialite.html') + '" class="sm-text-link">Politique de confidentialité</a>' +
        '<a href="mailto:contact@djamikshop.com" class="sm-text-link">Nous contacter</a>' +
      '</div>';

    // Footer du menu
    var footerBlock =
      '<div class="sm-footer">' +
        '<button class="sm-theme-toggle" onclick="window.showInstallPrompt && window.showInstallPrompt()">' +
          _icon('download') + ' <span>Installer l\'app</span>' +
        '</button>' +
        '<button class="sm-theme-toggle" onclick="window.toggleTheme && window.toggleTheme()">' +
          _icon('moon') + ' <span>Mode sombre / clair</span>' +
        '</button>' +
        '<button class="sm-push-toggle" id="sm-push-toggle">' +
          _icon('bell') + ' <span id="sm-push-label">Activer les notifications</span>' +
        '</button>' +
        (loggedIn
          ? '<button class="sm-logout" onclick="window.logout && window.logout()">' + _icon('logout') + ' Déconnexion</button>'
          : '') +
        '<div class="sm-copyright">© 2025 DjamikShop · Fait au Niger 🇳🇪</div>' +
        '<div class="sm-version">v' + ((window.APP && window.APP.version) || '1.1') + '</div>' +
      '</div>';

    return '<div class="side-menu" id="side-menu">' +
      '<div class="side-menu-backdrop" data-close></div>' +
      '<div class="side-menu-panel">' +
        header +
        '<div class="side-menu-body">' +
          marketplace + account + payments + help +
        '</div>' +
        footerBlock +
      '</div>' +
    '</div>';
  }

  // ── Helpers ──
  function _esc(s) { var d = document.createElement('div'); d.textContent = s || ''; return d.innerHTML; }
  function _close() { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>'; }
  function _icon(name) {
    var i = (window.ICONS && window.ICONS[name]);
    if (i) return i;
    // Fallback minimal pour ne pas casser le rendu
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><circle cx="12" cy="12" r="10"/></svg>';
  }

  // ── Styles additionnels (sections, paiements, footer du menu) ──
  function _injectStyles() {
    if (document.getElementById('shell-extra-styles')) return;
    var s = document.createElement('style');
    s.id = 'shell-extra-styles';
    s.textContent = [
      // Sections
      '.sm-section{padding:14px 18px;border-bottom:1px solid var(--surface-2)}',
      '.sm-section:last-of-type{border-bottom:none}',
      '.sm-section-title{font-family:Outfit,sans-serif;font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:var(--ink-3);margin-bottom:10px}',

      // CTA guest header
      '.sm-cta{flex:1;text-align:center;padding:9px 12px;border-radius:var(--r-md);font-size:.85rem;font-weight:700;text-decoration:none;transition:opacity .15s}',
      '.sm-cta-primary{background:#E8501A;color:#fff}',
      '.sm-cta-outline{background:rgba(255,255,255,.08);color:#fff;border:1px solid rgba(255,255,255,.2)}',
      '.sm-cta:hover{opacity:.9}',

      // Liens secondaires (Aide)
      '.sm-text-link{display:block;padding:7px 0;font-size:.85rem;color:var(--ink-2);text-decoration:none;transition:color .12s}',
      '.sm-text-link:hover{color:var(--primary,#E8501A)}',

      // Badges dans le menu
      '.sm-badge{margin-left:auto;background:var(--primary,#E8501A);color:#fff;font-size:.65rem;font-weight:700;padding:2px 6px;border-radius:10px;min-width:18px;text-align:center}',

      // Paiements grid
      '.sm-pay-grid{display:flex;flex-wrap:wrap;gap:6px}',
      '.sm-pay-chip{display:inline-flex;align-items:center;gap:6px;padding:5px 10px;background:var(--surface-2);border:1px solid var(--surface-3);border-radius:999px;font-size:.74rem;font-weight:600;color:var(--ink-2)}',
      '.sm-pay-dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}',

      // Footer du menu
      '.sm-footer{padding:14px 18px 22px;border-top:1px solid var(--surface-2);background:var(--surface-2);text-align:center}',
      '.sm-logout{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px;background:transparent;color:var(--danger,#ef4444);border:1px solid var(--danger,#ef4444);border-radius:var(--r-md);font-weight:600;font-size:.85rem;cursor:pointer;margin-bottom:14px;transition:background .15s}',
      '.sm-logout:hover{background:rgba(239,68,68,.08)}',
      '.sm-logout svg{width:16px;height:16px}',
      '.sm-theme-toggle,.sm-push-toggle{width:100%;display:inline-flex;align-items:center;justify-content:center;gap:8px;padding:10px;background:var(--white);color:var(--ink);border:1px solid var(--surface-3);border-radius:var(--r-md);font-weight:600;font-size:.85rem;cursor:pointer;margin-bottom:10px;transition:background .15s;font-family:inherit}',
      '.sm-theme-toggle:hover,.sm-push-toggle:hover{background:var(--surface-3)}',
      '.sm-theme-toggle svg,.sm-push-toggle svg{width:16px;height:16px}',
      '.sm-push-toggle.subscribed{background:rgba(232,80,26,.08);color:var(--primary,#E8501A);border-color:var(--primary,#E8501A)}',
      '.sm-copyright{font-size:.72rem;color:var(--ink-3);margin-bottom:3px}',
      '.sm-version{font-size:.66rem;color:var(--ink-4);font-family:monospace}',

      // Le panel doit pouvoir scroller car le contenu est plus long
      '.side-menu-panel{overflow-y:auto;padding-bottom:env(safe-area-inset-bottom,0)}',
      '.side-menu-body{padding:0}',

      // Footer page : caché si présent (rétrocompat)
      '.site-footer{display:none !important}',

      // Mobile : navbar épurée → seulement logo + panier + hamburger (+ back si sous-page)
      // (recherche, favoris, notifications, theme accessibles via drawer/bottom-nav)
      '@media(max-width:768px){',
        '.navbar .nav-search{display:none !important}',
        '.navbar .theme-toggle-btn{display:none !important}',
        '.navbar a[href*="wishlist"].nav-icon-btn{display:none !important}',
        '.navbar a[href*="notifications"].nav-icon-btn{display:none !important}',
        '.navbar .nav-menu-btn{display:flex !important;width:42px !important;height:42px !important;flex-shrink:0}',
        '.navbar .nav-inner{gap:8px}',
        '.navbar .nav-actions{gap:6px;flex-shrink:0;margin-left:auto}',
        // Sur sous-page : back button visible, logo réduit
        '.navbar.has-back .nav-back-btn{display:flex !important}',
        '.navbar.has-back .nav-logo{font-size:1rem}',
        '.navbar.has-back .nav-logo-mark{display:none}',
      '}',
      // Style du back button (caché par défaut, montré seulement sur sous-page mobile)
      '.nav-back-btn{display:none;align-items:center;justify-content:center;width:40px;height:40px;border-radius:var(--r-md);background:var(--surface-2);border:1px solid var(--surface-3);color:var(--ink);cursor:pointer;flex-shrink:0;transition:background .15s;-webkit-tap-highlight-color:transparent}',
      '.nav-back-btn:active{background:var(--surface-3);transform:scale(.95)}',
      '.nav-back-btn svg{display:block}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── Init ──
  function _init() {
    _injectStyles();

    // Navbar
    if (!document.getElementById('navbar')) {
      var navWrap = document.createElement('div');
      navWrap.innerHTML = _navHTML();
      document.body.insertBefore(navWrap.firstChild, document.body.firstChild);
    }

    // Side-menu : on supprime l'ancien (hardcodé) pour réinjecter le nouveau
    var existing = document.getElementById('side-menu');
    if (existing && !existing.dataset.shellOwned) existing.remove();

    var smWrap = document.createElement('div');
    smWrap.innerHTML = _sideMenuHTML(_getSession());
    var sm = smWrap.firstChild;
    sm.dataset.shellOwned = '1';
    document.body.appendChild(sm);

    // Init theme
    if (window.initTheme) window.initTheme();

    // Badges
    window.updateCartBadge && window.updateCartBadge();
    window.updateWishlistBadge && window.updateWishlistBadge();
    window.updateNotifBadge && window.updateNotifBadge();
    _updateMenuBadges();

    // Side-menu logic
    _initSideMenu();

    // Re-render menu si la session change (cross-onglet)
    window.addEventListener('storage', function(e) {
      if (e.key === 'dj_demo_session' || e.key === 'dj_user_id') {
        window.updateCartBadge && window.updateCartBadge();
        window.updateWishlistBadge && window.updateWishlistBadge();
        window.updateNotifBadge && window.updateNotifBadge();
        _refreshMenu();
      }
    });

    // Écoute aussi les changements d'auth Supabase (login/logout)
    // Ignore TOKEN_REFRESHED (auto toutes les heures) et INITIAL_SESSION
    // sinon le menu se reconstruit en plein milieu de l'utilisation.
    if (window._supabase && window._supabase.auth) {
      window._supabase.auth.onAuthStateChange(function(event, session) {
        if (event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION') return;
        // Évite aussi si le menu est ouvert au moment du refresh
        var menu = document.getElementById('side-menu');
        if (menu && menu.classList.contains('open')) return;
        setTimeout(function() {
          _refreshMenu();
          _hydrateSession();
        }, 100);
      });
    }

    // Hydrate le profil au load si user connecté
    _hydrateSession();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

  // Garde un refresh en attente si le menu est ouvert au moment du call
  var _refreshDeferred = false;

  function _refreshMenu(force) {
    var existing = document.getElementById('side-menu');
    // ⚠️ Si le menu est ouvert, on diffère le refresh pour pas le faire disparaitre
    if (!force && existing && existing.classList.contains('open')) {
      _refreshDeferred = true;
      return;
    }
    if (existing) existing.remove();
    var smWrap = document.createElement('div');
    smWrap.innerHTML = _sideMenuHTML(_getSession());
    var sm = smWrap.firstChild;
    sm.dataset.shellOwned = '1';
    document.body.appendChild(sm);
    _initSideMenu();
    _updateMenuBadges();
    _refreshDeferred = false;
  }

  function _updateMenuBadges() {
    // Favoris
    var likes = window.getLikes ? window.getLikes() : [];
    _setBadge('sm-fav-badge', likes.length);

    // Notifs non lues
    var notifs = window.getNotifications ? window.getNotifications() : [];
    var unread = notifs.filter(function(n){ return !n.read; }).length;
    _setBadge('sm-notif-badge', unread);

    // Messages non lus
    try {
      var convs = window.getConversations ? window.getConversations() : [];
      var msgUnread = convs.reduce(function(s, x){ return s + (x.unread || 0); }, 0);
      _setBadge('sm-msg-badge', msgUnread);
    } catch(e) {}

    // Lien admin (visible si user is admin) + badge signalements en attente
    _checkAdminAndBadge();
  }

  async function _checkAdminAndBadge() {
    if (!window._supabase) return;
    try {
      var u = await window._supabase.auth.getUser();
      var uid = u && u.data && u.data.user && u.data.user.id;
      if (!uid) return;

      // 1. Lien admin si admin
      var ad = await window._supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
      if (ad && ad.data) {
        var link = document.getElementById('sm-admin-link');
        if (link) link.style.display = '';
        var c = await window._supabase.from('reports').select('id', { count: 'exact', head: true }).eq('status', 'open');
        _setBadge('sm-admin-badge', (c && c.count) || 0);
      }

      // 2. Lien abonnement : transforme "Booster mon compte" en "Mon abonnement (Xj)" si paye
      if (window.mySubscriptionInfo) {
        var info = await window.mySubscriptionInfo();
        var tarifsLink = document.querySelector('.sm-tarifs');
        if (tarifsLink && info && info.tier && info.tier !== 'free') {
          var days = info.days_left;
          var tierLabel = info.tier === 'vip' ? 'VIP' : 'Premium';
          var icon = info.tier === 'vip'
            ? '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M2 7l4.5 4L12 4l5.5 7L22 7l-2 12H4L2 7z"/></svg>'
            : '<svg viewBox="0 0 24 24" fill="currentColor" width="20" height="20"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>';
          tarifsLink.classList.add('sm-tarifs-active');
          tarifsLink.classList.remove('sm-tarifs');
          tarifsLink.innerHTML = icon + ' Mon abonnement ' + tierLabel +
            (days !== null && days !== undefined ? ' <span class="sm-days-left">' + days + 'j restant' + (days > 1 ? 's' : '') + '</span>' : '');
        }
      }
    } catch(e) {}
  }

  function _setBadge(id, n) {
    var el = document.getElementById(id);
    if (!el) return;
    el.textContent = n > 9 ? '9+' : n;
    el.classList.toggle('hidden', n === 0);
  }

  function _initSideMenu() {
    var menuBtn = document.getElementById('nav-menu-btn');
    var sideMenu = document.getElementById('side-menu');
    if (!sideMenu) return;

    function open()  { var sm = document.getElementById('side-menu'); if (!sm) return; sm.classList.add('open'); if (menuBtn) menuBtn.classList.add('open'); document.body.style.overflow = 'hidden'; }
    function close() {
      var sm = document.getElementById('side-menu'); if (!sm) return;
      sm.classList.remove('open');
      if (menuBtn) menuBtn.classList.remove('open');
      document.body.style.overflow = '';
      // Si un refresh est en attente (declenche pendant que menu etait ouvert), on le fait maintenant
      if (_refreshDeferred) setTimeout(function(){ _refreshMenu(true); }, 350);
    }

    // Évite les doublons : on retire l'ancien listener si on en a déjà ajouté un
    if (menuBtn) {
      if (menuBtn._smOpenHandler) menuBtn.removeEventListener('click', menuBtn._smOpenHandler);
      menuBtn._smOpenHandler = open;
      menuBtn.addEventListener('click', open);
    }
    sideMenu.querySelectorAll('[data-close]').forEach(function(el) {
      el.addEventListener('click', close);
    });
    // Escape : on retire l'ancien listener avant d'en mettre un nouveau (sinon accumulation)
    if (document._smEscHandler) document.removeEventListener('keydown', document._smEscHandler);
    document._smEscHandler = function(e) { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', document._smEscHandler);

    // Push notifications toggle
    var pushBtn = document.getElementById('sm-push-toggle');
    var pushLabel = document.getElementById('sm-push-label');
    if (pushBtn && window.pushIsSupported && window.pushIsSupported()) {
      // Update label selon l'état actuel
      if (window.isPushSubscribed) {
        window.isPushSubscribed().then(function(subscribed) {
          if (subscribed) { pushBtn.classList.add('subscribed'); pushLabel.textContent = 'Notifications activées'; }
        });
      }
      pushBtn.addEventListener('click', async function() {
        var subscribed = window.isPushSubscribed ? await window.isPushSubscribed() : false;
        if (subscribed) {
          await window.unsubscribePush();
          pushBtn.classList.remove('subscribed');
          pushLabel.textContent = 'Activer les notifications';
        } else {
          var sub = await window.subscribePush();
          if (sub) {
            pushBtn.classList.add('subscribed');
            pushLabel.textContent = 'Notifications activées';
          }
        }
      });
    } else if (pushBtn) {
      // Push pas supporté → cache le bouton
      pushBtn.style.display = 'none';
    }
  }
})();
