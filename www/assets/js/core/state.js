// ═══════════════════════════════════════════════════════════════════
//  CORE / STATE — Gestion localStorage SCOPÉE PAR USER
//  Toutes les données utilisateur (panier, favoris, historique, commandes,
//  notifications, mes annonces, conversations, recherches, avis) sont
//  isolées par user_id pour qu'un compte ne voie pas les données d'un autre.
//  Les compteurs globaux (vues produit, boost) restent non-scopés car ils
//  appartiennent au produit, pas à l'utilisateur.
// ═══════════════════════════════════════════════════════════════════

// ── Détermine le scope user actuel (UUID Supabase ou 'guest') ──
// Source : `dj_user_id` mis à jour par auth.js au login/logout (sync, rapide).
// Fallback : ancien `dj_demo_session` pour rétrocompat des sessions démo.
function _userScope() {
  try {
    var uid = localStorage.getItem('dj_user_id');
    if (uid) return String(uid);
    // Rétrocompat
    var raw = localStorage.getItem('dj_demo_session');
    if (raw) {
      var s = JSON.parse(raw);
      if (s && (s.id || s.sub)) return String(s.id || s.sub);
    }
  } catch(e) {}
  return 'guest';
}

// ── Construit une clé scopée. Ex: _key('dj_cart') → 'dj_cart::user-1234'
function _key(base) {
  return base + '::' + _userScope();
}

// ── Wrapper localStorage scopé ──
var _ls = {
  get: function(baseKey, def) {
    try { return JSON.parse(localStorage.getItem(_key(baseKey)) || 'null') || def; }
    catch(e) { return def; }
  },
  set: function(baseKey, v) { localStorage.setItem(_key(baseKey), JSON.stringify(v)); },
  remove: function(baseKey) { localStorage.removeItem(_key(baseKey)); }
};

