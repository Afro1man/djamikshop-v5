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

  App.addListener('backButton', function(ev) {
    // Si un overlay/modal est ouvert, on le ferme d'abord
    var openModal = document.querySelector('.modal-overlay, .rep-backdrop, .pwa-modal-backdrop');
    if (openModal) { openModal.remove(); return; }

    // Si on peut reculer dans l'historique, on recule
    if (window.history.length > 1 && document.referrer) {
      window.history.back();
      return;
    }
    // Sinon (on est sur la home/racine), demande confirmation avant de quitter
    var now = Date.now();
    if (now - lastBack < 2000) {
      // Deuxième tap en moins de 2s → exit
      App.exitApp();
    } else {
      lastBack = now;
      if (window.toast) window.toast('Appuie encore une fois pour quitter', 'info', 1800);
    }
  });
})();
