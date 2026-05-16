// ═══════════════════════════════════════════════════════════════════
//  CORE / PAYMENT — Gateways Mobile Money (Niger)
//  Architecture en adapter : un slot processPayment() par opérateur.
//  Mode démo par défaut. Pour brancher la vraie API marchand d'un
//  opérateur, remplacer le corps de processPayment correspondant
//  par un appel HTTP vers leur endpoint.
// ═══════════════════════════════════════════════════════════════════

(function() {

  // ── Validation du numéro Niger (8 chiffres, code pays +227) ──
  window.normalizePhoneNE = function(raw) {
    if (!raw) return null;
    var digits = String(raw).replace(/\D/g, '');
    if (digits.startsWith('00227')) digits = digits.slice(5);
    else if (digits.startsWith('227') && digits.length === 11) digits = digits.slice(3);
    if (digits.length !== 8) return null;
    return digits;
  };

  window.formatPhoneNE = function(raw) {
    var d = window.normalizePhoneNE(raw);
    if (!d) return raw;
    return '+227 ' + d.slice(0,2) + ' ' + d.slice(2,4) + ' ' + d.slice(4,6) + ' ' + d.slice(6,8);
  };

  // ── Simulation paiement (mode démo) ──
  // Retourne une Promise qui résout { ok, ref, message } après un délai.
  function _demoProcess(operator, amount, phone, orderId) {
    return new Promise(function(resolve) {
      setTimeout(function() {
        // 95% de succès en démo, 5% d'échec pour montrer le flow d'erreur
        var ok = Math.random() > 0.05;
        resolve({
          ok:      ok,
          ref:     'DEMO-' + operator.toUpperCase() + '-' + Date.now().toString(36).toUpperCase(),
          message: ok ? 'Paiement confirmé (mode démo)' : 'Solde insuffisant (simulation)'
        });
      }, 1800);
    });
  }

  // ── Gateways : un objet par opérateur ──
  // Chaque gateway expose :
  //   instructions(phone, amount) → texte affiché à l'utilisateur
  //   processPayment(amount, phone, orderId) → Promise<{ok, ref, message}>
  window.paymentGateways = {

    mynita: {
      label:        'Mynita',
      color:        '#7C3AED',
      ussd:         null,
      instructions: function(phone, amount) {
        return 'Une demande de paiement de ' + window.formatPrice(amount) +
               ' a été envoyée à ' + window.formatPhoneNE(phone) +
               '. Ouvrez l\'application Mynita et confirmez la transaction.';
      },
      processPayment: function(amount, phone, orderId) {
        // TODO : Mynita merchant API (vérifier la doc officielle)
        return _demoProcess('mynita', amount, phone, orderId);
      }
    },

    amanata: {
      label:        'Amanata',
      color:        '#16A34A',
      ussd:         null,
      instructions: function(phone, amount) {
        return 'Vérifiez votre téléphone ' + window.formatPhoneNE(phone) +
               ' : une notification Amanata vous invite à confirmer le paiement de ' +
               window.formatPrice(amount) + '.';
      },
      processPayment: function(amount, phone, orderId) {
        // TODO : Amanata merchant API (vérifier la doc officielle)
        return _demoProcess('amanata', amount, phone, orderId);
      }
    },

    cod: {
      label:        'Paiement à la livraison',
      color:        '#059669',
      ussd:         null,
      instructions: function() {
        return 'Vous paierez en espèces directement au livreur lors de la réception.';
      },
      processPayment: function(amount, phone, orderId) {
        return Promise.resolve({ ok: true, ref: 'COD-' + orderId, message: 'À régler à la livraison' });
      }
    },

    main_propre: {
      label:        'Remise en main propre',
      color:        '#6B7280',
      ussd:         null,
      instructions: function() {
        return 'Vous réglerez directement le vendeur lors de la rencontre.';
      },
      processPayment: function(amount, phone, orderId) {
        return Promise.resolve({ ok: true, ref: 'MP-' + orderId, message: 'À régler en main propre' });
      }
    }
  };

  // ── Helper : lance le paiement pour l'opérateur choisi ──
  window.processPayment = function(operatorId, amount, phone, orderId) {
    var gw = window.paymentGateways[operatorId];
    if (!gw) return Promise.resolve({ ok: false, message: 'Opérateur inconnu' });
    return gw.processPayment(amount, phone, orderId);
  };

})();
