// ═══════════════════════════════════════════════════════════════════
//  CORE / BACK BUTTON — Gère le geste retour (Android APK + Web/PWA)
//
//  APK Capacitor :
//    - Modal/menu ouvert → ferme
//    - Sous-page → window.history.back()
//    - Home → confirme avec "Appuie encore pour quitter" (double-tap < 2s)
//
//  Web/PWA :
//    - Pareil mais : sur la home, on bloque le retour avec history.pushState
//      et on demande confirmation. Au 2e tap → on laisse partir.
// ═══════════════════════════════════════════════════════════════════

(function() {
  // ── Helpers ──
  function _isHomePage() {
    var path = window.location.pathname || '';
    return /(^\/?$)|(\/pages\/?$)|(\/pages\/index\.html$)|(\/index\.html$)/i.test(path);
  }

  function _closeOpenOverlay() {
    // Menu lateral ouvert
    var sideMenu = document.querySelector('.side-menu.open');
    if (sideMenu) {
      sideMenu.classList.remove('open');
      var bd = document.querySelector('.side-menu-backdrop');
      if (bd) bd.classList.remove('open');
      return true;
    }
    // Modal / backdrop
    var modal = document.querySelector('.modal-overlay, .rep-backdrop, .pwa-modal-backdrop');
    if (modal) { modal.remove(); return true; }
    return false;
  }

  var lastBack = 0;

  // ═══════════════════════════════════════════════════════════════════
  //  CAS 1 : APK Capacitor (Android natif)
  // ═══════════════════════════════════════════════════════════════════
  var isNative = window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform();
  if (isNative) {
    var App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (!App) return;

    App.addListener('backButton', function() {
      // 1. Ferme overlay si ouvert
      if (_closeOpenOverlay()) return;

      // 2. Sous-page → recule
      if (!_isHomePage()) {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          window.location.href = '/pages/index.html';
        }
        return;
      }

      // 3. Home → confirme avant de quitter
      var now = Date.now();
      if (now - lastBack < 2000) {
        App.exitApp();
      } else {
        lastBack = now;
        if (window.toast) window.toast('Appuie encore une fois pour quitter', 'info', 1800);
      }
    });
    return;
  }

  // ═══════════════════════════════════════════════════════════════════
  //  CAS 2 : Web / PWA installée (Chrome Android, etc.)
  // ═══════════════════════════════════════════════════════════════════
  // Astuce : on push un state "phantom" au chargement. Quand le user
  // fait retour, popstate se déclenche et on intercepte selon le contexte.

  // Push le phantom state seulement si on est sur la home
  // (sur les sous-pages, l'historique navigateur fait le job naturellement)
  function _installHomeGuard() {
    if (!_isHomePage()) return;
    // Push une entrée pour bloquer le retour
    try { history.pushState({ djamikGuard: true }, '', location.href); } catch(e) {}
  }

  _installHomeGuard();

  window.addEventListener('popstate', function(ev) {
    // Ferme overlay en priorite
    if (_closeOpenOverlay()) {
      // Re-push pour rester sur la page
      try { history.pushState({ djamikGuard: true }, '', location.href); } catch(e) {}
      return;
    }

    // Sur la home : confirme avant de laisser quitter
    if (_isHomePage()) {
      var now = Date.now();
      if (now - lastBack < 2000) {
        // 2e tap → on laisse partir (history.back natif a deja consume le state)
        // Le navigateur quitte la PWA / va a la page precedente
        return;
      } else {
        lastBack = now;
        if (window.toast) window.toast('Appuie encore une fois pour quitter', 'info', 1800);
        // Re-push le phantom pour bloquer le retour
        try { history.pushState({ djamikGuard: true }, '', location.href); } catch(e) {}
      }
    }
    // Sur sous-page : on laisse l'historique faire son job (back naturel)
  });
})();
