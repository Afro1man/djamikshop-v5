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

  var modules = [
    // Core
    base + 'core/icons.js',
    base + 'core/config.js',
    base + 'core/utils.js',
    base + 'core/state.js',
    base + 'core/theme.js',
    base + 'core/pwa.js',
    base + 'core/share.js',
    base + 'core/payment.js',
    base + 'core/push.js',
    base + 'core/security.js',
    base + 'core/geo.js',
    base + 'core/email-verify.js',
    // Auth chargé en core pour exposer window.logout/requireAuth partout
    base + 'features/auth.js',
    // Components
    base + 'components/ui.js',
    base + 'components/shell.js',
    base + 'components/bottom-nav.js'
  ];

  // ── Parallel download, ordered execution.
  // script.async = false sur des <script> injectés en JS = téléchargement parallèle
  // mais exécution garantie dans l'ordre d'insertion. Gain ~100ms vs cascade.
  function loadAll() {
    var remaining = modules.length;
    var done = function() {
      if (--remaining === 0) {
        window._djamikReady = true;
        document.dispatchEvent(new CustomEvent('djamik:ready'));
      }
    };
    var frag = document.createDocumentFragment();
    modules.forEach(function(src) {
      var s = document.createElement('script');
      s.src = src;
      s.async = false; // préserve l'ordre d'exécution
      s.onload = done;
      s.onerror = function() { console.warn('[DjamikShop] Failed to load', src); done(); };
      frag.appendChild(s);
    });
    document.head.appendChild(frag);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadAll);
  } else {
    loadAll();
  }
})();
