// ═══════════════════════════════════════════════════════════════════
//  CORE / SPONSOR — helpers tiers + boosts (cache + UI)
// ═══════════════════════════════════════════════════════════════════

(function() {

  var _myTierCache = null;
  var _myTierTime  = 0;
  var TIER_CACHE_MS = 60 * 1000;   // 1 min

  var _userTiersCache = {};        // uid -> tier
  var _activeBoostSet = null;      // Set des product_ids boostés
  var _activeBoostTime = 0;
  var BOOST_CACHE_MS = 30 * 1000;  // 30s

  // ── Tier de l'user courant ──
  window.myTier = async function(force) {
    if (!force && _myTierCache && (Date.now() - _myTierTime) < TIER_CACHE_MS) return _myTierCache;
    if (!window._supabase) return 'free';
    try {
      var r = await window._supabase.rpc('my_tier');
      _myTierCache = (r && r.data) || 'free';
      _myTierTime = Date.now();
      return _myTierCache;
    } catch(e) { return 'free'; }
  };

  // ── Tier d'un autre user (batch) ──
  window.fetchUserTiers = async function(uids) {
    if (!window._supabase || !uids || !uids.length) return {};
    var todo = uids.filter(function(u){ return u && _userTiersCache[u] === undefined; });
    if (todo.length) {
      try {
        var r = await window._supabase
          .from('subscriptions')
          .select('user_id, tier, expires_at')
          .in('user_id', todo);
        if (r && r.data) {
          r.data.forEach(function(s) {
            // Vérifie validité
            var valid = !s.expires_at || new Date(s.expires_at) > new Date();
            _userTiersCache[s.user_id] = valid ? s.tier : 'free';
          });
        }
        // Marque ceux non trouvés comme free
        todo.forEach(function(u){ if (_userTiersCache[u] === undefined) _userTiersCache[u] = 'free'; });
      } catch(e) {
        todo.forEach(function(u){ _userTiersCache[u] = 'free'; });
      }
    }
    var out = {};
    uids.forEach(function(u){ out[u] = _userTiersCache[u] || 'free'; });
    return out;
  };

  // ── Tier d'un user (sync depuis cache) ──
  window.cachedUserTier = function(uid) {
    return _userTiersCache[uid] || 'free';
  };

  // ── Active boosts : retourne un Set des product_ids actuellement boostés ──
  window.fetchActiveBoosts = async function(productIds, force) {
    if (!window._supabase || !productIds || !productIds.length) return new Set();
    if (!force && _activeBoostSet && (Date.now() - _activeBoostTime) < BOOST_CACHE_MS) return _activeBoostSet;
    try {
      var r = await window._supabase
        .from('boosts')
        .select('product_id')
        .gt('expires_at', new Date().toISOString())
        .in('product_id', productIds);
      _activeBoostSet = new Set((r && r.data || []).map(function(x){ return x.product_id; }));
      _activeBoostTime = Date.now();
      return _activeBoostSet;
    } catch(e) { return new Set(); }
  };

  // ── Boost un produit (insert + invalide cache) ──
  window.boostProduct = async function(productId) {
    if (!window._supabase) throw new Error('Service indisponible');
    var u = await window._supabase.auth.getUser();
    var uid = u && u.data && u.data.user && u.data.user.id;
    if (!uid) throw new Error('Connexion requise');
    var r = await window._supabase.from('boosts').insert([{ product_id: productId, user_id: uid }]);
    if (r.error) throw r.error;
    _activeBoostSet = null;   // invalide cache
    _activeBoostTime = 0;
    return true;
  };

  // ── Quota boosts du jour (utilise SQL helper) ──
  window.boostsUsedToday = async function() {
    if (!window._supabase) return 0;
    try {
      var u = await window._supabase.auth.getUser();
      var uid = u.data && u.data.user && u.data.user.id;
      if (!uid) return 0;
      var r = await window._supabase
        .from('boosts')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', uid)
        .gt('started_at', new Date(Date.now() - 24*3600*1000).toISOString());
      return (r && r.count) || 0;
    } catch(e) { return 0; }
  };

  window.tierBoostDailyLimit = function(t) {
    if (t === 'premium') return 15;
    if (t === 'vip') return 5;
    return 0;
  };

  // ── Infos abonnement (tier + jours restants) ──
  var _subInfoCache = null;
  var _subInfoTime  = 0;
  window.mySubscriptionInfo = async function(force) {
    if (!force && _subInfoCache && (Date.now() - _subInfoTime) < TIER_CACHE_MS) return _subInfoCache;
    if (!window._supabase) return { tier: 'free', days_left: null };
    try {
      var r = await window._supabase.rpc('my_subscription_info');
      _subInfoCache = (r && r.data) || { tier: 'free', days_left: null };
      _subInfoTime = Date.now();
      return _subInfoCache;
    } catch(e) { return { tier: 'free', days_left: null }; }
  };

  // ── Auto-downgrade : appelé silencieusement au démarrage ──
  window.processExpiredSubs = async function() {
    if (!window._supabase) return;
    try {
      // Appel quotidien max (cache localStorage)
      var last = parseInt(localStorage.getItem('dj_last_downgrade_check') || '0', 10);
      if (Date.now() - last < 6 * 3600 * 1000) return;   // max 1× / 6h
      await window._supabase.rpc('process_expired_subscriptions');
      localStorage.setItem('dj_last_downgrade_check', String(Date.now()));
    } catch(e) { /* silencieux */ }
  };

  // Au démarrage, vérifie après 3s (laisse l'app se charger)
  setTimeout(function(){ window.processExpiredSubs && window.processExpiredSubs(); }, 3000);

  window.tierListingLimit = function(t) {
    if (t === 'premium') return 100;
    if (t === 'vip') return 50;
    return 10;
  };

  // ── Badge HTML pour un tier ──
  window.tierBadge = function(tier, opts) {
    opts = opts || {};
    if (tier === 'vip') {
      return '<span class="tier-badge tier-vip" title="Vendeur VIP">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M2 7l4.5 4L12 4l5.5 7L22 7l-2 12H4L2 7z"/></svg>' +
        (opts.compact ? '' : ' VIP') +
      '</span>';
    }
    if (tier === 'premium') {
      return '<span class="tier-badge tier-premium" title="Vendeur Premium">' +
        '<svg viewBox="0 0 24 24" fill="currentColor" width="11" height="11"><path d="M12 2l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg>' +
        (opts.compact ? '' : ' Premium') +
      '</span>';
    }
    return '';
  };

  // ── Inject les styles tier+boost (1 fois) ──
  function _injectStyles() {
    if (document.getElementById('sponsor-styles')) return;
    var s = document.createElement('style');
    s.id = 'sponsor-styles';
    s.textContent = [
      // Badges
      '.tier-badge{display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:800;padding:3px 7px;border-radius:4px;text-transform:uppercase;letter-spacing:.06em;line-height:1;vertical-align:middle}',
      '.tier-badge.tier-vip{background:linear-gradient(135deg,#FFE08A,#F5B100,#B8830C);color:#3D2700;box-shadow:0 1px 3px rgba(245,177,0,.4),inset 0 1px 0 rgba(255,255,255,.4);text-shadow:0 1px 0 rgba(255,255,255,.3)}',
      '.tier-badge.tier-premium{background:linear-gradient(135deg,#C4B5FD,#7C3AED,#4C1D95);color:#fff;box-shadow:0 1px 3px rgba(124,58,237,.4),inset 0 1px 0 rgba(255,255,255,.2)}',

      // Cards VIP/Premium (appliqué via .product-card.tier-vip ou .tier-premium)
      '.product-card.tier-vip{border:2px solid transparent !important;background:linear-gradient(180deg,#fff,#fff) padding-box,linear-gradient(135deg,#FFE08A,#F5B100,#B8830C) border-box !important;box-shadow:0 4px 16px rgba(245,177,0,.18) !important;position:relative}',
      '.product-card.tier-vip:hover{box-shadow:0 12px 32px rgba(245,177,0,.32) !important}',
      '.product-card.tier-vip::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,220,130,.25) 50%,transparent 70%);background-size:250% 100%;background-position:200% 0;animation:tierShine 3.5s ease-in-out infinite;pointer-events:none;border-radius:inherit;z-index:1}',
      '@keyframes tierShine{to{background-position:-200% 0}}',

      '.product-card.tier-premium{border:2px solid transparent !important;background:linear-gradient(180deg,#fff,#fff) padding-box,linear-gradient(135deg,#C4B5FD,#7C3AED,#4C1D95) border-box !important;box-shadow:0 4px 16px rgba(124,58,237,.18) !important;position:relative}',
      '.product-card.tier-premium:hover{box-shadow:0 12px 32px rgba(124,58,237,.32) !important}',

      // Badge boost actif
      '.boost-badge-active{position:absolute;top:8px;right:50px;background:linear-gradient(135deg,#FF8A3D,#E8501A);color:#fff;padding:4px 9px;border-radius:100px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;box-shadow:0 2px 8px rgba(232,80,26,.35);z-index:3;display:inline-flex;align-items:center;gap:4px}',
      '.boost-badge-active svg{width:11px;height:11px}'
    ].join('');
    document.head.appendChild(s);
  }
  _injectStyles();

})();
