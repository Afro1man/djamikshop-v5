// ═══════════════════════════════════════════════════════════════════
//  CORE / SECURITY — Reporter d'incidents (version minimale)
// ═══════════════════════════════════════════════════════════════════
//
//  N'expose qu'une API publique : window.reportIncident(type, severity, details).
//  Les détections automatiques (devtools, console tampering) ont été retirées
//  car elles causaient des faux positifs et bloquaient l'app sur certains browsers.
//
//  La vraie sécurité est côté serveur (RLS Supabase + triggers Postgres).
// ═══════════════════════════════════════════════════════════════════

(function() {

  var ENDPOINT = 'https://iiswzieybgcqrywvopsf.supabase.co/functions/v1/log-event';

  // Throttle : max 5 reports / minute
  var _reportTimes = [];
  function _throttled() {
    var now = Date.now();
    _reportTimes = _reportTimes.filter(function(t){ return now - t < 60000; });
    if (_reportTimes.length >= 5) return true;
    _reportTimes.push(now);
    return false;
  }

  window.reportIncident = function(eventType, severity, details) {
    if (_throttled()) return;
    severity = severity || 'low';
    details  = details  || {};

    // Async + try/catch pour ne JAMAIS bloquer ou crasher l'app
    setTimeout(async function() {
      try {
        var token = null;
        if (window._supabase && window._supabase.auth && window._supabase.auth.getSession) {
          try {
            var s = await window._supabase.auth.getSession();
            if (s && s.data && s.data.session) token = s.data.session.access_token;
          } catch(_) {}
        }
        var headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = 'Bearer ' + token;

        await fetch(ENDPOINT, {
          method: 'POST',
          headers: headers,
          body: JSON.stringify({
            event_type: eventType,
            severity:   severity,
            details:    Object.assign({ url: window.location.pathname }, details)
          })
        });
      } catch(_) { /* ignore */ }
    }, 0);
  };

  // Capture les violations CSP si le navigateur en signale (utile pour debug)
  try {
    document.addEventListener('securitypolicyviolation', function(e) {
      window.reportIncident('csp_violation', 'high', {
        blockedURI: e.blockedURI && e.blockedURI.slice(0, 200),
        directive:  e.violatedDirective
      });
    });
  } catch(_) {}

})();
