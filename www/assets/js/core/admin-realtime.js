// ═══════════════════════════════════════════════════════════════════
//  CORE / ADMIN REALTIME
//  Notifications live pour l'admin : nouveau signalement, paiement,
//  inscription. Toast + son discret. Actif uniquement si user is admin.
// ═══════════════════════════════════════════════════════════════════

(function() {
  var initialized = false;

  async function _init() {
    if (initialized) return;
    if (!window._supabase || !window._supabase.auth) {
      setTimeout(_init, 500);
      return;
    }
    try {
      var u = await window._supabase.auth.getUser();
      var uid = u && u.data && u.data.user && u.data.user.id;
      if (!uid) return;
      var ad = await window._supabase.from('admins').select('user_id').eq('user_id', uid).maybeSingle();
      if (!ad || !ad.data) return;     // pas admin -> rien
      initialized = true;
      _subscribe();
    } catch(e) {}
  }

  // Son court (synthétisé via WebAudio, pas de fichier à charger)
  function _bip() {
    try {
      var ctx = new (window.AudioContext || window.webkitAudioContext)();
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0.001, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
      osc.connect(gain); gain.connect(ctx.destination);
      osc.start(); osc.stop(ctx.currentTime + 0.2);
    } catch(e) {}
  }

  function _subscribe() {
    var sb = window._supabase;

    // Nouveau signalement
    sb.channel('admin-rt-reports')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'reports' }, function() {
        _notify('🚩 Nouveau signalement reçu', 'reports');
      })
      .subscribe();

    // Nouveau paiement
    sb.channel('admin-rt-payments')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'payment_requests' }, function(p) {
        var ref = (p.new && p.new.reference) || '';
        _notify('💰 Nouveau paiement à valider' + (ref ? ' (' + ref + ')' : ''), 'payments');
      })
      .subscribe();

    // Nouvel utilisateur (via INSERT sur profiles)
    sb.channel('admin-rt-signups')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'profiles' }, function(p) {
        var name = (p.new && p.new.full_name) || 'Nouveau membre';
        _notify('👤 Inscription : ' + name, 'users');
      })
      .subscribe();
  }

  function _notify(text, where) {
    _bip();
    if (window.toast) window.toast(text, 'info', 6000);
    // Update badge admin dans le menu si présent
    var badge = document.getElementById('sm-admin-badge');
    if (badge) {
      var n = parseInt(badge.textContent || '0', 10) || 0;
      badge.textContent = (n + 1) > 9 ? '9+' : (n + 1);
      badge.classList.remove('hidden');
    }
  }

  // Démarre 2s après le chargement (laisse le temps à l'auth de se réveiller)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function(){ setTimeout(_init, 2000); });
  } else {
    setTimeout(_init, 2000);
  }
})();
