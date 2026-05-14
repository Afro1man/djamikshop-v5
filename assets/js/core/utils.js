// ═══════════════════════════════════════════════════════════════════
//  CORE / UTILS — Helpers globaux
// ═══════════════════════════════════════════════════════════════════

window.formatPrice = function(n) {
  if (!n && n !== 0) return '--';
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
};

window.relativeDate = function(d) {
  if (!d) return '--';
  var diff = Date.now() - new Date(d).getTime();
  var mins = Math.floor(diff / 60000);
  if (mins < 1)  return 'À l\'instant';
  if (mins < 60) return 'il y a ' + mins + ' min';
  var h = Math.floor(mins / 60);
  if (h < 24)    return 'il y a ' + h + 'h';
  var days = Math.floor(h / 24);
  if (days < 7)  return 'il y a ' + days + ' j';
  if (days < 30) return 'il y a ' + Math.floor(days/7) + ' sem';
  return new Date(d).toLocaleDateString('fr-FR', { day:'numeric', month:'short' });
};

window.genId = function() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
};

window.escHtml = function(str) {
  if (!str) return '';
  var div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
};

window.conditionBadge = function(cid) {
  var c = (window.APP.conditions || []).find(function(x){ return x.id === cid; });
  if (!c) return '';
  return '<span class="badge-cond badge-cond-' + c.badge + '">' + c.label + '</span>';
};

window.getCatById = function(id) {
  return (window.APP.categories || []).find(function(c){ return c.id === id; });
};