// ── Wrapper non scopé (pour les compteurs de produits) ──
var _gls = {
  get: function(k, def) {
    try { return JSON.parse(localStorage.getItem(k) || 'null') || def; }
    catch(e) { return def; }
  },
  set: function(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
};

// Expose les helpers pour les autres modules qui en ont besoin
window._userScope = _userScope;
window._scopedKey = _key;

// ── Migration unique : à la première lecture après upgrade, on déplace les
//    anciennes clés non-scopées vers le scope du user actuellement connecté.
//    Comme ça, l'utilisateur connecté avant le déploiement ne perd pas ses données.
(function _migrateLegacyKeys() {
  if (localStorage.getItem('dj_migrated_v6')) return;
  var userScoped = ['dj_likes', 'dj_cart', 'dj_history', 'dj_notifications',
                    'dj_orders', 'dj_my_products', 'dj_conversations',
                    'dj_search_history'];
  var scope = _userScope();
  // Si l'utilisateur n'est pas connecté à l'upgrade, on ne migre pas
  // (on ne sait pas à qui appartiennent les données)
  if (scope !== 'guest') {
    userScoped.forEach(function(k) {
      var old = localStorage.getItem(k);
      if (old != null && !localStorage.getItem(k + '::' + scope)) {
        localStorage.setItem(k + '::' + scope, old);
      }
      localStorage.removeItem(k);
    });
    // Migre aussi les dj_reviews_<productId> et dj_products_<category>
    for (var i = localStorage.length - 1; i >= 0; i--) {
      var key = localStorage.key(i);
      if (!key) continue;
      if (key.indexOf('dj_reviews_') === 0 && key.indexOf('::') === -1) {
        var val = localStorage.getItem(key);
        if (val != null) localStorage.setItem(key + '::' + scope, val);
        localStorage.removeItem(key);
      }
    }
  }
  localStorage.setItem('dj_migrated_v6', '1');
})();

// ── LIKES (cache local + sync Supabase wishlists) ──
window.getLikes = function() { return _ls.get('dj_likes', []); };
window.isLiked = function(id) { return window.getLikes().indexOf(id) !== -1; };
window.toggleLike = function(id) {
  var likes = window.getLikes();
  var i = likes.indexOf(id);
  var added = i === -1;
  if (added) likes.push(id); else likes.splice(i, 1);
  _ls.set('dj_likes', likes);

  // Sync Supabase en arrière-plan (fire & forget)
  var uid = window.currentUserId && window.currentUserId();
  if (uid && window._supabase) {
    if (added) {
      window._supabase.from('wishlists').insert([{ user_id: uid, product_id: id }])
        .then(function(){}).catch(function(){});
    } else {
      window._supabase.from('wishlists').delete().eq('user_id', uid).eq('product_id', id)
        .then(function(){}).catch(function(){});
    }
  }
  return added;
};

// Synchronise les favoris depuis Supabase (à appeler au login / au mount)
window.syncLikes = async function() {
  var uid = window.currentUserId && window.currentUserId();
  if (!uid || !window._supabase) return;
  try {
    var r = await window._supabase.from('wishlists').select('product_id').eq('user_id', uid);
    if (!r || !r.data) return;
    var remoteIds = r.data.map(function(x){ return x.product_id; });
    // Merge : union local + remote
    var local = window.getLikes();
    var merged = remoteIds.slice();
    local.forEach(function(id) {
      if (merged.indexOf(id) === -1) {
        merged.push(id);
        // Push les likes locaux non syncés vers Supabase
        window._supabase.from('wishlists').insert([{ user_id: uid, product_id: id }])
          .then(function(){}).catch(function(){});
      }
    });
    _ls.set('dj_likes', merged);
    window.updateWishlistBadge && window.updateWishlistBadge();
  } catch(e) {}
};

// Auto-sync au load si user connecté
setTimeout(function() {
  if (window.syncLikes) window.syncLikes();
}, 1000);

// ── CART ──
window.getCart = function() { return _ls.get('dj_cart', []); };
window.saveCart = function(cart) { _ls.set('dj_cart', cart); window.updateCartBadge && window.updateCartBadge(); };
window.cartTotal = function() {
  return window.getCart().reduce(function(s, i){ return s + ((i.price || 0) * (i.qty || 1)); }, 0);
};
window.cartCount = function() {
  return window.getCart().reduce(function(s, i){ return s + (i.qty || 1); }, 0);
};
window.addToCart = function(product) {
  var cart = window.getCart();
  var existing = cart.find(function(i){ return i.id === product.id; });
  if (existing) { existing.qty = (existing.qty || 1) + 1; }
  else { cart.push(Object.assign({}, product, { qty: 1 })); }
  window.saveCart(cart);
  window.toast && window.toast('Ajouté au panier <svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>', 'success');
};
window.removeFromCart = function(id) {
  var cart = window.getCart().filter(function(i){ return i.id !== id; });
  window.saveCart(cart);
};

// ── HISTORY ──
window.addToHistory = function(productId) {
  var h = _ls.get('dj_history', []);
  h = h.filter(function(x){ return x !== productId; });
  h.unshift(productId);
  _ls.set('dj_history', h.slice(0, 20));
};
window.getHistory = function() { return _ls.get('dj_history', []); };

// ── CATEGORY AFFINITY ──
// Score par categorie pour personnaliser le feed.
// Chaque clic ajoute du score, decay exponentiel sur 7 jours.
window.recordCategoryInterest = function(category, weight) {
  if (!category) return;
  var w = weight || 1;
  var aff = _ls.get('dj_cat_affinity', {});
  var now = Date.now();
  // decay all existing scores: -50% tous les 7 jours
  Object.keys(aff).forEach(function(c) {
    var entry = aff[c];
    if (entry && entry.t) {
      var daysAgo = (now - entry.t) / (24 * 3600 * 1000);
      entry.s = entry.s * Math.pow(0.5, daysAgo / 7);
      if (entry.s < 0.1) delete aff[c];
    }
  });
  if (!aff[category]) aff[category] = { s: 0, t: now };
  aff[category].s = (aff[category].s || 0) + w;
  aff[category].t = now;
  _ls.set('dj_cat_affinity', aff);
};
window.getCategoryAffinity = function() {
  var aff = _ls.get('dj_cat_affinity', {});
  var out = {};
  Object.keys(aff).forEach(function(c){ out[c] = (aff[c] && aff[c].s) || 0; });
  return out;
};

// ── VIEWS (compteur global du produit, pas user-specific) ──
window.incrementViews = function(id) {
  var key = 'dj_views_' + id;
  var v = parseInt(localStorage.getItem(key) || '0') + 1;
  localStorage.setItem(key, v);
  return v;
};
window.getViews = function(id) { return parseInt(localStorage.getItem('dj_views_' + id) || '0'); };

// ── REVIEWS (par produit ET par user qui les laisse — scopé) ──
window.getReviews = function(productId) { return _ls.get('dj_reviews_' + productId, []); };
window.addReview = function(productId, review) {
  var reviews = window.getReviews(productId);
  review.id = window.genId(); review.date = new Date().toISOString();
  reviews.unshift(review);
  _ls.set('dj_reviews_' + productId, reviews);
};
window.avgRating = function(productId) {
  var reviews = window.getReviews(productId);
  if (!reviews.length) return 0;
  return reviews.reduce(function(s, r){ return s + (r.rating || 0); }, 0) / reviews.length;
};

// ── NOTIFICATIONS ──
window.getNotifications = function() { return _ls.get('dj_notifications', []); };
window.addNotification = function(notif) {
  var notifs = window.getNotifications();
  notif.id = window.genId(); notif.date = new Date().toISOString(); notif.read = false;
  notifs.unshift(notif);
  _ls.set('dj_notifications', notifs.slice(0, 50));
  window.updateNotifBadge && window.updateNotifBadge();
};
window.markAllRead = function() {
  var notifs = window.getNotifications().map(function(n){ n.read = true; return n; });
  _ls.set('dj_notifications', notifs);
  window.updateNotifBadge && window.updateNotifBadge();
};
window.updateNotifBadge = async function() {
  var count = 0;
  // Source de vérité : Supabase (les notifs locales restent en fallback)
  if (window._supabase) {
    try {
      var u = await window._supabase.auth.getUser();
      var uid = u && u.data && u.data.user && u.data.user.id;
      if (uid) {
        var r = await window._supabase.from('notifications')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', uid)
          .is('read_at', null);
        count = (r && r.count) || 0;
      }
    } catch(e) { /* fallback ci-dessous */ }
  }
  if (count === 0) {
    // Fallback localStorage (pour anciens enregistrements)
    count = window.getNotifications().filter(function(n){ return !n.read; }).length;
  }
  document.querySelectorAll('.notif-badge, #sm-notif-badge').forEach(function(el) {
    el.textContent = count > 9 ? '9+' : count;
    el.classList.toggle('hidden', count === 0);
  });
};

// ── OFFERS (Supabase strict) ──
// Insère dans la table offers + crée une notif au vendeur (l'edge function send-push
// peut ensuite envoyer une push si le vendeur est abonné).
window.sendOffer = async function(productId, amount, buyerNote) {
  var uid = window.currentUserId && window.currentUserId();
  if (!uid || !window._supabase) {
    window.toast && window.toast('Connectez-vous pour faire une offre.', 'error');
    return null;
  }
  try {
    var ins = await window._supabase.from('offers').insert([{
      product_id: productId,
      buyer_id:   uid,
      amount:     amount,
      note:       buyerNote || null
    }]).select().single();
    if (ins && ins.error) {
      window.toast && window.toast('Erreur : ' + ins.error.message, 'error');
      return null;
    }

    // Récupère le seller pour créer la notification + push
    try {
      var p = await window._supabase.from('products').select('seller_id, title').eq('id', productId).single();
      if (p && p.data) {
        var amountTxt = window.formatPrice ? window.formatPrice(amount) : (amount + ' FCFA');
        await window._supabase.from('notifications').insert([{
          user_id: p.data.seller_id,
          type:    'offer',
          title:   'Nouvelle offre reçue',
          body:    'Offre de ' + amountTxt + ' sur ' + (p.data.title || 'votre annonce'),
          data:    { product_id: productId, offer_id: ins && ins.data && ins.data.id }
        }]);
        // Push notif (fire & forget)
        if (window.APP && window.APP.pushEndpoint) {
          fetch(window.APP.pushEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: p.data.seller_id,
              payload: {
                title: 'Nouvelle offre — ' + amountTxt,
                body:  'Sur « ' + (p.data.title || 'votre annonce') + ' »',
                url:   '/pages/offers.html',
                tag:   'offer-' + productId
              }
            })
          }).catch(function(){});
        }
      }
    } catch(e) {}

    return ins && ins.data;
  } catch(e) {
    console.warn('[offers] send failed', e);
    window.toast && window.toast('Envoi de l\'offre échoué.', 'error');
    return null;
  }
};

