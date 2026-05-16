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

  // Modules CRITIQUES : doivent etre chargés avant le ready event
  // (utilisés par le rendu initial des pages : icons, config, utils, state,
  // auth pour requireAuth, sponsor pour les badges/tiers, etc.)
  var modules = [
    base + 'core/icons.js',
    base + 'core/config.js',
    base + 'core/utils.js',
    base + 'core/state.js',
    base + 'core/theme.js',
    base + 'core/sponsor.js',     // utilisé par products + my-profile au boot
    base + 'features/auth.js',    // requireAuth utilisé partout
    base + 'components/ui.js',
    base + 'components/shell.js',
    base + 'components/bottom-nav.js'
  ];

  // Modules NON-critiques : chargés en arrière-plan après ready (ne bloquent rien)
  var lazyModules = [
    base + 'core/beta-banner.js', // bandeau 'Mode test' (peut être masqué)
    base + 'core/pwa.js',         // service worker register, install prompt
    base + 'core/share.js',       // utilisé seulement au clic "partager"
    base + 'core/payment.js',     // ancien helper (conservé pour compat)
    base + 'core/push.js',        // notifications push, opt-in
    base + 'core/security.js',    // anti-spam helpers en background
    base + 'core/geo.js',         // géoloc (chargé avant l'utilisateur clique sur "Activer")
    base + 'core/email-verify.js' // bandeau email verif
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
