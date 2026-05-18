// ═══════════════════════════════════════════════════════════════════
//  CORE / STAFF — Helpers role staff (admin vs moderator)
// ═══════════════════════════════════════════════════════════════════

(function() {
  var _roleCache = null;
  var _roleTime = 0;
  var TTL = 5 * 60 * 1000;     // 5 min

  // Retourne 'admin', 'moderator', ou null
  window.myStaffRole = async function(force) {
    if (!force && _roleCache !== null && (Date.now() - _roleTime) < TTL) return _roleCache;
    if (!window._supabase) return null;
    try {
      var r = await window._supabase.rpc('my_staff_role');
      _roleCache = (r && r.data) || null;
      _roleTime = Date.now();
      return _roleCache;
    } catch(e) { return null; }
  };

  window.isMyselfAdmin = async function() {
    var r = await window.myStaffRole();
    return r === 'admin';
  };

  window.isMyselfStaff = async function() {
    var r = await window.myStaffRole();
    return r === 'admin' || r === 'moderator';
  };
})();