// ── ORDERS ──
window.getOrders = function() { return _ls.get('dj_orders', []); };
window.saveOrders = function(orders) { _ls.set('dj_orders', orders); };
window.saveOrder = function(order) {
  var orders = window.getOrders();
  order.id = window.genId(); order.date = new Date().toISOString(); order.status = 'pending';
  orders.unshift(order);
  _ls.set('dj_orders', orders);
  window.addNotification({
    type: 'order', title: 'Commande confirmée !',
    body: 'Votre commande #' + order.id.slice(-6).toUpperCase() + ' a été passée avec succès.'
  });
  return order;
};

// ── MY PRODUCTS (les annonces que J'ai publiées) ──
window.getMyProducts = function() { return _ls.get('dj_my_products', []); };
window.saveMyProducts = function(prods) { _ls.set('dj_my_products', prods); };
window.addMyProduct = function(product) {
  var prods = window.getMyProducts();
  prods.unshift(product);
  window.saveMyProducts(prods);
};
window.updateMyProduct = function(id, patch) {
  var prods = window.getMyProducts().map(function(p) { return p.id === id ? Object.assign(p, patch) : p; });
  window.saveMyProducts(prods);
  window._patchAllLocal && window._patchAllLocal(id, patch);
};
window.removeMyProduct = function(id) {
  window.saveMyProducts(window.getMyProducts().filter(function(p){ return p.id !== id; }));
  // Purge aussi les anciennes copies legacy par catégorie (dj_products_*)
  for (var i = localStorage.length - 1; i >= 0; i--) {
    var key = localStorage.key(i);
    if (!key || key.indexOf('dj_products_') !== 0) continue;
    try {
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      var filtered = arr.filter(function(p){ return p.id !== id; });
      if (filtered.length !== arr.length) {
        if (filtered.length) localStorage.setItem(key, JSON.stringify(filtered));
        else                 localStorage.removeItem(key);
      }
    } catch(e) {}
  }
};

