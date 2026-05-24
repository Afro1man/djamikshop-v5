// ═══════════════════════════════════════════════════════════════════
//  FEATURES / PRODUCTS — Listing, filtres, catégories
// ═══════════════════════════════════════════════════════════════════

window.filters = window.filters || { search:'', category:'', city:'', condition:'', sort:'created_at' };

// ── LOAD PRODUCTS ──
window.loadProducts = async function() {
  var grid = document.getElementById('products-grid');
  if (!grid) return;
  if (window.renderSkeletons) window.renderSkeletons(grid, 8);

  var f = window.filters;
  try {
    var products = await _fetchProducts(f);
    _renderGrid(grid, products);
    _renderRecent();
    _updateStats(products);
  } catch(e) {
    console.error('[DjamikShop] loadProducts error:', e);
    grid.innerHTML = '<div class="empty-state"><div class="empty-icon"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></div><h3>Erreur de chargement</h3><p>Vérifiez votre connexion.</p></div>';
  }
};

async function _fetchProducts(f) {
  // 1. Supabase (source primaire)
  var supabaseList = [];
  if (window._supabase) {
    try {
      var req = window._supabase.from('products').select('*').eq('sold', false).is('inactive_at', null);
      if (f.category)  req = req.eq('category', f.category);
      if (f.city)      req = req.eq('city', f.city);
      if (f.condition) req = req.eq('condition', f.condition);
      if (f.search)    req = req.ilike('title', '%' + f.search + '%');
      if (f.sort === 'price_asc')       req = req.order('price', { ascending: true });
      else if (f.sort === 'price_desc') req = req.order('price', { ascending: false });
      else                              req = req.order('created_at', { ascending: false });
      req = req.limit(60);
      var res = await req;
      if (res && !res.error && res.data) supabaseList = res.data;
      else if (res && res.error) console.warn('[products] Supabase fetch error:', res.error.message);
    } catch(e) { console.warn('[products] Supabase exception:', e); }
  }

  // 2. Fusionne avec les annonces locales (mes annonces non encore synchronisées)
  var local = (window.getAllProducts ? window.getAllProducts() : []).filter(function(p){ return !p.sold; });
  if (f.category)  local = local.filter(function(p){ return p.category === f.category; });
  if (f.city)      local = local.filter(function(p){ return p.city === f.city; });
  if (f.condition) local = local.filter(function(p){ return p.condition === f.condition; });
  if (f.search) { var q = f.search.toLowerCase(); local = local.filter(function(p){ return (p.title || '').toLowerCase().includes(q); }); }

  // 3. Fusion sans doublons (Supabase prioritaire sur local)
  var all = supabaseList.slice();
  local.forEach(function(p) {
    if (!all.find(function(x){ return x.id === p.id; })) all.push(p);
  });

  // 4. Tri final (au cas où local ait été ajouté hors-ordre)
  if (f.sort === 'price_asc')       all.sort(function(a,b){ return (a.price||0) - (b.price||0); });
  else if (f.sort === 'price_desc') all.sort(function(a,b){ return (b.price||0) - (a.price||0); });
  else if (f.sort === 'distance') {
    // Trie par proximité de l'utilisateur. Si pas de géoloc, fallback récence.
    var loc = window.getStoredLocation && window.getStoredLocation();
    if (!loc) {
      window.toast && window.toast('Active la géolocalisation pour trier par proximité.', 'error');
      all.sort(function(a,b){ return new Date(b.created_at||0) - new Date(a.created_at||0); });
    } else {
      all.sort(function(a,b){
        var da = window.distanceToProduct ? window.distanceToProduct(a) : null;
        var db = window.distanceToProduct ? window.distanceToProduct(b) : null;
        if (da == null) da = 999999;
        if (db == null) db = 999999;
        return da - db;
      });
    }
  }
  else all.sort(function(a,b){ return new Date(b.created_at||0) - new Date(a.created_at||0); });

  // 5. Enrichissement : tiers vendeurs + profils + boosts actifs (cache 30s)
  // Si les helpers ne sont pas encore chargés, on attend brièvement.
  if (all.length && !window.fetchUserTiers) {
    await new Promise(function(resolve) {
      var tries = 0;
      var iv = setInterval(function() {
        if (window.fetchUserTiers || ++tries > 20) { clearInterval(iv); resolve(); }
      }, 100);
    });
  }
  if (all.length && window.fetchUserTiers && window.fetchActiveBoosts) {
    var sellerIds = Array.from(new Set(all.map(function(p){ return p.seller_id; }).filter(Boolean)));
    var prodIds   = all.map(function(p){ return p.id; }).filter(Boolean);
    try {
      var [tiers, boostSet, profiles] = await Promise.all([
        window.fetchUserTiers(sellerIds),
        window.fetchActiveBoosts(prodIds),
        window.fetchUserProfiles ? window.fetchUserProfiles(sellerIds) : Promise.resolve({})
      ]);
      all.forEach(function(p) {
        p._sellerTier = tiers[p.seller_id] || 'free';
        p._isBoosted  = boostSet.has(p.id);
        p._sellerProfile = profiles[p.seller_id] || null;
      });
      // 6. Tri prioritaire stable :
      //    1) Boostés (toutes catégories) toujours en premier
      //    2) Premium > VIP > Free
      //    3) Si beaucoup de résultats ET géoloc dispo : annonces proches en premier
      //    4) Sinon, garde l'ordre du sort précédent (created_at, prix, etc.)
      var TIER_RANK = { premium: 3, vip: 2, free: 1 };
      var userLoc = window.getStoredLocation && window.getStoredLocation();
      var useGeoBoost = !!userLoc && all.length >= 10 && f.sort !== 'distance' && f.sort !== 'price_asc' && f.sort !== 'price_desc';

      // Pré-calcul des distances (une seule fois)
      if (useGeoBoost && window.distanceToProduct) {
        all.forEach(function(p){
          p._distance = window.distanceToProduct(p);
          if (p._distance == null) p._distance = 99999;
        });
      }

      all.sort(function(a, b) {
        if (a._isBoosted && !b._isBoosted) return -1;
        if (!a._isBoosted && b._isBoosted) return 1;
        var ra = TIER_RANK[a._sellerTier] || 1;
        var rb = TIER_RANK[b._sellerTier] || 1;
        if (ra !== rb) return rb - ra;
        // Tiebreaker géo : annonces proches d'abord (dans le même groupe tier)
        if (useGeoBoost) {
          var da = a._distance, db = b._distance;
          if (da !== db) return da - db;
        }
        return 0;
      });
    } catch(e) { console.warn('[products] tier/boost enrich failed', e); }
  }

  return all;
}

