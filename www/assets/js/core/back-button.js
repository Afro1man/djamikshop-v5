// ═══════════════════════════════════════════════════════════════════
//  CORE / BACK BUTTON — Gère le bouton retour Android (Capacitor)
//  - Si on peut revenir en arrière dans l'historique → window.history.back()
//  - Sinon → ferme l'app (exitApp)
//  - Pop-up de confirmation avant exit (anti-tap accidentel)
// ═══════════════════════════════════════════════════════════════════

(function() {
  // Ne fait rien si on n'est pas dans Capacitor (= sur le web)
  if (!window.Capacitor || !window.Capacitor.isNativePlatform || !window.Capacitor.isNativePlatform()) {
    return;
  }

  var App = window.Capacitor.Plugins && window.Capacitor.Plugins.App;
  if (!App) return;

  var lastBack = 0;

  // Helper : detecte si on est sur la page racine (home)
  function _isHomePage() {
    var path = window.location.pathname || '';
    // Match /, /pages/, /pages/index.html, /index.html
    return /(^\/?$)|(\/pages\/?$)|(\/pages\/index\.html$)|(\/index\.html$)/i.test(path);
  }

  App.addListener('backButton', function(ev) {
    // 1. Si un overlay/modal est ouvert, on le ferme d'abord
    var openModal = document.querySelector('.modal-overlay, .rep-backdrop, .pwa-modal-backdrop, .side-menu.open, .toast-container .toast');
    if (openModal && openModal.classList.contains('side-menu')) {
      // Cas spécial : ferme le menu lateral
      openModal.classList.remove('open');
      var backdrop = document.querySelector('.side-menu-backdrop');
      if (backdrop) backdrop.classList.remove('open');
      return;
    }
    if (openModal && (openModal.classList.contains('modal-overlay') || openModal.classList.contains('rep-backdrop') || openModal.classList.contains('pwa-modal-backdrop'))) {
      openModal.remove();
      return;
    }

    // 2. Si on n'est PAS sur la home → revenir en arrière (sans verifier document.referrer qui est vide en WebView)
    if (!_isHomePage()) {
      if (window.history.length > 1) {
        window.history.back();
      } else {
        // Pas d'historique mais pas sur la home → retour explicite vers home
        window.location.href = '/pages/index.html';
      }
      return;
    }

    // 3. Sur la home → demande confirmation avant de quitter (double-tap)
    var now = Date.now();
    if (now - lastBack < 2000) {
      App.exitApp();
    } else {
      lastBack = now;
      if (window.toast) window.toast('Appuie encore une fois pour quitter', 'info', 1800);
    }
  });
})();
