// ═══════════════════════════════════════════════════════════════════
//  CORE / PWA — SW + prompt d'installation multi-plateforme
//  Supporte: Chrome Android (auto), Edge/Chrome desktop (auto),
//            iOS Safari (instructions Add to Home Screen),
//            Firefox/Samsung/autres (instructions génériques).
// ═══════════════════════════════════════════════════════════════════

(function() {
  if (!('serviceWorker' in navigator)) return;

  // ── Enregistrement SW ──
  window.addEventListener('load', function() {
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(function(reg) {
        console.log('[PWA] Service worker enregistré', reg.scope);
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

  // ── Détection plateforme ──
  var ua      = navigator.userAgent || '';
  var isIOS   = /iPad|iPhone|iPod/.test(ua) && !window.MSStream;
  var isSafari = /^((?!chrome|android|crios|fxios|edgios).)*safari/i.test(ua);
  var isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
                     window.navigator.standalone === true;

  // ── Prompt d'installation natif (Chrome Android / Edge desktop) ──
  var deferredPrompt = null;

  window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredPrompt = e;
    if (!_isDismissed()) _showInstallButton('native');
  });

  window.addEventListener('appinstalled', function() {
    console.log('[PWA] App installée');
    localStorage.removeItem('dj_pwa_dismissed');
    _hideInstallButton();
    if (window.toast) window.toast('DjamikShop installé sur votre écran d\'accueil !', 'success');
  });

  // ── iOS Safari : pas d'événement, on affiche après 2s si pas installé ──
  if (isIOS && isSafari && !isStandalone) {
    setTimeout(function() {
      if (!_isDismissed()) _showInstallButton('ios');
    }, 2000);
  }

  // ── Fallback : Android non-Chrome après 8s sans événement ──
  if (!isIOS && !isStandalone) {
    setTimeout(function() {
      if (!deferredPrompt && !document.getElementById('pwa-install-btn') && !_isDismissed()) {
        _showInstallButton('generic');
      }
    }, 8000);
  }

  // ── API publique : permet de relancer depuis le menu ──
  window.showInstallPrompt = function() {
    localStorage.removeItem('dj_pwa_dismissed');
    if (isStandalone) {
      window.toast && window.toast('L\'app est déjà installée.', 'success');
      return;
    }
    if (deferredPrompt) { _triggerNative(); return; }
    if (isIOS && isSafari) { _showInstructionsModal('ios'); return; }
    _showInstructionsModal('generic');
  };

  function _isDismissed() {
    var until = parseInt(localStorage.getItem('dj_pwa_dismissed') || '0', 10);
    return until && Date.now() < until;
  }
  function _dismiss(days) {
    localStorage.setItem('dj_pwa_dismissed', String(Date.now() + days * 24 * 3600 * 1000));
  }

  // ── Bouton flottant ──
  function _showInstallButton(mode) {
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

    btn.querySelector('.pwa-install-close').addEventListener('click', function(e) {
      e.stopPropagation();
      _hideInstallButton();
      _dismiss(7);
    });

    btn.addEventListener('click', function() {
      if (mode === 'native' && deferredPrompt) { _triggerNative(); return; }
      _showInstructionsModal(mode === 'ios' ? 'ios' : 'generic');
    });

    document.body.appendChild(btn);
  }

  function _triggerNative() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    deferredPrompt.userChoice.then(function(choice) {
      if (choice.outcome !== 'accepted') _dismiss(3);
      deferredPrompt = null;
      _hideInstallButton();
    });
  }

  function _hideInstallButton() {
    var btn = document.getElementById('pwa-install-btn');
    if (btn) btn.remove();
  }

  // ── Modale d'instructions (iOS / Android non-Chrome) ──
  function _showInstructionsModal(mode) {
    if (document.getElementById('pwa-modal')) return;
    _injectStyles();

    var content;
    if (mode === 'ios') {
      content =
        '<h3>Installer DjamikShop sur iPhone</h3>' +
        '<ol class="pwa-steps">' +
          '<li><strong>1.</strong> Touchez le bouton <strong>Partager</strong> ' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18" style="vertical-align:-4px"><path d="M4 12v8a2 2 0 002 2h12a2 2 0 002-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>' +
            ' en bas de Safari</li>' +
          '<li><strong>2.</strong> Faites défiler et touchez <strong>« Sur l\'écran d\'accueil »</strong></li>' +
          '<li><strong>3.</strong> Touchez <strong>Ajouter</strong> en haut à droite</li>' +
        '</ol>' +
        '<p class="pwa-hint">⚠ Ça ne marche que sur <strong>Safari</strong>. Si tu es sur Chrome iOS, ouvre la page dans Safari d\'abord.</p>';
    } else {
      content =
        '<h3>Installer DjamikShop</h3>' +
        '<ol class="pwa-steps">' +
          '<li><strong>1.</strong> Ouvre le menu de ton navigateur (les <strong>3 points</strong> ⋮ en haut à droite)</li>' +
          '<li><strong>2.</strong> Touche <strong>« Installer l\'application »</strong> ou <strong>« Ajouter à l\'écran d\'accueil »</strong></li>' +
          '<li><strong>3.</strong> Confirme l\'installation</li>' +
        '</ol>' +
        '<p class="pwa-hint">💡 L\'option marche au mieux avec <strong>Google Chrome</strong> sur Android.</p>';
    }

    var modal = document.createElement('div');
    modal.id = 'pwa-modal';
    modal.className = 'pwa-modal-backdrop';
    modal.innerHTML =
      '<div class="pwa-modal">' +
        '<button class="pwa-modal-close" aria-label="Fermer">×</button>' +
        content +
        '<button class="pwa-modal-ok">Compris</button>' +
      '</div>';

    modal.addEventListener('click', function(e) {
      if (e.target === modal || e.target.classList.contains('pwa-modal-close') || e.target.classList.contains('pwa-modal-ok')) {
        modal.remove();
      }
    });

    document.body.appendChild(modal);
  }

  // ── Bandeau "Nouvelle version" ──
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
      '@media(max-width:600px){.pwa-install-btn{bottom:80px;right:14px;left:14px;justify-content:center}}',

      // Modal d'instructions
      '.pwa-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:3000;display:flex;align-items:center;justify-content:center;padding:16px;animation:pwaFade .2s ease}',
      '.pwa-modal{background:#fff;border-radius:18px;padding:28px 24px 20px;max-width:420px;width:100%;position:relative;box-shadow:0 20px 60px rgba(0,0,0,.3);animation:pwaPop .25s ease;font-family:inherit}',
      '.pwa-modal h3{font-family:Outfit,sans-serif;font-size:1.2rem;font-weight:700;margin-bottom:18px;color:#0F1115;padding-right:30px}',
      '.pwa-modal-close{position:absolute;top:12px;right:12px;width:32px;height:32px;border-radius:50%;border:none;background:#F1F2F6;color:#5A6273;font-size:20px;cursor:pointer;display:flex;align-items:center;justify-content:center;line-height:1;font-family:inherit}',
      '.pwa-modal-close:hover{background:#E5E8EE}',
      '.pwa-steps{list-style:none;padding:0;margin:0 0 16px;display:flex;flex-direction:column;gap:12px}',
      '.pwa-steps li{font-size:.92rem;line-height:1.5;color:#2B313D;padding-left:8px;border-left:3px solid #E8501A;padding-left:12px}',
      '.pwa-steps strong{color:#E8501A}',
      '.pwa-hint{font-size:.8rem;color:#5A6273;background:#FFF4EE;padding:10px 12px;border-radius:8px;margin-bottom:18px}',
      '.pwa-modal-ok{width:100%;padding:12px;background:#E8501A;color:#fff;border:none;border-radius:10px;font-weight:700;font-size:.95rem;cursor:pointer;font-family:inherit;transition:background .15s}',
      '.pwa-modal-ok:hover{background:#C03E0E}',
      '@keyframes pwaFade{from{opacity:0}to{opacity:1}}',
      '@keyframes pwaPop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}'
    ].join('');
    document.head.appendChild(s);
  }
})();
