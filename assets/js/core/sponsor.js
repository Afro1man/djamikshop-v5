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
  // Utilise la RPC publique users_tiers (bypass RLS pour exposer uniquement le tier)
  window.fetchUserTiers = async function(uids) {
    if (!window._supabase || !uids || !uids.length) return {};
    var todo = uids.filter(function(u){ return u && _userTiersCache[u] === undefined; });
    if (todo.length) {
      try {
        var r = await window._supabase.rpc('users_tiers', { uids: todo });
        if (r && r.data) {
          r.data.forEach(function(s) {
            _userTiersCache[s.user_id] = s.tier || 'free';
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

  // ── Profils utilisateurs (batch + cache) — pour afficher avatar + nom sur les cartes ──
  var _profilesCache = {};
  window.fetchUserProfiles = async function(uids) {
    if (!window._supabase || !uids || !uids.length) return {};
    var todo = uids.filter(function(u){ return u && _profilesCache[u] === undefined; });
    if (todo.length) {
      try {
        var r = await window._supabase
          .from('profiles')
          .select('id, full_name, avatar_url')
          .in('id', todo);
        if (r && r.data) {
          r.data.forEach(function(p){ _profilesCache[p.id] = p; });
        }
        todo.forEach(function(u){ if (_profilesCache[u] === undefined) _profilesCache[u] = null; });
      } catch(e) { todo.forEach(function(u){ _profilesCache[u] = null; }); }
    }
    var out = {};
    uids.forEach(function(u){ out[u] = _profilesCache[u] || null; });
    return out;
  };

  window.cachedUserProfile = function(uid) {
    return _profilesCache[uid] || null;
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

      // ── CARDS VIP : bordure flow + double brillance + glow pulsé ──
      '.product-card.tier-vip{border:none !important;position:relative;background:#fff !important;box-shadow:0 4px 16px rgba(245,177,0,.18),0 0 0 2px rgba(245,177,0,.4) !important;animation:tierVipGlow 3s ease-in-out infinite}',
      '.product-card.tier-vip::before{content:"";position:absolute;inset:-2px;border-radius:inherit;padding:2px;background:linear-gradient(135deg,#FFE08A,#F5B100,#B8830C,#FFE08A,#F5B100,#B8830C);background-size:300% 300%;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:tierBorderFlow 4s linear infinite;pointer-events:none;z-index:2}',
      '.product-card.tier-vip::after{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,220,130,.45) 50%,transparent 70%);background-size:250% 100%;background-position:200% 0;animation:tierShine 3s ease-in-out infinite;pointer-events:none;border-radius:inherit;z-index:1;mix-blend-mode:screen}',
      '.product-card.tier-vip:hover{box-shadow:0 16px 36px rgba(245,177,0,.45),0 0 0 2px rgba(245,177,0,.6) !important}',
      '@keyframes tierVipGlow{0%,100%{box-shadow:0 4px 16px rgba(245,177,0,.18),0 0 0 2px rgba(245,177,0,.4)}50%{box-shadow:0 6px 24px rgba(245,177,0,.35),0 0 0 2px rgba(245,177,0,.6)}}',
      '@keyframes tierBorderFlow{0%{background-position:0% 50%}50%{background-position:100% 50%}100%{background-position:0% 50%}}',
      '@keyframes tierShine{0%{background-position:200% 0}100%{background-position:-200% 0}}',

      // ── CARDS PREMIUM : bordure violette flow + halo radial pulsé ──
      '.product-card.tier-premium{border:none !important;position:relative;background:#fff !important;box-shadow:0 4px 16px rgba(124,58,237,.18),0 0 0 2px rgba(124,58,237,.4) !important;animation:tierPremGlow 3.5s ease-in-out infinite}',
      '.product-card.tier-premium::before{content:"";position:absolute;inset:-2px;border-radius:inherit;padding:2px;background:linear-gradient(135deg,#C4B5FD,#7C3AED,#4C1D95,#C4B5FD,#7C3AED,#4C1D95);background-size:300% 300%;-webkit-mask:linear-gradient(#fff 0 0) content-box,linear-gradient(#fff 0 0);-webkit-mask-composite:xor;mask-composite:exclude;animation:tierBorderFlow 4.5s linear infinite;pointer-events:none;z-index:2}',
      '.product-card.tier-premium::after{content:"";position:absolute;inset:0;background:radial-gradient(circle at 80% 20%,rgba(196,181,253,.35) 0,transparent 50%),radial-gradient(circle at 20% 80%,rgba(124,58,237,.25) 0,transparent 50%);pointer-events:none;border-radius:inherit;z-index:1;animation:tierPremPulse 4s ease-in-out infinite}',
      '.product-card.tier-premium:hover{box-shadow:0 16px 36px rgba(124,58,237,.45),0 0 0 2px rgba(124,58,237,.6) !important}',
      '@keyframes tierPremGlow{0%,100%{box-shadow:0 4px 16px rgba(124,58,237,.18),0 0 0 2px rgba(124,58,237,.4)}50%{box-shadow:0 6px 24px rgba(124,58,237,.35),0 0 0 2px rgba(124,58,237,.6)}}',
      '@keyframes tierPremPulse{0%,100%{opacity:.7}50%{opacity:1}}',

      // Le contenu doit etre au-dessus des effets
      '.product-card.tier-vip > *,.product-card.tier-premium > *{position:relative;z-index:3}',

      // Badge boost actif — coin haut-gauche, compact et propre
      '.boost-badge-active{position:absolute !important;top:8px !important;left:8px !important;right:auto !important;width:auto !important;max-width:none !important;background:linear-gradient(135deg,#FF8A3D,#E8501A) !important;color:#fff !important;padding:4px 10px !important;border-radius:100px !important;font-size:10px !important;font-weight:800 !important;text-transform:uppercase !important;letter-spacing:.06em !important;line-height:1 !important;box-shadow:0 2px 8px rgba(232,80,26,.35) !important;z-index:5 !important;display:inline-flex !important;align-items:center !important;gap:4px !important;white-space:nowrap !important;animation:boostPulse 2s ease-in-out infinite !important}',
      '.boost-badge-active svg{width:11px !important;height:11px !important;flex-shrink:0 !important}',
      '@keyframes boostPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.06)}}',

      // Badges tier animés
      '.tier-badge.tier-vip{animation:badgeShine 3s ease-in-out infinite;background-size:200% 200% !important}',
      '.tier-badge.tier-premium{animation:badgeShine 3.5s ease-in-out infinite;background-size:200% 200% !important}',
      '@keyframes badgeShine{0%,100%{background-position:0% 50%}50%{background-position:100% 50%}}',

      // ── Vendeur sur les cartes produit (avatar + nom) ──
      '.card-seller{display:flex;align-items:center;gap:6px;margin-top:8px;padding:5px 8px;background:var(--surface-2);border-radius:100px;text-decoration:none;color:var(--ink-2);font-size:.78rem;font-weight:600;transition:background .15s;width:fit-content;max-width:100%;overflow:hidden}',
      '.card-seller:hover{background:var(--surface-3)}',
      '.card-seller img{width:18px;height:18px;border-radius:50%;flex-shrink:0;object-fit:cover}',
      '.card-seller-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}'
    ].join('');
    document.head.appendChild(s);
  }
  _injectStyles();

})();
