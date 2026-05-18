// ═══════════════════════════════════════════════════════════════════
//  FEATURES / WISHLIST — Mes favoris (Supabase + localStorage)
// ═══════════════════════════════════════════════════════════════════

window.onDjamikReady(async function() {
  var grid = document.getElementById('wishlist-grid');
  if (!grid) return;

  var likes = window.getLikes ? window.getLikes() : [];

  if (!likes.length) {
    grid.innerHTML = _emptyState('Aucun favori', 'Ajoutez des annonces à vos favoris depuis les fiches produits.');
    return;
  }

  // Skeleton pendant fetch
  if (window.renderSkeletons) window.renderSkeletons(grid, Math.min(likes.length, 6));

  // 1. Récupère depuis Supabase (par batch d'IDs)
  var supabaseProducts = [];
  if (window._supabase) {
    try {
      var res = await window._supabase
        .from('products')
        .select('*')
        .in('id', likes);
      if (res && res.data) supabaseProducts = res.data;
    } catch(e) { /* offline ou erreur — on continue avec localStorage */ }
  }

  // 2. Complète avec localStorage (annonces démo)
  var localProducts = window.getAllProducts ? window.getAllProducts() : [];
  var localLiked = localProducts.filter(function(p) { return likes.indexOf(p.id) !== -1; });

  // 3. Fusionne sans doublons
  var allProducts = supabaseProducts.slice();
  localLiked.forEach(function(p) {
    if (!allProducts.find(function(x){ return x.id === p.id; })) allProducts.push(p);
  });

  if (!allProducts.length) {
    grid.innerHTML = _emptyState('Annonces introuvables', 'Vos favoris ont peut-être été supprimés ou ne sont plus disponibles.');
    return;
  }

  // Render avec le même format de carte que products.js
  grid.innerHTML = allProducts.map(function(p) {
    var cat = window.getCatById ? window.getCatById(p.category) : null;
    var img = (p.images && p.images[0]) || p.image || p.image_url;
    var disc = parseInt(p.discount) || 0;
    var oldPx = disc > 0 ? Math.round(p.price / (1 - disc/100)) : 0;
    return '<div class="card product-card">' +
      (disc > 0 ? '<div class="card-badge badge-discount">-' + disc + '%</div>' : '') +
      '<button class="card-like-btn liked" onclick="window.toggleLikeCard(\'' + p.id + '\',this);event.stopPropagation()">' +
        '<svg class="dj-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' +
      '</button>' +
      '<div class="card-img-wrap" onclick="window.location.href=\'product-details.html?id=' + p.id + '\'">' +
        (img
          ? '<img src="' + img + '" alt="' + window.escHtml(p.title || '') + '" loading="lazy">'
          : '<div class="card-img-placeholder">' + (cat ? cat.icon : (window.ICONS && window.ICONS.package || '')) + '</div>'
        ) +
      '</div>' +
      '<div class="card-body" onclick="window.location.href=\'product-details.html?id=' + p.id + '\'">' +
        '<div class="card-title">' + window.escHtml(p.title || '') + '</div>' +
        '<div class="card-price">' + window.formatPrice(p.price) +
          (oldPx > 0 ? '<span class="old">' + window.formatPrice(oldPx) + '</span>' : '') +
        '</div>' +
        '<div class="card-meta">' + (window.ICONS && window.ICONS.map_pin || '') + ' ' + (p.city || '—') + '</div>' +
      '</div>' +
    '</div>';
  }).join('');

  function _emptyState(title, msg) {
    return '<div class="empty-state" style="grid-column:1/-1">' +
      '<div class="empty-icon">' + (window.ICONS && window.ICONS.heart || '') + '</div>' +
      '<h3>' + title + '</h3>' +
      '<p>' + msg + '</p>' +
      '<a href="index.html" class="btn btn-primary mt-4">Découvrir des annonces</a>' +
    '</div>';
  }
});
