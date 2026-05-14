// ═══════════════════════════════════════════════════════════════════
//  FEATURES / CHECKOUT — Flow de paiement
// ═══════════════════════════════════════════════════════════════════

window.onDjamikReady(function() {
  var root = document.getElementById('checkout-root');
  if (!root) return;

  var state = {
    cart:     window.getCart ? window.getCart() : [],
    operator: null,
    phone:    '',
    address:  '',
    note:     ''
  };

  if (!state.cart.length) {
    root.innerHTML =
      '<div class="empty-state">' +
        '<h3>Votre panier est vide</h3>' +
        '<p>Ajoutez des articles avant de passer au paiement.</p>' +
        '<a href="index.html" class="btn btn-primary mt-4">Parcourir les annonces</a>' +
      '</div>';
    return;
  }

  // Auth requis
  (window.requireAuth ? window.requireAuth('checkout.html') : Promise.resolve(true)).then(function(user) {
    if (!user) return;
    _renderCheckout(user);
  });

  function _renderCheckout(user) {
    var total = state.cart.reduce(function(s, i){ return s + ((i.price || 0) * (i.qty || 1)); }, 0);
    var count = state.cart.reduce(function(s, i){ return s + (i.qty || 1); }, 0);
    var methods = (window.APP && window.APP.paymentMethods) || [];

    root.innerHTML =
      '<div class="checkout-grid">' +

      // ── Colonne gauche : récap + formulaire ──
      '<div>' +

        // Récap commande
        '<div class="panel">' +
          '<h3 class="checkout-heading">Récapitulatif</h3>' +
          '<div class="checkout-items">' +
            state.cart.map(function(item) {
              var line = (item.price || 0) * (item.qty || 1);
              return '<div class="checkout-item">' +
                (item.image || item.image_url
                  ? '<img src="' + (item.image || item.image_url) + '" alt="">'
                  : '<div class="checkout-item-ph"></div>') +
                '<div class="checkout-item-body">' +
                  '<div class="checkout-item-name">' + window.escHtml(item.title || '') + '</div>' +
                  '<div class="checkout-item-meta">' + (item.qty || 1) + ' × ' + window.formatPrice(item.price) + '</div>' +
                '</div>' +
                '<div class="checkout-item-total">' + window.formatPrice(line) + '</div>' +
              '</div>';
            }).join('') +
          '</div>' +
        '</div>' +

        // Livraison
        '<div class="panel" style="margin-top:var(--space-4)">' +
          '<h3 class="checkout-heading">Livraison</h3>' +
          '<div class="form-group">' +
            '<label class="form-label" for="co-address">Adresse de livraison</label>' +
            '<textarea class="form-input" id="co-address" rows="2" placeholder="Quartier, rue, point de repère…"></textarea>' +
          '</div>' +
          '<div class="form-group">' +
            '<label class="form-label" for="co-note">Note pour le vendeur (optionnel)</label>' +
            '<textarea class="form-input" id="co-note" rows="2" placeholder="Heure préférée, instructions…"></textarea>' +
          '</div>' +
        '</div>' +

        // Mode de paiement
        '<div class="panel" style="margin-top:var(--space-4)">' +
          '<h3 class="checkout-heading">Mode de paiement</h3>' +
          '<div class="pay-grid">' +
            methods.map(function(m) {
              return '<label class="pay-card" data-id="' + m.id + '">' +
                '<input type="radio" name="pay-method" value="' + m.id + '">' +
                '<div class="pay-card-inner">' +
                  '<div class="pay-card-icon" style="color:' + m.color + '">' + m.icon + '</div>' +
                  '<div class="pay-card-text">' +
                    '<div class="pay-card-label">' + m.label + '</div>' +
                    '<div class="pay-card-desc">' + (m.desc || '') + '</div>' +
                  '</div>' +
                  '<div class="pay-card-check">' +
                    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="14" height="14"><polyline points="20 6 9 17 4 12"/></svg>' +
                  '</div>' +
                '</div>' +
              '</label>';
            }).join('') +
          '</div>' +

          // Téléphone (apparaît si opérateur mobile)
          '<div class="form-group hidden" id="co-phone-wrap" style="margin-top:var(--space-4)">' +
            '<label class="form-label" for="co-phone">Numéro mobile (+227)</label>' +
            '<div style="display:flex;align-items:center;gap:8px">' +
              '<span style="background:var(--surface-2);padding:10px 14px;border-radius:var(--r-md);border:1px solid var(--surface-3);font-weight:600">+227</span>' +
              '<input type="tel" class="form-input" id="co-phone" placeholder="9X XX XX XX" maxlength="11" inputmode="numeric" style="flex:1">' +
            '</div>' +
            '<div class="field-feedback" id="co-phone-feedback"></div>' +
          '</div>' +
        '</div>' +

      '</div>' +

      // ── Colonne droite : total + CTA ──
      '<div>' +
        '<div class="panel checkout-sticky">' +
          '<h3 class="checkout-heading">Total</h3>' +
          '<div class="checkout-row"><span>Articles (' + count + ')</span><span>' + window.formatPrice(total) + '</span></div>' +
          '<div class="checkout-row"><span>Livraison</span><span style="color:var(--success)">Gratuite</span></div>' +
          '<div class="checkout-divider"></div>' +
          '<div class="checkout-row checkout-total"><span>À payer</span><span>' + window.formatPrice(total) + '</span></div>' +
          '<button class="btn btn-primary btn-full btn-lg" id="co-pay-btn" style="margin-top:var(--space-4)" disabled>' +
            '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>' +
            ' Payer ' + window.formatPrice(total) +
          '</button>' +
          '<p style="font-size:.75rem;color:var(--ink-3);text-align:center;margin-top:10px">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="12" height="12" style="display:inline-block;vertical-align:middle"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> ' +
            'Vos données sont chiffrées' +
          '</p>' +
        '</div>' +
      '</div>' +

      '</div>';

    _injectStyles();
    _wireEvents(user, total);
  }

  function _wireEvents(user, total) {
    var phoneWrap = document.getElementById('co-phone-wrap');
    var phoneInp  = document.getElementById('co-phone');
    var payBtn    = document.getElementById('co-pay-btn');
    var feedback  = document.getElementById('co-phone-feedback');

    // Sélection opérateur
    document.querySelectorAll('.pay-card').forEach(function(card) {
      card.addEventListener('click', function() {
        document.querySelectorAll('.pay-card').forEach(function(c){ c.classList.remove('selected'); });
        card.classList.add('selected');
        card.querySelector('input').checked = true;
        state.operator = card.dataset.id;
        var method = (window.APP.paymentMethods || []).find(function(m){ return m.id === state.operator; });
        if (method && method.mobile) {
          phoneWrap.classList.remove('hidden');
        } else {
          phoneWrap.classList.add('hidden');
          state.phone = '';
        }
        _updateButtonState();
      });
    });

    // Saisie téléphone
    if (phoneInp) {
      phoneInp.addEventListener('input', function() {
        // Auto-format léger : groupes de 2 chiffres
        var d = this.value.replace(/\D/g, '').slice(0, 8);
        var parts = [];
        for (var i = 0; i < d.length; i += 2) parts.push(d.slice(i, i + 2));
        this.value = parts.join(' ');
        state.phone = d;
        var ok = window.normalizePhoneNE && window.normalizePhoneNE(d);
        feedback.textContent = ok ? '' : (d.length === 8 ? '' : 'Numéro à 8 chiffres');
        feedback.className = 'field-feedback ' + (ok && d.length === 8 ? 'ok' : 'err');
        _updateButtonState();
      });
    }

    // Adresse / note
    var addrInp = document.getElementById('co-address');
    var noteInp = document.getElementById('co-note');
    if (addrInp) addrInp.addEventListener('input', function(){ state.address = this.value; });
    if (noteInp) noteInp.addEventListener('input', function(){ state.note    = this.value; });

    // Click Payer
    payBtn.addEventListener('click', function() { _processPayment(user, total); });

    function _updateButtonState() {
      var method  = (window.APP.paymentMethods || []).find(function(m){ return m.id === state.operator; });
      var ready   = !!state.operator && (!method || !method.mobile || (state.phone && state.phone.length === 8));
      payBtn.disabled = !ready;
    }
  }

  async function _processPayment(user, total) {
    var payBtn = document.getElementById('co-pay-btn');
    var gw     = window.paymentGateways[state.operator];
    if (!gw) { window.toast && window.toast('Opérateur invalide.', 'error'); return; }

    payBtn.disabled = true;
    payBtn.innerHTML = '<span class="btn-spinner"></span> Paiement en cours…';

    // Affiche les instructions (USSD ou push notification)
    var orderId = window.genId ? window.genId() : ('ord-' + Date.now());
    var instructionModal = window.showModal(
      '<div style="text-align:center">' +
        '<div style="font-size:3rem;color:' + gw.color + ';margin-bottom:8px">' + gw.label.charAt(0) + '</div>' +
        '<h3 style="font-family:Outfit,sans-serif;margin-bottom:12px">' + gw.label + '</h3>' +
        '<p style="color:var(--ink-3);margin-bottom:16px;line-height:1.6">' + gw.instructions(state.phone, total) + '</p>' +
        '<div style="background:var(--surface-2);padding:14px;border-radius:var(--r-md);margin-bottom:16px">' +
          '<div style="font-size:.75rem;color:var(--ink-3)">Montant</div>' +
          '<div style="font-size:1.4rem;font-weight:800;color:' + gw.color + '">' + window.formatPrice(total) + '</div>' +
        '</div>' +
        '<div class="btn-spinner" style="margin:0 auto 8px"></div>' +
        '<p style="font-size:.8rem;color:var(--ink-3)">En attente de confirmation…</p>' +
      '</div>',
      { maxWidth: '400px' }
    );

    // Lance le paiement
    var result = await window.processPayment(state.operator, total, state.phone, orderId);
    instructionModal.close();

    if (!result.ok) {
      window.toast && window.toast('Paiement échoué : ' + result.message, 'error', 5000);
      payBtn.disabled = false;
      payBtn.innerHTML = '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg> Payer ' + window.formatPrice(total);
      return;
    }

    // Crée la commande
    var buyerId = user && user.id;
    if (!buyerId && window.currentUser) {
      var u = await window.currentUser();
      buyerId = u && u.id;
    }

    var order = {
      id:                 orderId,
      buyer_id:           buyerId,
      items:              state.cart,
      total:              total,
      address:            state.address || null,
      note:               state.note || null,
      payment_method:     state.operator,
      payment_phone:      state.phone || null,
      payment_reference:  result.ref,
      payment_status:     'paid',
      status:             'paid'
    };

    // 1. Insert Supabase (peut échouer si offline ou RLS — on continue quand même)
    if (window._supabase && buyerId) {
      try { await window._supabase.from('orders').insert([order]); }
      catch(e) { console.warn('[checkout] Supabase order insert failed', e); }
    }

    // 2. Save local pour affichage immédiat dans Mes commandes
    //    (rétrocompat avec le shape attendu par orders.js qui lit payment.method/phone/reference)
    var localOrder = Object.assign({}, order, {
      payment: { method: order.payment_method, phone: order.payment_phone, reference: order.payment_reference, status: order.payment_status }
    });
    window.saveOrder && window.saveOrder(localOrder);
    window.saveCart && window.saveCart([]);

    // Écran de succès
    window.showModal(
      '<div style="text-align:center">' +
        '<div style="width:64px;height:64px;border-radius:50%;background:var(--success-soft,#dcfce7);color:var(--success,#16a34a);display:flex;align-items:center;justify-content:center;margin:0 auto 14px">' +
          '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" width="32" height="32"><polyline points="20 6 9 17 4 12"/></svg>' +
        '</div>' +
        '<h3 style="font-family:Outfit,sans-serif;margin-bottom:8px">Paiement confirmé !</h3>' +
        '<p style="color:var(--ink-3);margin-bottom:16px">' + result.message + '</p>' +
        '<div style="background:var(--surface-2);padding:12px;border-radius:var(--r-md);margin-bottom:18px;font-family:monospace;font-size:.85rem">' +
          '<div style="font-size:.7rem;color:var(--ink-3);margin-bottom:4px">Référence</div>' + result.ref +
        '</div>' +
        '<a href="orders.html" class="btn btn-primary btn-full">Voir mes commandes</a>' +
      '</div>',
      { maxWidth: '380px' }
    );
  }

  // ── Styles ──
  function _injectStyles() {
    if (document.getElementById('co-styles')) return;
    var s = document.createElement('style');
    s.id = 'co-styles';
    s.textContent = [
      '.checkout-grid{display:grid;grid-template-columns:1fr 360px;gap:var(--space-6);align-items:start}',
      '@media(max-width:900px){.checkout-grid{grid-template-columns:1fr}}',
      '.checkout-heading{font-family:Outfit,sans-serif;font-size:1rem;font-weight:700;margin-bottom:14px;color:var(--ink)}',
      '.checkout-items{display:flex;flex-direction:column;gap:10px}',
      '.checkout-item{display:flex;align-items:center;gap:12px;padding:10px;border-radius:var(--r-md);background:var(--surface-2)}',
      '.checkout-item img,.checkout-item-ph{width:56px;height:56px;border-radius:var(--r-md);object-fit:cover;background:var(--surface-3);flex-shrink:0}',
      '.checkout-item-body{flex:1;min-width:0}',
      '.checkout-item-name{font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.checkout-item-meta{font-size:.75rem;color:var(--ink-3);margin-top:2px}',
      '.checkout-item-total{font-weight:700;color:var(--primary);font-size:.92rem;flex-shrink:0}',
      '.checkout-sticky{position:sticky;top:90px}',
      '.checkout-row{display:flex;justify-content:space-between;font-size:.9rem;padding:6px 0;color:var(--ink-2)}',
      '.checkout-divider{height:1px;background:var(--surface-3);margin:10px 0}',
      '.checkout-total{font-size:1.1rem;font-weight:800;color:var(--ink)}',
      '.pay-grid{display:flex;flex-direction:column;gap:8px}',
      '.pay-card{position:relative;cursor:pointer;display:block}',
      '.pay-card input{position:absolute;opacity:0;pointer-events:none}',
      '.pay-card-inner{display:flex;align-items:center;gap:12px;padding:12px 14px;border:2px solid var(--surface-3);border-radius:var(--r-md);transition:border-color .15s,background .15s;background:var(--white)}',
      '.pay-card:hover .pay-card-inner{border-color:var(--ink-3)}',
      '.pay-card.selected .pay-card-inner{border-color:var(--primary);background:rgba(232,80,26,.04)}',
      '.pay-card-icon{flex-shrink:0;width:32px;height:32px;display:flex;align-items:center;justify-content:center}',
      '.pay-card-icon svg{width:24px;height:24px}',
      '.pay-card-text{flex:1;min-width:0}',
      '.pay-card-label{font-weight:700;font-size:.92rem;color:var(--ink)}',
      '.pay-card-desc{font-size:.75rem;color:var(--ink-3);margin-top:1px}',
      '.pay-card-check{width:22px;height:22px;border-radius:50%;border:2px solid var(--surface-3);display:flex;align-items:center;justify-content:center;color:#fff;flex-shrink:0;transition:all .15s}',
      '.pay-card.selected .pay-card-check{background:var(--primary);border-color:var(--primary)}',
      '.pay-card:not(.selected) .pay-card-check svg{opacity:0}',
    ].join('');
    document.head.appendChild(s);
  }
});
