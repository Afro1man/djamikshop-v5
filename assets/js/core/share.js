// ═══════════════════════════════════════════════════════════════════
//  CORE / SHARE — WhatsApp deeplink + Web Share API
// ═══════════════════════════════════════════════════════════════════

(function() {

  // ── Détection plateforme ──
  function _isMobile() {
    return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
  }

  function _hasNativeShare() {
    return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  }

  // ── URL absolue de la fiche produit (navigation interne) ──
  window.productUrl = function(productId) {
    var origin = window.location.origin;
    return origin + '/pages/product-details.html?id=' + encodeURIComponent(productId);
  };

  // ── URL pour le PARTAGE externe (WhatsApp, FB…) ──
  // Pointe vers l'edge function "share" qui sert un HTML avec OG dynamiques,
  // puis redirige les humains vers la fiche produit. Si l'endpoint n'est pas
  // configuré (mode démo), retombe sur l'URL interne.
  window.productShareUrl = function(productId) {
    var endpoint = window.APP && window.APP.shareEndpoint;
    if (endpoint) return endpoint + '?id=' + encodeURIComponent(productId);
    return window.productUrl(productId);
  };

  // ── Compose un message texte propre (sans HTML/SVG) ──
  function _composeText(product) {
    var price = (window.formatPrice ? window.formatPrice(product.price) : (product.price + ' FCFA'));
    var lines = [
      product.title,
      price,
      product.city ? ('📍 ' + product.city) : '',
      '',
      'Voir l\'annonce sur DjamikShop :'
    ].filter(Boolean);
    return lines.join('\n');
  }

  // ── Partage WhatsApp direct (wa.me) ──
  window.shareToWhatsApp = function(product) {
    var text = _composeText(product);
    var url  = window.productShareUrl(product.id);
    var fullText = text + '\n' + url;
    var waUrl = 'https://wa.me/?text=' + encodeURIComponent(fullText);
    window.open(waUrl, '_blank', 'noopener');
  };

  // ── Partage natif si dispo, sinon WhatsApp ──
  window.shareProduct = async function(product) {
    var url  = window.productShareUrl(product.id);
    var text = _composeText(product);

    if (_hasNativeShare() && _isMobile()) {
      try {
        await navigator.share({
          title: product.title,
          text:  text,
          url:   url
        });
        return 'native';
      } catch (err) {
        if (err && err.name === 'AbortError') return 'cancelled';
        // sinon, fallback WA
      }
    }
    window.shareToWhatsApp(product);
    return 'whatsapp';
  };

  // ── Copie du lien dans le presse-papier ──
  window.copyProductLink = function(product) {
    var url = window.productShareUrl(product.id);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(url).then(function() {
        window.toast && window.toast('Lien copié', 'success');
        return true;
      }).catch(function() {
        window.toast && window.toast('Impossible de copier', 'error');
        return false;
      });
    }
    // Fallback : sélection manuelle
    var ta = document.createElement('textarea');
    ta.value = url;
    ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch(e) {}
    document.body.removeChild(ta);
    if (ok) window.toast && window.toast('Lien copié', 'success');
    else    window.toast && window.toast('Copiez l\'URL : ' + url, 'info');
    return Promise.resolve(ok);
  };

})();
