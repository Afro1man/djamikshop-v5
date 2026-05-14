// ═══════════════════════════════════════════════════════════════════
//  FEATURES / DETAILS — Fiche produit (stub)
// ═══════════════════════════════════════════════════════════════════

window.onDjamikReady(function() {
  var layout = document.getElementById('details-layout');
  var bc = document.getElementById('bc-title');
  if (!layout) return;
  var params = new URLSearchParams(location.search);
  var id = params.get('id');
  if (!id) { layout.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M16 16s-1.5-2-4-2-4 2-4 2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg></div><h3>Aucun produit sélectionné</h3></div>'; return; }
  
  var p = window.getProductById ? window.getProductById(id) : null;
  if (!p) { layout.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg></div><h3>Produit introuvable</h3></div>'; return; }
  
  window.addToHistory && window.addToHistory(id);
  if (bc) bc.textContent = window.escHtml(p.title || 'Produit');
  
  var cat = window.getCatById ? window.getCatById(p.category) : null;
  var disc = parseInt(p.discount) || 0;
  var oldPx = disc > 0 ? Math.round(p.price / (1 - disc/100)) : 0;
  var liked = window.isLiked ? window.isLiked(id) : false;
  
  layout.innerHTML = '<div>' +
    '<div class="gallery-main">' + (p.image_url ? '<img src="' + p.image_url + '" alt="">' : '<div style="display:flex;align-items:center;justify-content:center;height:100%;font-size:4rem">' + (cat ? cat.icon : '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>') + '</div>') + '</div>' +
    '<div class="gallery-thumbs"><div class="gallery-thumb active">' + (p.image_url ? '<img src="' + p.image_url + '">' : '') + '</div></div>' +
    '</div><div>' +
    '<div class="panel">' +
      '<div style="display:flex;align-items:center;gap:var(--space-2);margin-bottom:var(--space-2);flex-wrap:wrap">' +
        (disc > 0 ? '<span class="badge badge-danger">-' + disc + '%</span>' : '') +
        (p.condition ? window.conditionBadge(p.condition) : '') +
        (window.isBoosted && window.isBoosted(id) ? '<span class="badge badge-warning"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="M12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg> Boosté</span>' : '') +
      '</div>' +
      '<h1 style="font-size:1.5rem;margin-bottom:var(--space-2)">' + window.escHtml(p.title || '') + '</h1>' +
      '<div class="price-box">' + window.formatPrice(p.price) + (oldPx > 0 ? '<span style="font-size:1rem;color:var(--ink-4);text-decoration:line-through;margin-left:var(--space-2);font-weight:500">' + window.formatPrice(oldPx) + '</span>' : '') + '</div>' +
      '<div style="color:var(--ink-3);font-size:.9rem;margin-bottom:var(--space-4);line-height:1.6">' + window.escHtml(p.description || 'Aucune description.') + '</div>' +
      '<div style="display:flex;gap:var(--space-2);margin-bottom:var(--space-4)">' +
        '<div style="flex:1;background:var(--surface-2);padding:var(--space-3);border-radius:var(--r-md);text-align:center"><div style="font-size:.75rem;color:var(--ink-4);margin-bottom:2px"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> Ville</div><div style="font-weight:600">' + (p.city || '—') + '</div></div>' +
        '<div style="flex:1;background:var(--surface-2);padding:var(--space-3);border-radius:var(--r-md);text-align:center"><div style="font-size:.75rem;color:var(--ink-4);margin-bottom:2px"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> Vues</div><div style="font-weight:600">' + (window.getViews ? window.getViews(id) : 0) + '</div></div>' +
        '<div style="flex:1;background:var(--surface-2);padding:var(--space-3);border-radius:var(--r-md);text-align:center"><div style="font-size:.75rem;color:var(--ink-4);margin-bottom:2px"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> Publié</div><div style="font-weight:600">' + window.relativeDate(p.created_at) + '</div></div>' +
      '</div>' +
      '<div style="display:flex;gap:var(--space-2)">' +
        '<button class="btn btn-primary btn-lg btn-full" onclick="window.addToCart&&window.addToCart(' + JSON.stringify(p).replace(/"/g,'&quot;') + ')"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 1.95-1.57l1.65-8.42H6"/></svg> Ajouter au panier</button>' +
        '<button class="btn btn-outline btn-icon btn-lg" onclick="var btn=this;window.toggleLike(\''+id+'\');btn.innerHTML=(window.isLiked(\''+id+'\')?\'<svg class="dj-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>\':\'<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>\');btn.classList.toggle(\'liked\',window.isLiked(\''+id+'\'))">' + (liked ? '<svg class="dj-icon" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>' : '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>') + '</button>' +
      '</div>' +
    '</div>' +
    '</div>';
});
