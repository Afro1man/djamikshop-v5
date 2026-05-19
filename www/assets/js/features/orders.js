// ═══════════════════════════════════════════════════════════════════
//  FEATURES / ORDERS — Mes commandes (détaillées)
// ═══════════════════════════════════════════════════════════════════

window.onDjamikReady(async function() {
  var list = document.getElementById('orders-list');
  if (!list) return;

  // Skeleton
  list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--ink-3)">Chargement…</div>';

  // 1. Fetch Supabase (source de vérité)
  var orders = [];
  if (window._supabase && window.currentUserId && window.currentUserId()) {
    try {
      var r = await window._supabase.from('orders')
        .select('*')
        .eq('buyer_id', window.currentUserId())
        .order('created_at', { ascending: false });
      if (r && r.data) {
        orders = r.data.map(function(o) {
          // Normalise au format attendu par le rendu (payment imbriqué)
          return {
            id:       o.id,
            items:    o.items || [],
            total:    o.total,
            address:  o.address,
            note:     o.note,
            status:   o.status,
            date:     o.created_at,
            payment: {
              method:    o.payment_method,
              phone:     o.payment_phone,
              reference: o.payment_reference,
              status:    o.payment_status
            }
          };
        });
      }
    } catch(e) { console.warn('[orders] Supabase fetch failed', e); }
  }

  // 2. Fusion avec local (orders sauvegardées en cache + offline)
  var local = window.getOrders ? window.getOrders() : [];
  local.forEach(function(o) {
    if (!orders.find(function(x){ return x.id === o.id; })) orders.push(o);
  });
  orders.sort(function(a, b){ return new Date(b.date || 0) - new Date(a.date || 0); });

  if (!orders.length) {
    list.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">' + _icon('package') + '</div>' +
        '<h3>Aucune commande</h3>' +
        '<p>Vous n\'avez pas encore passé de commande.</p>' +
        '<a href="index.html" class="btn btn-primary mt-4">' + _icon('search') + ' Découvrir</a>' +
      '</div>';
    _injectStyles();
    return;
  }

  _injectStyles();

  list.innerHTML = orders.map(function(order) {
    var paymentMethod = _paymentLabel(order.payment && order.payment.method);
    var status        = (order.payment && order.payment.status) || order.status || 'pending';
    var statusInfo    = _statusBadge(status);
    var shortId       = (order.id || '').slice(-6).toUpperCase();
    var itemCount     = (order.items || []).reduce(function(s, i){ return s + (i.qty || 1); }, 0);

    return '<article class="order-card">' +
      // Header
      '<div class="order-header">' +
        '<div>' +
          '<div class="order-id">Commande #' + shortId + '</div>' +
          '<div class="order-date">' + window.relativeDate(order.date) + '</div>' +
        '</div>' +
        '<div class="order-status ' + statusInfo.cls + '">' + statusInfo.label + '</div>' +
      '</div>' +

      // Items
      '<div class="order-items">' +
        (order.items || []).slice(0, 4).map(function(item) {
          var img = item.image || item.image_url;
          return '<div class="order-item">' +
            (img
              ? '<img src="' + img + '" alt="" class="order-item-img">'
              : '<div class="order-item-img order-item-ph">' + _icon('package') + '</div>'
            ) +
            '<div class="order-item-body">' +
              '<div class="order-item-name">' + window.escHtml(item.title || 'Article') + '</div>' +
              '<div class="order-item-meta">' + (item.qty || 1) + ' × ' + window.formatPrice(item.price) + '</div>' +
            '</div>' +
          '</div>';
        }).join('') +
        ((order.items || []).length > 4
          ? '<div class="order-more">+' + ((order.items || []).length - 4) + ' autre(s)</div>'
          : '') +
      '</div>' +

      // Footer (total + paiement + actions)
      '<div class="order-footer">' +
        '<div class="order-summary">' +
          '<div class="order-line"><span>Articles</span><span>' + itemCount + '</span></div>' +
          '<div class="order-line"><span>Paiement</span><span>' + paymentMethod + '</span></div>' +
          (order.payment && order.payment.reference
            ? '<div class="order-line"><span>Référence</span><span class="order-ref">' + window.escHtml(order.payment.reference) + '</span></div>'
            : '') +
          (order.address
            ? '<div class="order-line"><span>Livraison</span><span class="order-addr">' + window.escHtml(order.address.slice(0, 60)) + (order.address.length > 60 ? '…' : '') + '</span></div>'
            : '') +
          '<div class="order-total"><span>Total</span><span>' + window.formatPrice(order.total) + '</span></div>' +
        '</div>' +
        '<div class="order-actions">' +
          '<button class="btn btn-outline btn-sm" data-act="copy-ref" data-ref="' + window.escHtml((order.payment && order.payment.reference) || order.id) + '">' +
            _icon('copy') + ' Copier la réf' +
          '</button>' +
          (status === 'pending' || status === 'paid'
            ? '<button class="btn btn-outline btn-sm danger" data-act="cancel" data-id="' + order.id + '">' + _icon('close') + ' Annuler</button>'
            : '') +
        '</div>' +
      '</div>' +
    '</article>';
  }).join('');

  // Wire actions
  list.querySelectorAll('[data-act]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      var act = btn.dataset.act;
      if (act === 'copy-ref') {
        var ref = btn.dataset.ref;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(ref).then(function() {
            window.toast && window.toast('Référence copiée', 'success');
          });
        }
      }
      else if (act === 'cancel') {
        var id = btn.dataset.id;
        window.confirm2('Annuler cette commande ?', true).then(function(ok) {
          if (!ok) return;
          var all = window.getOrders ? window.getOrders() : [];
          all = all.map(function(o) {
            if (o.id === id) o.status = 'cancelled';
            return o;
          });
          window.saveOrders ? window.saveOrders(all) : localStorage.setItem('dj_orders', JSON.stringify(all));
          window.toast && window.toast('Commande annulée', 'info');

          // Update dynamique : retrouve la card et change visuellement le statut
          var card = btn.closest('.order-card');
          if (card) {
            var statusBadge = card.querySelector('.order-status, .status-badge');
            if (statusBadge) {
              statusBadge.textContent = 'Annulée';
              statusBadge.className = 'order-status cancelled';
            }
            card.style.opacity = '0.6';
            // Cache le bouton cancel
            btn.style.display = 'none';
          }
        });
      }
    });
  });

  // ── Helpers ──
  function _icon(name) {
    return (window.ICONS && window.ICONS[name]) || '';
  }

  function _statusBadge(status) {
    var map = {
      pending:   { label: 'En attente',  cls: 'st-pending' },
      paid:      { label: 'Payée',       cls: 'st-paid' },
      shipped:   { label: 'Expédiée',    cls: 'st-shipped' },
      delivered: { label: 'Livrée',      cls: 'st-delivered' },
      cancelled: { label: 'Annulée',     cls: 'st-cancelled' }
    };
    return map[status] || map.pending;
  }

  function _paymentLabel(methodId) {
    if (!methodId) return '—';
    var m = (window.APP && window.APP.paymentMethods || []).find(function(x){ return x.id === methodId; });
    return m ? m.label : methodId;
  }

  function _injectStyles() {
    if (document.getElementById('orders-styles')) return;
    var s = document.createElement('style');
    s.id = 'orders-styles';
    s.textContent = [
      '.order-card{background:var(--white);border:1px solid var(--surface-3);border-radius:var(--r-xl);padding:16px;margin-bottom:14px;box-shadow:var(--shadow-sm)}',
      '.order-header{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:14px;padding-bottom:14px;border-bottom:1px solid var(--surface-2)}',
      '.order-id{font-family:Outfit,sans-serif;font-weight:800;font-size:1rem;color:var(--ink)}',
      '.order-date{font-size:.78rem;color:var(--ink-3);margin-top:2px}',
      '.order-status{font-size:.7rem;font-weight:700;padding:5px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap}',
      '.st-pending{background:#fef3c7;color:#92400e}',
      '.st-paid{background:#dcfce7;color:#166534}',
      '.st-shipped{background:#dbeafe;color:#1e40af}',
      '.st-delivered{background:#e0e7ff;color:#3730a3}',
      '.st-cancelled{background:#fee2e2;color:#991b1b}',

      '.order-items{display:flex;flex-direction:column;gap:8px;margin-bottom:14px}',
      '.order-item{display:flex;gap:10px;align-items:center}',
      '.order-item-img{width:44px;height:44px;border-radius:var(--r-md);object-fit:cover;background:var(--surface-2);flex-shrink:0}',
      '.order-item-ph{display:flex;align-items:center;justify-content:center;color:var(--ink-3)}',
      '.order-item-ph svg{width:20px;height:20px}',
      '.order-item-body{flex:1;min-width:0}',
      '.order-item-name{font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.order-item-meta{font-size:.72rem;color:var(--ink-3);margin-top:1px}',
      '.order-more{font-size:.78rem;color:var(--ink-3);font-style:italic;padding-left:54px}',

      '.order-footer{border-top:1px solid var(--surface-2);padding-top:14px}',
      '.order-summary{display:flex;flex-direction:column;gap:5px;margin-bottom:12px}',
      '.order-line{display:flex;justify-content:space-between;font-size:.82rem;color:var(--ink-2)}',
      '.order-line span:first-child{color:var(--ink-3)}',
      '.order-ref{font-family:monospace;font-size:.78rem}',
      '.order-addr{font-size:.78rem;text-align:right;max-width:65%}',
      '.order-total{display:flex;justify-content:space-between;font-weight:800;font-size:1rem;color:var(--ink);padding-top:6px;margin-top:4px;border-top:1px dashed var(--surface-3)}',
      '.order-total span:last-child{color:var(--primary,#E8501A)}',

      '.order-actions{display:flex;gap:8px;flex-wrap:wrap}',
      '.order-actions .btn{flex:1;min-width:110px}',
      '.order-actions .danger{color:var(--danger,#ef4444);border-color:var(--danger,#ef4444)}'
    ].join('');
    document.head.appendChild(s);
  }
});
