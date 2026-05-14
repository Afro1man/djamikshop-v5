// ═══════════════════════════════════════════════════════════════════
//  FEATURES / CART — Panier & checkout
// ═══════════════════════════════════════════════════════════════════

function renderCart() {
  var cart = window.getCart ? window.getCart() : [];
  var emptyEl = document.getElementById('cart-empty');
  var summaryEl = document.getElementById('cart-summary');
  var listEl = document.getElementById('cart-list');

  if (!cart.length) {
    if (emptyEl) emptyEl.classList.remove('hidden');
    if (summaryEl) summaryEl.classList.add('hidden');
    return;
  }

  if (emptyEl) emptyEl.classList.add('hidden');
  if (summaryEl) summaryEl.classList.remove('hidden');

  var total = 0, count = 0;
  if (listEl) {
    listEl.innerHTML = cart.map(function(item) {
      total += (item.price || 0) * (item.qty || 1);
      count += (item.qty || 1);
      var cat = window.getCatById ? window.getCatById(item.category) : null;
      return '<div class="cart-item">' +
        (item.image_url ? '<img src="' + item.image_url + '" alt="">' : '<div style="width:80px;height:80px;border-radius:var(--r-md);background:var(--surface-2);display:flex;align-items:center;justify-content:center;font-size:2rem;flex-shrink:0">' + (cat ? cat.icon : '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>') + '</div>') +
        '<div class="cart-item-body">' +
          '<div class="cart-item-name">' + window.escHtml(item.title || '') + '</div>' +
          '<div class="cart-item-price">' + window.formatPrice(item.price) + '</div>' +
          '<div class="cart-item-meta"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ' + (item.city || '—') + ' · Vendeur: ' + (item.seller_name || '—') + '</div>' +
          '<div class="cart-item-actions">' +
            '<div class="qty-control">' +
              '<button class="qty-btn" onclick="changeQty(\'' + item.id + '\',-1)"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="5" y1="12" x2="19" y2="12"/></svg></button>' +
              '<span class="qty-val">' + (item.qty || 1) + '</span>' +
              '<button class="qty-btn" onclick="changeQty(\'' + item.id + '\',1)">+</button>' +
            '</div>' +
            '<button class="remove-btn" onclick="removeCartItem(\'' + item.id + '\')"><svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg> Supprimer</button>' +
          '</div>' +
        '</div></div>';
    }).join('');
  }

  var itemsEl = document.getElementById('summary-items');
  var subEl = document.getElementById('summary-subtotal');
  var totEl = document.getElementById('summary-total');
  if (itemsEl) itemsEl.textContent = count + ' article' + (count > 1 ? 's' : '');
  if (subEl) subEl.textContent = window.formatPrice(total);
  if (totEl) totEl.textContent = window.formatPrice(total);
}

window.changeQty = function(id, delta) {
  var cart = window.getCart ? window.getCart() : [];
  var item = cart.find(function(i){ return i.id === id; });
  if (!item) return;
  item.qty = Math.max(1, (item.qty || 1) + delta);
  window.saveCart && window.saveCart(cart);
  renderCart();
};

window.removeCartItem = function(id) {
  var cart = (window.getCart ? window.getCart() : []).filter(function(i){ return i.id !== id; });
  window.saveCart && window.saveCart(cart);
  renderCart();
  window.updateCartBadge && window.updateCartBadge();
};

// ─── CHECKOUT ───
function _initCart() {
  renderCart();

  var btnCheckout = document.getElementById('btn-checkout');
  if (btnCheckout) {
    btnCheckout.addEventListener('click', function() {
      var cart = window.getCart ? window.getCart() : [];
      if (!cart.length) { window.toast && window.toast('Votre panier est vide.', 'error'); return; }
      window.location.href = 'checkout.html';
    });
  }
}

window.onDjamikReady(_initCart);
