// ═══════════════════════════════════════════════════════════════════
//  FEATURES / OFFERS — Offres reçues sur mes annonces + offres envoyées
// ═══════════════════════════════════════════════════════════════════

window.onDjamikReady(async function() {
  var root = document.getElementById('offers-root');
  if (!root) return;

  var sb = window._supabase;
  if (!sb) {
    root.innerHTML = '<div class="empty-state"><h3>Service indisponible</h3></div>';
    return;
  }

  // Auth
  var session;
  try {
    var s = await sb.auth.getSession();
    session = s && s.data && s.data.session ? s.data.session.user : null;
  } catch(e) {}

  if (!session) {
    root.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">' + (window.ICONS && window.ICONS.user || '') + '</div>' +
        '<h3>Connectez-vous</h3>' +
        '<p>Pour voir vos offres reçues et envoyées.</p>' +
        '<a href="login.html?next=offers.html" class="btn btn-primary mt-4">Se connecter</a>' +
      '</div>';
    _injectStyles();
    return;
  }
  var meId = session.id;

  // Skeleton
  root.innerHTML = '<div class="empty-state"><p>Chargement…</p></div>';

  // Fetch en parallèle :
  //  1. Offres REÇUES = offres sur mes produits
  //  2. Offres ENVOYÉES = mes offres
  var receivedPromise = sb.from('offers')
    .select('*, products!inner(id, title, image_url, price, seller_id)')
    .eq('products.seller_id', meId)
    .order('created_at', { ascending: false });

  var sentPromise = sb.from('offers')
    .select('*, products(id, title, image_url, price, seller_id)')
    .eq('buyer_id', meId)
    .order('created_at', { ascending: false });

  var [recvRes, sentRes] = await Promise.all([receivedPromise, sentPromise]);
  var received = (recvRes && recvRes.data) || [];
  var sent     = (sentRes && sentRes.data) || [];

  // Pour les offres reçues, fetch les profils des acheteurs
  var buyerIds = received.map(function(o){ return o.buyer_id; }).filter(function(v, i, a){ return v && a.indexOf(v) === i; });
  var buyersById = {};
  if (buyerIds.length) {
    try {
      var b = await sb.from('profiles').select('id, full_name, avatar_url').in('id', buyerIds);
      ((b && b.data) || []).forEach(function(p){ buyersById[p.id] = p; });
    } catch(e) {}
  }

  _injectStyles();

  root.innerHTML =
    '<div class="profile-tabs" id="offers-tabs">' +
      '<button class="profile-tab active" data-tab="received">Reçues (' + received.length + ')</button>' +
      '<button class="profile-tab" data-tab="sent">Envoyées (' + sent.length + ')</button>' +
    '</div>' +
    '<div id="offers-list"></div>';

  function _renderTab(which) {
    var container = document.getElementById('offers-list');
    var list = which === 'sent' ? sent : received;
    var isReceived = which === 'received';

    if (!list.length) {
      container.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">' + (window.ICONS && window.ICONS.chat || '') + '</div>' +
          '<h3>' + (isReceived ? 'Aucune offre reçue' : 'Aucune offre envoyée') + '</h3>' +
          '<p>' + (isReceived
              ? 'Quand un acheteur fera une offre sur une de vos annonces, elle apparaîtra ici.'
              : 'Faites une offre depuis une fiche produit pour proposer votre prix.') + '</p>' +
        '</div>';
      return;
    }

    container.innerHTML = list.map(function(o) {
      var p = o.products || {};
      var img = p.image_url;
      var status = o.status || 'pending';
      var statusInfo = _statusBadge(status);
      var buyer = isReceived ? (buyersById[o.buyer_id] || {}) : null;
      var buyerName = buyer ? (buyer.full_name || 'Acheteur') : null;
      var buyerAvatar = buyer && buyer.avatar_url ||
        (buyer ? 'https://ui-avatars.com/api/?name=' + encodeURIComponent(buyerName) + '&background=E8501A&color=fff' : null);

      return '<article class="offer-card">' +
        '<div class="offer-product" onclick="window.location.href=\'product-details.html?id=' + p.id + '\'">' +
          (img ? '<img src="' + img + '" alt="">' : '<div class="offer-product-ph">' + (window.ICONS && window.ICONS.package || '') + '</div>') +
          '<div class="offer-product-info">' +
            '<div class="offer-product-title">' + window.escHtml(p.title || 'Produit supprimé') + '</div>' +
            '<div class="offer-product-price">Prix demandé : ' + window.formatPrice(p.price) + '</div>' +
          '</div>' +
        '</div>' +

        // Acheteur (uniquement pour reçues)
        (isReceived && buyer
          ? '<div class="offer-buyer" onclick="window.location.href=\'my-profile.html?id=' + o.buyer_id + '\'">' +
              '<img src="' + buyerAvatar + '" alt="">' +
              '<div><div class="offer-buyer-name">' + window.escHtml(buyerName) + '</div>' +
              '<div class="offer-buyer-sub">Voir le profil →</div></div>' +
            '</div>'
          : '') +

        // Montant + status
        '<div class="offer-amount-row">' +
          '<div>' +
            '<div class="offer-label">' + (isReceived ? 'Offre reçue' : 'Votre offre') + '</div>' +
            '<div class="offer-amount">' + window.formatPrice(o.amount) + '</div>' +
            (o.note ? '<div class="offer-note">« ' + window.escHtml(o.note) + ' »</div>' : '') +
          '</div>' +
          '<div class="offer-status ' + statusInfo.cls + '">' + statusInfo.label + '</div>' +
        '</div>' +

        '<div class="offer-meta">' + window.relativeDate(o.created_at) + '</div>' +

        // Actions (uniquement reçues + pending)
        (isReceived && status === 'pending'
          ? '<div class="offer-actions">' +
              '<button class="btn btn-outline btn-sm" data-act="reject" data-id="' + o.id + '">Refuser</button>' +
              '<button class="btn btn-primary btn-sm" data-act="accept" data-id="' + o.id + '">Accepter</button>' +
              '<button class="btn btn-outline btn-sm" data-act="contact" data-buyer="' + o.buyer_id + '" data-product="' + o.product_id + '">Contacter</button>' +
            '</div>'
          : '') +
      '</article>';
    }).join('');

    // Wire actions
    container.querySelectorAll('[data-act]').forEach(function(btn) {
      btn.addEventListener('click', async function() {
        var act = btn.dataset.act;
        var id = btn.dataset.id;

        if (act === 'accept' || act === 'reject') {
          var newStatus = act === 'accept' ? 'accepted' : 'rejected';
          window.confirm2((act === 'accept' ? 'Accepter' : 'Refuser') + ' cette offre ?', act === 'reject').then(async function(ok) {
            if (!ok) return;
            try {
              var r = await sb.from('offers').update({ status: newStatus }).eq('id', id);
              if (r && r.error) throw r.error;

              // Met à jour localement
              var idx = received.findIndex(function(x){ return x.id === id; });
              if (idx !== -1) received[idx].status = newStatus;

              // Notifie l'acheteur
              var off = received[idx];
              if (off) {
                try {
                  await sb.from('notifications').insert([{
                    user_id: off.buyer_id,
                    type:    'offer',
                    title:   newStatus === 'accepted' ? 'Offre acceptée !' : 'Offre refusée',
                    body:    'Le vendeur a ' + (newStatus === 'accepted' ? 'accepté' : 'refusé') + ' votre offre de ' + window.formatPrice(off.amount),
                    data:    { product_id: off.product_id, offer_id: off.id }
                  }]);
                } catch(e) {}
              }

              window.toast && window.toast(newStatus === 'accepted' ? 'Offre acceptée' : 'Offre refusée', 'success');
              _renderTab('received');
            } catch(err) {
              window.toast && window.toast('Erreur : ' + (err.message || 'opération échouée'), 'error');
            }
          });
        }

        else if (act === 'contact') {
          var buyerId = btn.dataset.buyer;
          var productId = btn.dataset.product;
          var url = 'messages.html?seller=' + encodeURIComponent(buyerId);
          if (productId) url += '&product=' + encodeURIComponent(productId);
          window.location.href = url;
        }
      });
    });
  }

  // Tabs
  document.querySelectorAll('#offers-tabs .profile-tab').forEach(function(tab) {
    tab.addEventListener('click', function() {
      document.querySelectorAll('#offers-tabs .profile-tab').forEach(function(t){ t.classList.remove('active'); });
      tab.classList.add('active');
      _renderTab(tab.dataset.tab);
    });
  });

  // Render initial : reçues
  _renderTab('received');

  // ── Helpers ──
  function _statusBadge(status) {
    var map = {
      pending:  { label: 'En attente',  cls: 'st-pending' },
      accepted: { label: 'Acceptée',    cls: 'st-paid' },
      rejected: { label: 'Refusée',     cls: 'st-cancelled' },
      expired:  { label: 'Expirée',     cls: 'st-cancelled' }
    };
    return map[status] || map.pending;
  }

  function _injectStyles() {
    if (document.getElementById('offers-styles')) return;
    var s = document.createElement('style');
    s.id = 'offers-styles';
    s.textContent = [
      '.profile-tabs{display:flex;gap:4px;margin-bottom:var(--space-4);background:var(--surface-2);padding:4px;border-radius:var(--r-md)}',
      '.profile-tab{flex:1;padding:8px 12px;background:transparent;border:none;border-radius:calc(var(--r-md) - 2px);font-weight:600;font-size:.85rem;color:var(--ink-3);cursor:pointer;font-family:inherit;transition:all .15s}',
      '.profile-tab.active{background:var(--white);color:var(--ink);box-shadow:var(--shadow-sm)}',

      '.offer-card{background:var(--white);border:1px solid var(--surface-3);border-radius:var(--r-xl);padding:14px;margin-bottom:14px;box-shadow:var(--shadow-sm)}',
      '.offer-product{display:flex;gap:12px;align-items:center;cursor:pointer;padding-bottom:12px;border-bottom:1px solid var(--surface-2);margin-bottom:12px}',
      '.offer-product img,.offer-product-ph{width:60px;height:60px;border-radius:var(--r-md);object-fit:cover;background:var(--surface-2);flex-shrink:0;display:flex;align-items:center;justify-content:center;color:var(--ink-3)}',
      '.offer-product-info{flex:1;min-width:0}',
      '.offer-product-title{font-weight:700;font-size:.92rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.offer-product-price{font-size:.78rem;color:var(--ink-3);margin-top:3px}',

      '.offer-buyer{display:flex;gap:10px;align-items:center;cursor:pointer;padding:8px;background:var(--surface-2);border-radius:var(--r-md);margin-bottom:12px}',
      '.offer-buyer img{width:36px;height:36px;border-radius:50%;object-fit:cover}',
      '.offer-buyer-name{font-weight:600;font-size:.85rem}',
      '.offer-buyer-sub{font-size:.7rem;color:var(--ink-3)}',

      '.offer-amount-row{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:10px}',
      '.offer-label{font-size:.72rem;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em}',
      '.offer-amount{font-family:Outfit,sans-serif;font-size:1.5rem;font-weight:800;color:var(--primary,#E8501A);margin-top:4px}',
      '.offer-note{font-size:.82rem;color:var(--ink-2);margin-top:6px;font-style:italic}',
      '.offer-status{font-size:.7rem;font-weight:700;padding:5px 10px;border-radius:999px;text-transform:uppercase;letter-spacing:.05em;white-space:nowrap;height:fit-content}',
      '.st-pending{background:#fef3c7;color:#92400e}',
      '.st-paid{background:#dcfce7;color:#166534}',
      '.st-cancelled{background:#fee2e2;color:#991b1b}',

      '.offer-meta{font-size:.72rem;color:var(--ink-3);margin-bottom:10px}',
      '.offer-actions{display:flex;gap:8px;flex-wrap:wrap;border-top:1px solid var(--surface-2);padding-top:10px}',
      '.offer-actions .btn{flex:1;min-width:90px}',
    ].join('');
    document.head.appendChild(s);
  }
});
