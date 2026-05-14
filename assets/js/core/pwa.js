// ═══════════════════════════════════════════════════════════════════
//  CORE / PWA — Enregistrement Service Worker + prompt d'installation
// ═══════════════════════════════════════════════════════════════════

(function() {
  if (!('serviceWorker' in navigator)) return;

  // ── Enregistrement SW ──
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function(reg) {
        console.log('[PWA] Service worker enregistré', reg.scope);

        // Détecte une nouvelle version disponible
        reg.addEventListener('updatefound', function() {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function() {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              _showUpdateBanner(sw);
            }
          });
        });
      })
      .catch(function(err) { console.warn('[PWA] SW failed', err); });
  });

  // ── Prompt d'installation (beforeinstallprompt) ──
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    // N'affiche pas le bouton si déjà installé ou refusé récemment
    if (localStorage.getItem('dj_pwa_dismissed')) {
      var until = parseInt(localStorage.getItem('dj_pwa_dismissed') || '0', 10);
      if (Date.now() < until) return;
    }
    _showInstallButton();
  });

  window.addEventListener('appinstalled', function() {
    console.log('[PWA] App installée');
    localStorage.removeItem('dj_pwa_dismissed');
    _hideInstallButton();
    if (window.toast) window.toast('DjamikShop installé sur votre écran d\'accueil !', 'success');
  });

  // ── UI : bouton flottant "Installer" ──
  function _showInstallButton() {
    if (document.getElementById('pwa-install-btn')) return;
    _injectStyles();

    var btn = document.createElement('button');
    btn.id = 'pwa-install-btn';
    btn.className = 'pwa-install-btn';
    btn.innerHTML =
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="18" height="18">' +
        '<path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4"/>' +
        '<polyline points="7 10 12 15 17 10"/>' +
        '<line x1="12" y1="15" x2="12" y2="3"/>' +
      '</svg>' +
      '<span>Installer l\'app</span>' +
      '<span class="pwa-install-close" title="Plus tard">×</span>';

    btn.querySelector('span:last-child').addEventListener('click', function(e) {
      e.stopPropagation();
      _hideInstallButton();
      // Re-propose dans 7 jours
      localStorage.setItem('dj_pwa_dismissed', String(Date.now() + 7 * 24 * 3600 * 1000));
    });

    btn.addEventListener('click', function() {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function(choice) {
        if (choice.outcome !== 'accepted') {
          localStorage.setItem('dj_pwa_dismissed', String(Date.now() + 3 * 24 * 3600 * 1000));
        }
        deferredPrompt = null;
        _hideInstallButton();
      });
    });

    document.body.appendChild(btn);
  }

  function _hideInstallButton() {
    var btn = document.getElementById('pwa-install-btn');
    if (btn) btn.remove();
  }

  // ── UI : bandeau "Nouvelle version" ──
  function _showUpdateBanner(sw) {
    if (document.getElementById('pwa-update-banner')) return;
    _injectStyles();

    var bar = document.createElement('div');
    bar.id = 'pwa-update-banner';
    bar.className = 'pwa-update-banner';
    bar.innerHTML =
      '<span>Nouvelle version disponible</span>' +
      '<button class="pwa-update-btn">Actualiser</button>';

    bar.querySelector('.pwa-update-btn').addEventListener('click', function() {
      sw.postMessage({ type: 'SKIP_WAITING' });
      window.location.reload();
    });

    document.body.appendChild(bar);
  }

  // ── Styles ──
  function _injectStyles() {
    if (document.getElementById('pwa-styles')) return;
    var s = document.createElement('style');
    s.id = 'pwa-styles';
    s.textContent = [
      '.pwa-install-btn{position:fixed;bottom:20px;right:20px;z-index:2000;display:flex;align-items:center;gap:10px;padding:12px 18px;background:var(--primary,#E8501A);color:#fff;border:none;border-radius:999px;font-weight:700;font-size:.875rem;cursor:pointer;box-shadow:0 8px 24px rgba(232,80,26,.4);font-family:inherit;animation:pwaSlideUp .35s ease}',
      '.pwa-install-btn:hover{transform:translateY(-2px);box-shadow:0 12px 28px rgba(232,80,26,.5)}',
      '.pwa-install-close{margin-left:4px;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:rgba(255,255,255,.2);font-size:16px;line-height:1}',
      '.pwa-install-close:hover{background:rgba(255,255,255,.35)}',
      '.pwa-update-banner{position:fixed;top:0;left:0;right:0;z-index:2100;display:flex;align-items:center;justify-content:center;gap:14px;padding:10px 16px;background:#1e293b;color:#fff;font-size:.875rem;animation:pwaSlideDown .3s ease}',
      '.pwa-update-btn{background:var(--primary,#E8501A);color:#fff;border:none;border-radius:6px;padding:6px 14px;font-weight:600;cursor:pointer;font-family:inherit}',
      '@keyframes pwaSlideUp{from{transform:translateY(120%);opacity:0}to{transform:translateY(0);opacity:1}}',
      '@keyframes pwaSlideDown{from{transform:translateY(-100%)}to{transform:translateY(0)}}',
      '@media(max-width:600px){.pwa-install-btn{bottom:80px;right:14px;left:14px;justify-content:center}}'
    ].join('');
    document.head.appendChild(s);
  }
})();