// Met à jour aussi les copies legacy (sold, etc.)
window._patchAllLocal = function(id, patch) {
  for (var i = localStorage.length - 1; i >= 0; i--) {
    var key = localStorage.key(i);
    if (!key || key.indexOf('dj_products_') !== 0) continue;
    try {
      var arr = JSON.parse(localStorage.getItem(key) || '[]');
      var changed = false;
      arr = arr.map(function(p) {
        if (p.id === id) { changed = true; return Object.assign({}, p, patch); }
        return p;
      });
      if (changed) localStorage.setItem(key, JSON.stringify(arr));
    } catch(e) {}
  }
};

// ── CONVERSATIONS (scopées par user) ──
window.getConversations = function() { return _ls.get('dj_conversations', []); };
window.saveConversations = function(convs) { _ls.set('dj_conversations', convs); };

// ── PRODUCTS (demo fallback) — scope toutes les sources ──
window.getAllProducts = function() {
  var all = [];
  // Mes annonces (scope actuel)
  all = all.concat(window.getMyProducts());
  // Annonces par catégorie (publiques)
  for (var i = 0; i < localStorage.length; i++) {
    var key = localStorage.key(i);
    if (key && key.indexOf('dj_products_') === 0 && key.indexOf('::') === -1) {
      var prods = _gls.get(key, []);
      all = all.concat(prods);
    }
  }
  return all;
};
window.getProductById = function(id) {
  return window.getAllProducts().find(function(p){ return p.id === id; }) || null;
};

// ── BOOST (par produit, pas scopé) ──
window.isBoosted = function(productId) {
  var exp = localStorage.getItem('dj_boost_' + productId);
  return exp && Date.now() < parseInt(exp);
};
window.boostProduct = function(productId) {
  var exp = Date.now() + 24*60*60*1000;
  localStorage.setItem('dj_boost_' + productId, exp);
  window.toast && window.toast('<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg> Annonce boost 7 jours !', 'success');
};

// ── SEARCH HISTORY (scopé par user) ──
window.getRecentSearches = function() { return _ls.get('dj_search_history', []); };
window.addRecentSearch = function(q) {
  if (!q.trim()) return;
  var h = window.getRecentSearches().filter(function(s){ return s.toLowerCase() !== q.toLowerCase(); });
  h.unshift(q.trim());
  _ls.set('dj_search_history', h.slice(0, 10));
};

// ── VERIFIED ──
window.isVerified = function(profile) {
  return !!(profile && profile.phone && profile.phone.length >= 8);
};