function _renderGrid(grid, products) {
  var titleEl = document.getElementById('section-title');
  if (titleEl) {
    var f = window.filters;
    if (!f.category && !f.search) titleEl.innerHTML = '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 3z"/></svg> Toutes les annonces (' + products.length + ')';
    else titleEl.textContent = products.length + ' résultat' + (products.length !== 1 ? 's' : '');
  }
  if (!products.length) {
    grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg></div><h3>Aucune annonce trouvée</h3><p>Essayez d\'autres filtres.</p><a href="add-product.html" class="btn btn-primary mt-4"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.25 12a19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 3.16 1h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9a16 16 0 0 0 6.72 6.72l1.36-1.36a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg> Vendre maintenant</a></div>';
    return;
  }
  var likes = window.getLikes ? window.getLikes() : [];
  grid.innerHTML = products.map(function(p) {
    var liked = likes.indexOf(p.id) !== -1;
    var cat = (window.APP.categories || []).find(function(c){ return c.id === p.category; });
    var disc = parseInt(p.discount) || 0;
    var oldPx = disc > 0 ? Math.round(p.price / (1 - disc/100)) : 0;
    var boosted = (p._isBoosted === true) || (window.isBoosted && window.isBoosted(p.id));
    var sellerTier = p._sellerTier || 'free';
    // ── Cards normales en liste : pas de design special. Annonce boostee = juste une petite etoile doree en coin ──
    return '<div class="card product-card">' +
      (boosted ? '<div class="boost-star" title="Annonce boostee"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3 7 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1z"/></svg></div>' : '') +
      (disc > 0 ? '<div class="card-badge badge-discount" style="' + (boosted ? 'top:36px' : '') + '">-' + disc + '%</div>' : '') +
      '<button class="card-like-btn ' + (liked ? 'liked' : '') + '" onclick="window.toggleLikeCard(\'' + p.id + '\',this);event.stopPropagation()">' + (liked ? '<svg class="dj-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' : '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>') + '</button>' +
      '<div class="card-img-wrap" onclick="window.location.href=\'product-details.html?id=' + p.id + '\'">' +
        (p.image_url ? '<img src="' + p.image_url + '" alt="' + window.escHtml(p.title || '') + '" loading="lazy">' : '<div class="card-img-placeholder">' + (cat ? cat.icon : '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>') + '</div>') +
      '</div>' +
      '<div class="card-body" onclick="window.location.href=\'product-details.html?id=' + p.id + '\'">' +
        '<div class="card-title">' + window.escHtml(p.title || '') + '</div>' +
        '<div class="card-price">' + window.formatPrice(p.price) + (oldPx > 0 ? '<span class="old">' + window.formatPrice(oldPx) + '</span>' : '') + '</div>' +
        // Vendeur (avatar + nom)
        (function(){
          var prof = p._sellerProfile;
          if (!prof) return '';
          var name = prof.full_name || 'Vendeur';
          var avatar = prof.avatar_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=E8501A&color=fff&size=24');
          var tBadge = (window.tierBadge && (sellerTier === 'vip' || sellerTier === 'premium')) ? window.tierBadge(sellerTier, { compact: true }) : '';
          return '<a class="card-seller" href="my-profile.html?id=' + p.seller_id + '" onclick="event.stopPropagation()">' +
            '<img src="' + avatar + '" alt="">' +
            '<span class="card-seller-name">' + window.escHtml(name) + '</span>' +
            tBadge +
          '</a>';
        })() +
        '<div class="card-meta"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + (p.city || '—') +
          (function(){
            var d = window.distanceToProduct ? window.distanceToProduct(p) : null;
            return d != null ? ' <span style="color:var(--brand,#E8501A);font-weight:600">· ' + window.formatDistance(d) + '</span>' : '';
          })() +
          ' · ' + window.relativeDate(p.created_at) + '</div>' +
        (p.condition ? '<div style="margin-top:6px">' + window.conditionBadge(p.condition) + '</div>' : '') +
      '</div></div>';
  }).join('');
}

