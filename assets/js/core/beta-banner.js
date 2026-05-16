// ═══════════════════════════════════════════════════════════════════
//  BETA BANNER — Affiche un bandeau "Mode test" en haut de l'app
//  Peut être masqué par l'utilisateur (caché 7 jours via localStorage).
// ═══════════════════════════════════════════════════════════════════

(function() {
  // Désactive si déjà fermé récemment
  var dismissed = parseInt(localStorage.getItem('dj_beta_dismissed') || '0', 10);
  if (dismissed && Date.now() < dismissed) return;

  function _show() {
    if (document.getElementById('beta-banner')) return;
    var b = document.createElement('div');
    b.id = 'beta-banner';
    b.className = 'beta-banner';
    b.innerHTML =
      '<div class="beta-banner-inner">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>' +
        '<span class="beta-text"><strong>Mode test</strong> · Si tu vois un bug, dis-le moi sur ' +
          '<a href="https://wa.me/22789770002?text=' + encodeURIComponent('Bonjour Malik, j\'ai trouvé un bug sur DjamikShop : ') + '" target="_blank" class="beta-link">WhatsApp</a></span>' +
        '<button class="beta-close" aria-label="Fermer">×</button>' +
      '</div>';
    document.body.insertBefore(b, document.body.firstChild);
    b.querySelector('.beta-close').addEventListener('click', function() {
      b.remove();
      // Masque 7 jours
      localStorage.setItem('dj_beta_dismissed', String(Date.now() + 7 * 24 * 3600 * 1000));
    });
  }

  function _injectStyles() {
    if (document.getElementById('beta-styles')) return;
    var s = document.createElement('style');
    s.id = 'beta-styles';
    s.textContent = [
      '.beta-banner{position:sticky;top:0;z-index:1500;background:linear-gradient(135deg,#1E293B,#334155);color:#fff;padding:8px 0;font-family:Inter,system-ui,sans-serif;font-size:.82rem;line-height:1.4;animation:betaSlide .3s ease;border-bottom:1px solid rgba(255,255,255,.1)}',
      '.beta-banner-inner{display:flex;align-items:center;gap:10px;padding:0 16px;max-width:1280px;margin:0 auto}',
      '.beta-banner svg{color:#F59E0B;flex-shrink:0}',
      '.beta-text{flex:1;min-width:0}',
      '.beta-text strong{color:#FBBF24}',
      '.beta-link{color:#FBBF24;text-decoration:underline;font-weight:600;white-space:nowrap}',
      '.beta-link:hover{color:#FCD34D}',
      '.beta-close{background:transparent;border:none;color:rgba(255,255,255,.6);font-size:20px;cursor:pointer;padding:2px 6px;line-height:1;font-family:inherit;flex-shrink:0}',
      '.beta-close:hover{color:#fff}',
      '@keyframes betaSlide{from{transform:translateY(-100%)}to{transform:translateY(0)}}',
      '@media(max-width:600px){.beta-text{font-size:.75rem}}'
    ].join('');
    document.head.appendChild(s);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ _injectStyles(); _show(); });
  } else {
    _injectStyles(); _show();
  }
})();
