// ═══════════════════════════════════════════════════════════════════
//  APP.JS — Point d'entrée unique
//  Charge tous les modules en PARALLÈLE, exécution dans l'ordre.
// ═══════════════════════════════════════════════════════════════════

// ── Helper public : appelle cb dès que tous les modules core sont chargés.
window._djamikReady = window._djamikReady || false;
window.onDjamikReady = function(cb) {
  if (window._djamikReady) { try { cb(); } catch(e) { console.error('[DjamikShop] init error', e); } }
  else document.addEventListener('djamik:ready', cb, { once: true });
};

(function() {
  var base = window.location.pathname.includes('/pages/') ? '../assets/js/' : 'assets/js/';

  // Modules CRITIQUES : strictement minimum pour le premier rendu
  // OPTIMISATION 3G Niger : on garde seulement ce qui est UTILISE des le 1er paint.
  // Tout le reste est lazy (charge apres ready, ne bloque pas le LCP).
  var modules = [
    base + 'core/icons.js',
    base + 'core/config.js',
    base + 'core/utils.js',
    base + 'core/state.js',
    base + 'core/theme.js',
    base + 'features/auth.js',    // requireAuth utilise partout
    base + 'components/ui.js',
    base + 'components/shell.js',
    base + 'components/bottom-nav.js'
  ];

  // Modules NON-critiques : charges en arriere-plan apres ready (ne bloquent rien)
  // = tout ce qui n'est PAS necessaire dans les 100 premieres ms
  var lazyModules = [
    base + 'core/sponsor.js',     // badges/tiers (charge avant que la grid render)
    base + 'core/staff.js',       // admin only
    base + 'core/ban-check.js',   // execute apres ready
    base + 'core/back-button.js', // APK only, peut etre lazy
    base + 'core/stats.js',       // tracking, charge en idle
    base + 'core/analytics.js',   // PostHog (no-op si non configure)
    base + 'core/admin-realtime.js',
    base + 'core/pwa.js',
    base + 'core/share.js',
    base + 'core/payment.js',
    base + 'core/push.js',
    base + 'core/security.js',
    base + 'core/geo.js',
    base + 'core/email-verify.js'
  ];

  // Helper : injecte une liste de scripts en parallèle, exécution ordonnée
  function _inject(list, onAllDone) {
    if (!list.length) { onAllDone && onAllDone(); return; }
    var remaining = list.length;
    var done = function() { if (--remaining === 0) onAllDone && onAllDone(); };
    var frag = document.createDocumentFragment();
    list.forEach(function(src) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false;
      s.onload = done;
      s.onerror = function() { console.warn('[DjamikShop] Failed', src); done(); };
      frag.appendChild(s);
    });
    document.head.appendChild(frag);
  }

  function loadAll() {
    // Phase 1 : critiques (bloque le ready event)
    _inject(modules, function() {
      window._djamikReady = true;
      document.dispatchEvent(new CustomEvent('djamik:ready'));

      // Phase 2 : non-critiques (en arrière-plan, n'attend pas)
      // requestIdleCallback si dispo, sinon setTimeout
      var defer = window.requestIdleCallback || function(cb){ setTimeout(cb, 50); };
      defer(function() { _inject(lazyModules); });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAll);
  } else {
    loadAll();
  }
})();