window.toggleLikeCard = function(id, btn) {
  var added = window.toggleLike ? window.toggleLike(id) : false;
  btn.innerHTML = added ? '<svg class="dj-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' : '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>';
  btn.classList.toggle('liked', added);
  window.updateWishlistBadge && window.updateWishlistBadge();
};

// ── RECENT ──
function _renderRecent() {
  var container = document.getElementById('recent-grid');
  var section = document.getElementById('recent-section');
  if (!container || !section) return;
  var history = window.getHistory ? window.getHistory() : [];
  if (!history.length) { section.style.display = 'none'; return; }
  var products = [];
  history.forEach(function(id) {
    var p = window.getProductById ? window.getProductById(id) : null;
    if (p) products.push(p);
  });
  if (!products.length) { section.style.display = 'none'; return; }
  section.style.display = 'block';
  container.innerHTML = products.slice(0, 10).map(function(p) {
    return '<div class="flash-card" onclick="window.location.href=\'product-details.html?id=' + p.id + '\'">' +
      '<div class="flash-card-img">' + (p.image_url ? '<img src="' + p.image_url + '" alt="">' : '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:2rem"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div>') + '</div>' +
      '<div class="flash-card-body">' +
        '<div class="flash-card-title">' + window.escHtml(p.title || '') + '</div>' +
        '<div class="flash-card-price">' + window.formatPrice(p.price) + '</div>' +
      '</div></div>';
  }).join('');
}

