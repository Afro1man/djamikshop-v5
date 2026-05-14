// ═══════════════════════════════════════════════════════════════════
//  COMPONENTS / BOTTOM-NAV — Navigation mobile type app native
//  Injecte une tab bar fixe en bas. Mobile uniquement (≤ 768px).
// ═══════════════════════════════════════════════════════════════════

(function() {

  // ── Onglets ──
  var TABS = [
    {
      id:    'home',
      label: 'Accueil',
      href:  'index.html',
      match: ['index.html', '/', ''],
      svg:   '<path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>'
    },
    {
      id:    'search',
      label: 'Recherche',
      href:  'shop.html',
      match: ['shop.html'],
      svg:   '<circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/>'
    },
    {
      id:    'sell',
      label: 'Vendre',
      href:  'add-product.html',
      match: ['add-product.html'],
      fab:   true,
      svg:   '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>'
    },
    {
      id:    'messages',
      label: 'Messages',
      href:  'messages.html',
      match: ['messages.html'],
      svg:   '<path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/>'
    },
    {
      id:    'profile',
      label: 'Profil',
      href:  'my-profile.html',
      match: ['my-profile.html', 'login.html', 'signup.html', 'orders.html', 'wishlist.html', 'notifications.html'],
      svg:   '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'
    }
  ];

  // ── Détecte la page courante ──
  function _currentTabId() {
    var path = window.location.pathname.split('/').pop() || 'index.html';
    for (var i = 0; i < TABS.length; i++) {
      if (TABS[i].match.indexOf(path) !== -1) return TABS[i].id;
    }
    return null;
  }

  // ── Compteur de badges (messages non lus depuis Supabase) ──
  var _msgUnreadCount = 0;
  function _badgeFor(tabId) {
    if (tabId === 'messages') return _msgUnreadCount;
    return 0;
  }

  // Met à jour la valeur des messages non lus (depuis Supabase)
  async function _refreshMsgUnread() {
    if (!window._supabase) { _msgUnreadCount = 0; return; }
    var uid = window.currentUserId && window.currentUserId();
    if (!uid) { _msgUnreadCount = 0; _updateBadgeUI(); return; }
    try {
      var r = await window._supabase.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('recipient_id', uid)
        .is('read_at', null);
      _msgUnreadCount = (r && r.count) || 0;
    } catch(e) { _msgUnreadCount = 0; }
    _updateBadgeUI();
  }

  // Update juste l'icône (sans re-render toute la nav)
  function _updateBadgeUI() {
    var nav = document.getElementById('bottom-nav');
    if (!nav) return;
    var iconWrap = nav.querySelector('[data-tab="messages"] .bn-icon');
    if (!iconWrap) return;
    var oldBadge = iconWrap.querySelector('.bn-badge');
    if (oldBadge) oldBadge.remove();
    if (_msgUnreadCount > 0) {
      var span = document.createElement('span');
      span.className = 'bn-badge';
      span.textContent = _msgUnreadCount > 9 ? '9+' : _msgUnreadCount;
      iconWrap.appendChild(span);
    }
  }

  // Expose pour que messages.js puisse rafraîchir après lecture
  window.refreshMessagesBadge = _refreshMsgUnread;

  // ── Rendu HTML ──
  function _render() {
    var activeId = _currentTabId();
    var basePath = window.location.pathname.includes('/pages/') ? '' : 'pages/';

    var html = '<nav class="bottom-nav" id="bottom-nav" role="navigation" aria-label="Navigation principale">';
    TABS.forEach(function(tab) {
      var isActive = tab.id === activeId;
      var badge    = _badgeFor(tab.id);
      var classes  = 'bn-tab' + (isActive ? ' active' : '') + (tab.fab ? ' bn-fab' : '');
      var svg      = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' + tab.svg + '</svg>';
      html +=
        '<a href="' + basePath + tab.href + '" class="' + classes + '" data-tab="' + tab.id + '">' +
          '<span class="bn-icon">' + svg + (badge > 0 ? '<span class="bn-badge">' + (badge > 9 ? '9+' : badge) + '</span>' : '') + '</span>' +
          (tab.fab ? '' : '<span class="bn-label">' + tab.label + '</span>') +
        '</a>';
    });
    html += '</nav>';
    return html;
  }

  // ── Styles ──
  function _injectStyles() {
    if (document.getElementById('bn-styles')) return;
    var s = document.createElement('style');
    s.id = 'bn-styles';
    s.textContent = [
      // Masqué sur desktop
      '@media(min-width:769px){.bottom-nav{display:none !important}}',

      // Conteneur
      '.bottom-nav{position:fixed;left:0;right:0;bottom:0;z-index:1000;display:flex;align-items:stretch;justify-content:space-around;background:var(--white);border-top:1px solid var(--surface-3);box-shadow:0 -4px 20px rgba(0,0,0,.06);padding:6px 4px calc(6px + env(safe-area-inset-bottom,0px));transition:transform .25s ease;font-family:Inter,system-ui,sans-serif}',
      '.bottom-nav.hidden-down{transform:translateY(110%)}',

      // Tab
      '.bn-tab{flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;padding:8px 4px;color:var(--ink-3);text-decoration:none;border-radius:var(--r-md);transition:color .15s,background .15s;min-width:0;-webkit-tap-highlight-color:transparent}',
      '.bn-tab:active{background:var(--surface-2)}',
      '.bn-tab.active{color:var(--primary)}',
      '.bn-icon{position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center}',
      '.bn-icon svg{width:24px;height:24px}',
      '.bn-label{font-size:.66rem;font-weight:600;white-space:nowrap;letter-spacing:.01em}',

      // Badge
      '.bn-badge{position:absolute;top:-4px;right:-7px;min-width:16px;height:16px;padding:0 4px;background:var(--danger,#ef4444);color:#fff;border-radius:8px;font-size:.62rem;font-weight:700;display:flex;align-items:center;justify-content:center;border:2px solid var(--white);box-sizing:content-box}',

      // FAB central
      '.bn-fab{flex:0 0 auto;margin:-22px 4px 0;width:56px;height:56px;border-radius:50%;background:linear-gradient(135deg,#FF6B35,#E8501A);color:#fff !important;box-shadow:0 6px 16px rgba(232,80,26,.4);transition:transform .15s,box-shadow .15s;padding:0;align-self:center}',
      '.bn-fab:active{transform:scale(.92)}',
      '.bn-fab.active{background:linear-gradient(135deg,#E8501A,#C13E0E);box-shadow:0 6px 20px rgba(232,80,26,.55)}',
      '.bn-fab .bn-icon{width:28px;height:28px}',
      '.bn-fab .bn-icon svg{width:28px;height:28px;stroke-width:2.6}',

      // Safe-area + padding du body pour ne pas masquer le contenu
      '@media(max-width:768px){body{padding-bottom:calc(72px + env(safe-area-inset-bottom,0px))}}',

      // Cacher la mobile-nav-drawer obsolète si présente
      '.mobile-nav-drawer{display:none !important}',
    ].join('');
    document.head.appendChild(s);
  }

  // ── Masque sur scroll vers le bas, réaffiche au scroll vers le haut ──
  function _initScrollHide(nav) {
    var lastY    = window.scrollY;
    var ticking  = false;
    var threshold = 8;

    window.addEventListener('scroll', function() {
      if (ticking) return;
      window.requestAnimationFrame(function() {
        var y     = window.scrollY;
        var diff  = y - lastY;
        if (y > 100 && diff > threshold) {
          nav.classList.add('hidden-down');
        } else if (diff < -threshold || y < 100) {
          nav.classList.remove('hidden-down');
        }
        lastY = y;
        ticking = false;
      });
      ticking = true;
    }, { passive: true });
  }

  // ── Inject ──
  function _init() {
    if (document.getElementById('bottom-nav')) return;
    _injectStyles();
    var wrap = document.createElement('div');
    wrap.innerHTML = _render();
    var nav = wrap.firstChild;
    document.body.appendChild(nav);
    _initScrollHide(nav);

    // Premier load : fetch unread count + subscribe realtime
    _refreshMsgUnread();
    _subscribeMsgRealtime();

    // Re-fetch quand la session change
    if (window._supabase && window._supabase.auth) {
      window._supabase.auth.onAuthStateChange(function() {
        setTimeout(_refreshMsgUnread, 200);
      });
    }
  }

  // Subscribe au realtime des messages destinés à moi → update badge live
  var _bottomNavSub = null;
  async function _subscribeMsgRealtime() {
    if (!window._supabase) return;
    var uid = window.currentUserId && window.currentUserId();
    if (!uid) return;
    if (_bottomNavSub) { try { _bottomNavSub.unsubscribe(); } catch(e) {} }
    _bottomNavSub = window._supabase.channel('bn-msg:' + uid)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: 'recipient_id=eq.' + uid
      }, function() {
        // Refresh count quand un nouveau msg arrive
        _refreshMsgUnread();
      })
      .on('postgres_changes', {
        event: 'UPDATE', schema: 'public', table: 'messages',
        filter: 'recipient_id=eq.' + uid
      }, function() {
        // Refresh aussi quand un msg passe à read (read_at set)
        _refreshMsgUnread();
      })
      .subscribe();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _init);
  } else {
    _init();
  }

})();
