// ═══════════════════════════════════════════════════════════════════
//  CORE / PUSH — Web Push subscription helpers
//  Demande la permission, souscrit le browser au push manager,
//  envoie le subscription au backend pour stockage.
// ═══════════════════════════════════════════════════════════════════

(function() {

  // ── Capabilities ──
  window.pushIsSupported = function() {
    return 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window;
  };

  window.pushPermissionState = function() {
    if (!('Notification' in window)) return 'unsupported';
    return Notification.permission; // 'default' | 'granted' | 'denied'
  };

  // ── Subscribe ──
  // Retourne la subscription (PushSubscription) ou null si refusé.
  // Aussi POST la sub au backend si APP.pushEndpoint est configuré.
  window.subscribePush = async function() {
    if (!window.pushIsSupported()) {
      window.toast && window.toast('Notifications non supportées sur ce navigateur.', 'error');
      return null;
    }
    var vapid = window.APP && window.APP.vapidPublicKey;
    if (!vapid) {
      console.warn('[push] APP.vapidPublicKey non configuré');
      return null;
    }

    // Demande la permission si pas encore décidée
    var perm = Notification.permission;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') {
      window.toast && window.toast('Notifications refusées. Activez-les dans les paramètres du navigateur.', 'info', 5000);
      return null;
    }

    // Récupère le SW registration
    var reg = await navigator.serviceWorker.ready;

    // Vérifie s'il y a déjà une subscription
    var sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: _urlBase64ToUint8Array(vapid)
      });
    }

    // Envoie au backend pour stockage (Supabase)
    await _saveSubscription(sub);
    window.toast && window.toast('Notifications activées !', 'success');
    return sub;
  };

  // ── Unsubscribe ──
  window.unsubscribePush = async function() {
    if (!('serviceWorker' in navigator)) return;
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await sub.unsubscribe();
    await _deleteSubscription(sub.endpoint);
    window.toast && window.toast('Notifications désactivées.', 'info');
  };

  // ── Status ──
  window.isPushSubscribed = async function() {
    if (!window.pushIsSupported()) return false;
    var reg = await navigator.serviceWorker.ready;
    var sub = await reg.pushManager.getSubscription();
    return !!sub;
  };

  // ── Test local : déclenche une notif locale (sans serveur, pour debug) ──
  window.testLocalNotification = async function() {
    if (Notification.permission !== 'granted') {
      var p = await Notification.requestPermission();
      if (p !== 'granted') return;
    }
    var reg = await navigator.serviceWorker.ready;
    reg.showNotification('DjamikShop', {
      body: 'Test de notification local',
      icon: '/assets/icons/icon.svg',
      badge: '/assets/icons/icon.svg',
      tag:  'djamik-test',
      data: { url: '/pages/index.html' }
    });
  };

  // ── Helpers ──

  function _urlBase64ToUint8Array(base64String) {
    // Convertit la clé VAPID base64url en Uint8Array attendu par PushManager.subscribe
    var padding = '='.repeat((4 - base64String.length % 4) % 4);
    var base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    var raw     = window.atob(base64);
    var output  = new Uint8Array(raw.length);
    for (var i = 0; i < raw.length; ++i) output[i] = raw.charCodeAt(i);
    return output;
  }

  async function _saveSubscription(sub) {
    var endpoint = window.APP && window.APP.pushEndpoint;
    if (!endpoint || !window._supabase) {
      // Mode démo : stocke localement
      try { localStorage.setItem('dj_push_sub', JSON.stringify(sub.toJSON())); } catch(e) {}
      return;
    }
    var session = null;
    try {
      var sRaw = localStorage.getItem('dj_demo_session');
      if (sRaw) session = JSON.parse(sRaw);
    } catch(e) {}
    if (!session && window._supabase) {
      try {
        var r = await window._supabase.auth.getSession();
        if (r.data && r.data.session) session = r.data.session.user;
      } catch(e) {}
    }
    var userId = session ? (session.id || session.sub || 'guest') : 'guest';

    // Insère/upsert dans Supabase
    try {
      await window._supabase.from('push_subscriptions').upsert({
        endpoint:   sub.endpoint,
        user_id:    userId,
        keys:       sub.toJSON().keys,
        user_agent: navigator.userAgent,
        updated_at: new Date().toISOString()
      }, { onConflict: 'endpoint' });
    } catch(e) { console.warn('[push] save failed', e); }
  }

  async function _deleteSubscription(endpoint) {
    if (!window._supabase) return;
    try { await window._supabase.from('push_subscriptions').delete().eq('endpoint', endpoint); }
    catch(e) {}
  }

  // ── Écoute le SW pour re-souscription suite à expiration ──
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', function(event) {
      if (event.data && event.data.type === 'PUSH_SUBSCRIPTION_CHANGED') {
        window.subscribePush();
      }
      if (event.data && event.data.type === 'NAVIGATE') {
        window.location.href = event.data.url;
      }
    });
  }
})();