// ── CATEGORIES ──
function _renderCats() {
  var grid  = document.getElementById('cat-grid');
  var pills = document.getElementById('cat-pills');
  var row   = document.getElementById('cats-row');
  if (!grid && !pills && !row) return;
  var cats = window.APP.categories || [];
  if (grid) {
    grid.innerHTML = cats.map(function(c) {
      return '<button class="cat-card" data-cat="' + c.id + '" title="' + c.label + '" aria-label="' + c.label + '" onclick="setCat(\'' + c.id + '\')">' +
        '<span class="cat-card-icon">' + c.icon + '</span>' +
        '<span class="cat-card-label">' + c.label + '</span></button>';
    }).join('');
  }
  if (pills) {
    pills.innerHTML = '<button class="cat-pill ' + (!window.filters.category ? 'active' : '') + '" onclick="setCat(\'\')">Tout</button>' +
      cats.map(function(c) {
        return '<button class="cat-pill ' + (window.filters.category === c.id ? 'active' : '') + '" data-cat="' + c.id + '" onclick="setCat(\'' + c.id + '\')">' + c.icon + ' ' + c.label + '</button>';
      }).join('');
  }
  if (row) {
    // Chips horizontaux scrollables (mobile-first)
    row.innerHTML = '<button class="cat-pill ' + (!window.filters.category ? 'active' : '') + '" onclick="setCat(\'\')">Tout</button>' +
      cats.map(function(c) {
        return '<button class="cat-pill ' + (window.filters.category === c.id ? 'active' : '') + '" data-cat="' + c.id + '" onclick="setCat(\'' + c.id + '\')">' + c.icon + ' ' + c.label + '</button>';
      }).join('');
  }
}

window.setCat = function(id) {
  window.filters.category = id;
  document.querySelectorAll('.cat-card').forEach(function(el) {
    el.classList.toggle('active', el.dataset.cat === id);
  });
  document.querySelectorAll('.cat-pill').forEach(function(el) {
    el.classList.toggle('active', el.dataset.cat === id || (!id && !el.dataset.cat));
  });
  window.loadProducts();
};

// ── FILTERS ──
function _initFilters() {
  var cityS = document.getElementById('city-select');
  var condS = document.getElementById('cond-select');
  var sortS = document.getElementById('sort-select');
  var resetBtn = document.getElementById('reset-filters');

  if (cityS) {
    cityS.innerHTML = '<option value="">Toutes villes</option>' + (window.APP.cities || []).map(function(c){ return '<option value="' + c + '">' + c + '</option>'; }).join('');
    cityS.addEventListener('change', function(){ window.filters.city = cityS.value; window.loadProducts(); });
  }
  if (condS) {
    condS.innerHTML = '<option value="">Tous états</option>' + (window.APP.conditions || []).map(function(c){ return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('');
    condS.addEventListener('change', function(){ window.filters.condition = condS.value; window.loadProducts(); });
  }
  if (sortS) {
    sortS.addEventListener('change', function(){ window.filters.sort = sortS.value; window.loadProducts(); });
  }
  if (resetBtn) {
    resetBtn.addEventListener('click', function(){
      window.filters = { search:'', category:'', city:'', condition:'', sort:'created_at' };
      if(cityS) cityS.value = ''; if(condS) condS.value = ''; if(sortS) sortS.value = 'created_at';
      _renderCats(); window.loadProducts();
    });
  }
}

// ── STATS ──
// On masque la barre de stats (annonces + vendeurs) jusqu'a atteindre le seuil de 200 vendeurs.
// En-dessous, afficher de petits chiffres fait peur aux nouveaux users.
// Au-dela, les chiffres deviennent un atout de credibilite.
var STATS_MIN_SELLERS_THRESHOLD = 200;

function _updateStats(products) {
  var pEl = document.getElementById('stat-products');
  var sEl = document.getElementById('stat-sellers');
  var heroStats = document.querySelector('.hero-stats');

  if (window._supabase && !window.APP.demoMode) {
    window._supabase.from('profiles').select('id', { count: 'exact', head: true })
      .then(function(res){
        var sellersCount = (res && res.count) || 0;
        // Seuil : on n'affiche la barre que si on a depasse le minimum de vendeurs
        if (sellersCount < STATS_MIN_SELLERS_THRESHOLD) {
          if (heroStats) heroStats.style.display = 'none';
          return;
        }
        if (heroStats) heroStats.style.display = '';
        if (pEl) pEl.innerHTML = '<span>' + (products ? products.length : 0) + '</span>';
        if (sEl) sEl.innerHTML = '<span>' + sellersCount + '</span>';
      })
      .catch(function(){
        if (heroStats) heroStats.style.display = 'none';
      });
  } else {
    // Mode demo : on cache la barre
    if (heroStats) heroStats.style.display = 'none';
  }
}

// ── INIT ──
window.onDjamikReady(function() {
  if (!document.getElementById('products-grid')) return;
  var params = new URLSearchParams(location.search);
  if (params.get('q'))   window.filters.search = params.get('q');
  if (params.get('cat')) window.filters.category = params.get('cat');
  _renderCats();
  _initFilters();
  window.loadProducts();
});
