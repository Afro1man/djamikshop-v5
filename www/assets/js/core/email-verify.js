// ═══════════════════════════════════════════════════════════════════
//  CORE / EMAIL VERIFY — Bandeau "Vérifiez votre email" si pas confirmé
// ═══════════════════════════════════════════════════════════════════

(function() {

  // ── Vérifie l'état au démarrage et chaque changement d'auth ──
  function _check() {
    if (!window._supabase || !window._supabase.auth) {
      setTimeout(_check, 500);
      return;
    }
    window._supabase.auth.getUser().then(function(res) {
      var user = res && res.data && res.data.user;
      if (!user) { _hideBanner(); return; }
      if (user.email_confirmed_at || user.confirmed_at) { _hideBanner(); return; }
      _showBanner(user.email);
    }).catch(function(){});
  }

  function _showBanner(email) {
    if (document.getElementById('email-verify-banner')) return;
    _injectStyles();
    var bar = document.createElement('div');
    bar.id = 'email-verify-banner';
    bar.className = 'email-verify-banner';
    bar.innerHTML =
      '<div class="container evb-inner">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/></svg>' +
        '<div class="evb-text">' +
          '<strong>Email non vérifié.</strong> Vérifie ton email <code>' + (email || '') + '</code> pour publier des annonces, faire des offres ou envoyer des messages.' +
        '</div>' +
        '<button class="evb-btn" id="evb-resend">Renvoyer le lien</button>' +
        '<button class="evb-close" id="evb-close" aria-label="Fermer">×</button>' +
      '</div>';
    document.body.appendChild(bar);

    document.getElementById('evb-resend').addEventListener('click', async function() {
      if (!window._supabase || !email) return;
      var btn = this;
      btn.disabled = true; btn.textContent = 'Envoi…';
      try {
        await window._supabase.auth.resend({
          type: 'signup',
          email: email,
          options: { emailRedirectTo: window.location.origin + '/pages/auth-callback.html' }
        });
        window.toast && window.toast('Email renvoyé. Vérifie ta boîte de réception (et les spams).', 'success', 6000);
        btn.textContent = 'Email envoyé ✓';
      } catch(e) {
        window.toast && window.toast('Échec : ' + (e.message || 'erreur'), 'error');
        btn.disabled = false; btn.textContent = 'Renvoyer le lien';
      }
    });

    document.getElementById('evb-close').addEventListener('click', function() {
      bar.remove();
      // Re-vérifie dans 1h si l'utilisateur a confirmé entre-temps
      setTimeout(_check, 60 * 60 * 1000);
    });
  }

  function _hideBanner() {
    var b = document.getElementById('email-verify-banner');
    if (b) b.remove();
  }

  function _injectStyles() {
    if (document.getElementById('evb-styles')) return;
    var s = document.createElement('style');
    s.id = 'evb-styles';
    s.textContent = [
      '.email-verify-banner{position:sticky;top:0;z-index:1500;background:linear-gradient(135deg,#FEF3C7,#FDE68A);border-bottom:2px solid #F59E0B;padding:10px 0;font-family:Inter,system-ui,sans-serif;animation:evbSlide .3s ease}',
      '.evb-inner{display:flex;align-items:center;gap:12px;padding-left:var(--page-px,16px);padding-right:var(--page-px,16px)}',
      '.email-verify-banner svg{color:#92400E;flex-shrink:0}',
      '.evb-text{flex:1;min-width:0;font-size:.85rem;color:#78350F;line-height:1.4}',
      '.evb-text code{background:rgba(146,64,14,.15);padding:1px 6px;border-radius:4px;font-family:monospace;font-size:.85em}',
      '.evb-btn{flex-shrink:0;background:#92400E;color:#fff;border:none;padding:7px 14px;border-radius:8px;font-weight:600;font-size:.82rem;cursor:pointer;font-family:inherit;transition:background .15s}',
      '.evb-btn:hover{background:#78350F}',
      '.evb-btn:disabled{opacity:.6;cursor:not-allowed}',
      '.evb-close{flex-shrink:0;background:transparent;border:none;color:#78350F;font-size:22px;cursor:pointer;padding:2px 8px;line-height:1;font-family:inherit}',
      '@keyframes evbSlide{from{transform:translateY(-100%)}to{transform:translateY(0)}}',
      '@media(max-width:600px){.evb-text{font-size:.78rem}.evb-text code{display:none}.evb-btn{padding:6px 10px;font-size:.75rem}}'
    ].join('');
    document.head.appendChild(s);
  }

  // ── Init au démarrage + sur chaque changement d'auth ──
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(_check, 800); });
  } else {
    setTimeout(_check, 800);
  }

  // Re-check après login/signup
  if (window._supabase && window._supabase.auth) {
    window._supabase.auth.onAuthStateChange(function(){ setTimeout(_check, 300); });
  } else {
    var iv = setInterval(function() {
      if (window._supabase && window._supabase.auth) {
        window._supabase.auth.onAuthStateChange(function(){ setTimeout(_check, 300); });
        clearInterval(iv);
      }
    }, 200);
  }

})();
