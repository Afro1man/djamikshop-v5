// ═══════════════════════════════════════════════════════════════════
//  CORE / BAN CHECK — Vérifie au démarrage si l'utilisateur est banni
//  Si oui : overlay full-screen "Compte suspendu" qui bloque tout
// ═══════════════════════════════════════════════════════════════════

(function() {

  // Cache pour éviter de spammer le serveur
  var checked = false;

  async function _check() {
    if (checked) return;
    if (!window._supabase || !window._supabase.auth) {
      setTimeout(_check, 800);
      return;
    }
    try {
      var u = await window._supabase.auth.getUser();
      if (!u || !u.data || !u.data.user) return;   // pas loggé : skip
      var r = await window._supabase.rpc('am_i_banned');
      if (r && r.data && r.data.banned) {
        _showSuspendedOverlay(r.data);
        checked = true;
      }
    } catch(e) {}
  }

  function _formatDate(iso) {
    if (!iso) return '';
    try {
      var d = new Date(iso);
      return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    } catch(e) { return iso; }
  }

  function _showSuspendedOverlay(banInfo) {
    if (document.getElementById('ban-overlay')) return;

    var durationText;
    if (banInfo.permanent) {
      durationText = '<strong>permanent</strong>';
    } else if (banInfo.banned_until) {
      durationText = "jusqu'au <strong>" + _formatDate(banInfo.banned_until) + "</strong>";
    } else {
      durationText = '<strong>indéterminé</strong>';
    }

    var overlay = document.createElement('div');
    overlay.id = 'ban-overlay';
    overlay.innerHTML =
      '<div class="ban-card">' +
        '<div class="ban-icon">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
            '<circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/>' +
          '</svg>' +
        '</div>' +
        '<h1>Compte suspendu</h1>' +
        '<p class="ban-reason">' + (banInfo.reason ? window.escHtml ? window.escHtml(banInfo.reason) : banInfo.reason : 'Aucun motif fourni') + '</p>' +
        '<div class="ban-details">' +
          '<div><span>Durée :</span> ' + durationText + '</div>' +
          (banInfo.ban_count > 1 ? '<div><span>Nombre de sanctions :</span> <strong>' + banInfo.ban_count + '</strong></div>' : '') +
        '</div>' +
        '<p class="ban-help">Tu penses qu\'il s\'agit d\'une erreur ?</p>' +
        '<div class="ban-actions">' +
          '<a href="https://wa.me/22789770002?text=' + encodeURIComponent('Bonjour, mon compte DjamikShop est suspendu et je pense que c\'est une erreur. Mon email : ') + '" target="_blank" class="ban-btn">📲 Contacter le support WhatsApp</a>' +
          '<button class="ban-logout" id="ban-logout-btn">Se déconnecter</button>' +
        '</div>' +
      '</div>';

    _injectStyles();
    document.body.appendChild(overlay);

    // Bloque le scroll et toutes les interactions sous l'overlay
    document.documentElement.style.overflow = 'hidden';

    // Bouton de déconnexion
    var logoutBtn = document.getElementById('ban-logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function() {
        if (window._supabase && window._supabase.auth) {
          await window._supabase.auth.signOut();
        }
        // Vide le cache local des données utilisateur
        try { localStorage.removeItem('dj_user_id'); } catch(e) {}
        window.location.href = '/pages/login.html';
      });
    }
  }

  function _injectStyles() {
    if (document.getElementById('ban-overlay-styles')) return;
    var s = document.createElement('style');
    s.id = 'ban-overlay-styles';
    s.textContent = [
      '#ban-overlay{position:fixed;inset:0;z-index:99999;background:rgba(15,17,21,.96);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;font-family:Inter,system-ui,sans-serif;animation:banFadeIn .25s ease}',
      '.ban-card{background:#fff;border-radius:20px;padding:32px 28px;max-width:440px;width:100%;text-align:center;box-shadow:0 20px 60px rgba(0,0,0,.5);animation:banPop .3s ease}',
      '.ban-icon{width:80px;height:80px;border-radius:50%;background:#FEE2E2;color:#991B1B;display:flex;align-items:center;justify-content:center;margin:0 auto 16px}',
      '.ban-icon svg{width:42px;height:42px}',
      '.ban-card h1{font-family:Outfit,sans-serif;font-size:1.6rem;font-weight:800;color:#0F1115;margin:0 0 10px}',
      '.ban-reason{background:#FEF2F2;border-left:4px solid #991B1B;padding:12px 14px;border-radius:0 8px 8px 0;color:#7F1D1D;font-size:.92rem;text-align:left;margin:0 0 14px;font-weight:600}',
      '.ban-details{font-size:.85rem;color:#5A6273;margin-bottom:18px;line-height:1.7}',
      '.ban-details span{color:#9AA1B0}',
      '.ban-help{font-size:.85rem;color:#5A6273;margin:14px 0 14px}',
      '.ban-actions{display:flex;flex-direction:column;gap:8px}',
      '.ban-btn{display:block;padding:12px 20px;background:#25D366;color:#fff;text-decoration:none;border-radius:10px;font-weight:700;font-size:.92rem;transition:background .15s}',
      '.ban-btn:hover{background:#1EA952}',
      '.ban-logout{padding:10px 20px;background:transparent;border:1px solid #E5E8EE;color:#5A6273;border-radius:10px;font-weight:600;font-size:.88rem;cursor:pointer;font-family:inherit}',
      '.ban-logout:hover{background:#F1F2F6;color:#0F1115}',
      '@keyframes banFadeIn{from{opacity:0}to{opacity:1}}',
      '@keyframes banPop{from{transform:scale(.92);opacity:0}to{transform:scale(1);opacity:1}}'
    ].join('');
    document.head.appendChild(s);
  }

  // Démarre la vérif après l'init de l'app
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(_check, 1500); });
  } else {
    setTimeout(_check, 1500);
  }

  // Re-check quand la session change (au cas où l'admin ban en live)
  setInterval(function(){ checked = false; _check(); }, 5 * 60 * 1000);
})();
