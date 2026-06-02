// ═══════════════════════════════════════════════════════════════════
//  ANALYTICS — PostHog tracking
//  Expose window.track(event, props) + window.identifyUser(uid, props)
//  Load lazy : ne bloque jamais le rendu.
// ═══════════════════════════════════════════════════════════════════

(function() {
  // ┌─────────────────────────────────────────────────────────────┐
  // │  CONFIG — remplace ces 2 valeurs quand tu auras ton compte  │
  // └─────────────────────────────────────────────────────────────┘
  var POSTHOG_KEY  = 'POSTHOG_KEY_PLACEHOLDER'; // ex: 'phc_xxxxxxxxxxxxxxxxxxxx'
  var POSTHOG_HOST = 'https://eu.i.posthog.com'; // ou 'https://us.i.posthog.com'

  // Queue pour buffer les events si posthog pas encore prêt
  var _queue = [];
  var _ready = false;

  // ── API publique (toujours dispo, no-op si pas configuré)
  window.track = function(event, props) {
    if (!event) return;
    if (POSTHOG_KEY.indexOf('PLACEHOLDER') === 0) {
      // Pas encore configuré : log en dev pour visibilité
      if (window.console && window.console.debug) window.console.debug('[track]', event, props || {});
      return;
    }
    if (!_ready) { _queue.push(['capture', event, props]); return; }
    try { window.posthog.capture(event, props || {}); } catch (e) {}
  };

  window.identifyUser = function(uid, props) {
    if (!uid) return;
    if (POSTHOG_KEY.indexOf('PLACEHOLDER') === 0) return;
    if (!_ready) { _queue.push(['identify', uid, props]); return; }
    try { window.posthog.identify(uid, props || {}); } catch (e) {}
  };

  window.resetAnalytics = function() {
    if (POSTHOG_KEY.indexOf('PLACEHOLDER') === 0) return;
    if (!_ready) { _queue.push(['reset']); return; }
    try { window.posthog.reset(); } catch (e) {}
  };

  // ── Bootstrap PostHog (uniquement si clé réelle configurée)
  if (POSTHOG_KEY.indexOf('PLACEHOLDER') === 0) return;

  // Snippet officiel PostHog (mini-version)
  !function(t,e){var o,n,p,r;e.__SV||(window.posthog=e,e._i=[],e.init=function(i,s,a){function g(t,e){var o=e.split(".");2==o.length&&(t=t[o[0]],e=o[1]),t[e]=function(){t.push([e].concat(Array.prototype.slice.call(arguments,0)))}}(p=t.createElement("script")).type="text/javascript",p.async=!0,p.src=s.api_host+"/static/array.js",(r=t.getElementsByTagName("script")[0]).parentNode.insertBefore(p,r);var u=e;for(void 0!==a?u=e[a]=[]:a="posthog",u.people=u.people||[],u.toString=function(t){var e="posthog";return"posthog"!==a&&(e+="."+a),t||(e+=" (stub)"),e},u.people.toString=function(){return u.toString(1)+".people (stub)"},o="capture identify alias people.set people.set_once set_config register register_once unregister opt_out_capturing has_opted_out_capturing opt_in_capturing reset isFeatureEnabled onFeatureFlags getFeatureFlag getFeatureFlagPayload reloadFeatureFlags group updateEarlyAccessFeatureEnrollment getEarlyAccessFeatures getActiveMatchingSurveys getSurveys getNextSurveyStep onSessionId".split(" "),n=0;n<o.length;n++)g(u,o[n]);e._i.push([i,s,a])},e.__SV=1)}(document,window.posthog||[]);

  window.posthog.init(POSTHOG_KEY, {
    api_host: POSTHOG_HOST,
    capture_pageview: true,
    capture_pageleave: true,
    autocapture: false,            // évite le bruit, on track manuellement
    persistence: 'localStorage+cookie',
    loaded: function() {
      _ready = true;
      // Flush la queue
      _queue.forEach(function(item) {
        try {
          if (item[0] === 'capture') window.posthog.capture(item[1], item[2] || {});
          else if (item[0] === 'identify') window.posthog.identify(item[1], item[2] || {});
          else if (item[0] === 'reset') window.posthog.reset();
        } catch (e) {}
      });
      _queue = [];

      // Identify si user déjà connecté
      try {
        if (window._supabase) {
          window._supabase.auth.getUser().then(function(r) {
            var u = r && r.data && r.data.user;
            if (u) window.posthog.identify(u.id, { email: u.email });
          });
        }
      } catch (e) {}
    }
  });
})();
