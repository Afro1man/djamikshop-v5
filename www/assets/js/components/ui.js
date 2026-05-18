// ═══════════════════════════════════════════════════════════════════
//  COMPONENTS / UI — Toast, Modal, Skeletons
// ═══════════════════════════════════════════════════════════════════

// ── TOAST ──
window.toast = function(msg, type, dur) {
  type = type || 'default'; dur = dur || 3500;
  var tc = document.getElementById('toast-container');
  if (!tc) {
    tc = document.createElement('div');
    tc.id = 'toast-container';
    document.body.appendChild(tc);
  }
  var icons = { success: window.ICONS.check, error: window.ICONS.close, info: window.ICONS.info, default: window.ICONS.dot };
  var el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<span>' + (icons[type] || window.ICONS.dot) + '</span><span>' + msg + '</span>';
  tc.appendChild(el);
  setTimeout(function(){ if (el.parentElement) el.remove(); }, dur);
};

// ── SKELETONS ──
window.renderSkeletons = function(container, n) {
  var html = '';
  for (var i = 0; i < (n || 8); i++) {
    html += '<div class="skeleton-card">' +
      '<div class="skeleton skeleton-img"></div>' +
      '<div class="skeleton-body">' +
        '<div class="skeleton skeleton-line"></div>' +
        '<div class="skeleton skeleton-line short"></div>' +
        '<div class="skeleton skeleton-line xshort"></div>' +
      '</div></div>';
  }
  container.innerHTML = html;
};

// ── MODAL ──
window.showModal = function(html, opts) {
  opts = opts || {};
  var ov = document.createElement('div');
  ov.style.cssText = 'position:fixed;inset:0;z-index:' + (window.APP?.z?.modal || 3000) + ';background:rgba(15,23,42,.5);backdrop-filter:blur(8px);display:flex;align-items:center;justify-content:center;padding:24px;';
  var box = document.createElement('div');
  box.style.cssText = 'background:var(--white);border-radius:var(--r-xl);padding:32px;max-width:' + (opts.maxWidth || '480px') + ';width:100%;box-shadow:var(--shadow-xl);max-height:90vh;overflow-y:auto;border:1px solid var(--surface-3);';
  box.innerHTML = html;
  ov.appendChild(box);
  document.body.appendChild(ov);
  ov.addEventListener('click', function(e){ if (e.target === ov) ov.remove(); });
  return { close: function(){ ov.remove(); }, el: box };
};

// ── CONFIRM ──
window.confirm2 = function(msg, danger) {
  return new Promise(function(resolve){
    var m = window.showModal(
      '<h3 style="margin-bottom:12px;font-family:Outfit,sans-serif">Confirmation</h3>' +
      '<p style="color:var(--ink-3);margin-bottom:24px">' + msg + '</p>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end">' +
      '<button class="btn btn-outline" id="conf-no">Annuler</button>' +
      '<button class="btn ' + (danger ? 'btn-danger' : 'btn-primary') + '" id="conf-yes">Confirmer</button></div>'
    );
    m.el.querySelector('#conf-no').onclick = function(){ m.close(); resolve(false); };
    m.el.querySelector('#conf-yes').onclick = function(){ m.close(); resolve(true); };
  });
};

// ── BADGE UPDATES ──
window.updateCartBadge = function() {
  var total = window.cartCount();
  var cb = document.getElementById('cart-badge');
  if (cb) { cb.textContent = total; cb.classList.toggle('hidden', total === 0); }
};

window.updateWishlistBadge = function() {
  var likes = window.getLikes();
  var wb = document.getElementById('wishlist-badge');
  if (wb) { wb.textContent = likes.length; wb.classList.toggle('hidden', likes.length === 0); }
};
