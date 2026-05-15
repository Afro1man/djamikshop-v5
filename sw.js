// ═══════════════════════════════════════════════════════════════════
//  SERVICE WORKER — DjamikShop PWA
//  Cache-first pour assets, network-first pour pages, bypass Supabase
// ═══════════════════════════════════════════════════════════════════

var VERSION    = 'djamik-v48';
var CACHE_CORE = 'djamik-core-' + VERSION;
var CACHE_PAGE = 'djamik-pages-' + VERSION;
var CACHE_IMG  = 'djamik-img-'   + VERSION;

// App shell — pré-cache à l'install
var CORE_ASSETS = [
  '/pages/index.html',
  '/manifest.webmanifest',
  '/assets/icons/icon.svg',
  '/assets/icons/icon-maskable.svg',
  '/assets/css/main.css',
  '/assets/js/app.js',
  '/assets/js/core/icons.js',
  '/assets/js/core/config.js',
  '/assets/js/core/utils.js',
  '/assets/js/core/state.js',
  '/assets/js/core/theme.js',
  '/assets/js/core/pwa.js',
  '/assets/js/core/share.js',
  '/assets/js/core/payment.js',
  '/assets/js/core/push.js',
  '/assets/js/core/security.js',
  '/assets/js/features/auth.js',
  '/assets/js/components/ui.js',
  '/assets/js/components/shell.js',
  '/assets/js/components/bottom-nav.js'
];

// ── INSTALL ──
self.addEventListener('install', function(event) {
  event.waitUntil(
    caches.open(CACHE_CORE).then(function(cache) {
      // addAll est atomique : un échec invalide tout. On utilise fetch+put en parallèle
      // avec cache:'reload' pour bypasser le cache HTTP du navigateur.
      return Promise.all(CORE_ASSETS.map(function(url) {
        return fetch(url, { cache: 'reload' }).then(function(resp) {
          if (resp && resp.ok) return cache.put(url, resp);
        }).catch(function(err) {
          console.warn('[SW] Skip pre-cache:', url, err.message);
        });
      }));
    }).then(function() { return self.skipWaiting(); })
  );
});

// ── ACTIVATE — purge anciens caches ──
self.addEventListener('activate', function(event) {
  event.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(keys.map(function(k) {
        if (k !== CACHE_CORE && k !== CACHE_PAGE && k !== CACHE_IMG) return caches.delete(k);
      }));
    }).then(function() { return self.clients.claim(); })
  );
});

// ── FETCH — stratégies par type ──
self.addEventListener('fetch', function(event) {
  var req = event.request;
  if (req.method !== 'GET') return;

  var url = new URL(req.url);

  // Bypass : Supabase, CDN externes, analytics
  if (url.hostname.includes('supabase.co') ||
      url.hostname.includes('ui-avatars.com') ||
      url.protocol === 'chrome-extension:') {
    return;
  }

  // CDN scripts (Supabase JS) — stale-while-revalidate
  if (url.hostname === 'cdn.jsdelivr.net') {
    event.respondWith(_staleWhileRevalidate(req, CACHE_CORE));
    return;
  }

  // Images — cache-first
  if (req.destination === 'image' || /\.(png|jpe?g|svg|gif|webp|avif|ico)$/i.test(url.pathname)) {
    event.respondWith(_cacheFirst(req, CACHE_IMG));
    return;
  }

  // CSS / JS — network-first (frais d'abord, fallback cache offline)
  // Évite les bugs liés à du JS obsolète servi depuis le cache.
  if (req.destination === 'style' || req.destination === 'script' ||
      /\.(css|js|webmanifest)$/i.test(url.pathname)) {
    event.respondWith(_networkFirst(req, CACHE_CORE));
    return;
  }

  // HTML / navigation — network-first avec fallback cache + offline
  if (req.mode === 'navigate' || req.destination === 'document' || /\.html$/i.test(url.pathname)) {
    event.respondWith(_networkFirst(req, CACHE_PAGE));
    return;
  }

  // Défaut — passe-plat avec fallback cache
  event.respondWith(
    fetch(req).catch(function() { return caches.match(req); })
  );
});

// ── STRATÉGIES ──
function _cacheFirst(req, cacheName) {
  return caches.match(req).then(function(cached) {
    if (cached) return cached;
    return fetch(req).then(function(resp) {
      if (resp && resp.ok) {
        var clone = resp.clone();
        caches.open(cacheName).then(function(c){ c.put(req, clone); });
      }
      return resp;
    }).catch(function(){ return cached; });
  });
}

function _networkFirst(req, cacheName) {
  // Force bypass du cache HTTP du navigateur pour toujours obtenir la dernière version
  var freshReq = new Request(req.url, { method: 'GET', cache: 'no-cache', credentials: req.credentials });
  return fetch(freshReq).then(function(resp) {
    if (resp && resp.ok) {
      var clone = resp.clone();
      caches.open(cacheName).then(function(c){ c.put(req, clone); });
    }
    return resp;
  }).catch(function() {
    return caches.match(req).then(function(cached) {
      return cached || caches.match('/pages/index.html');
    });
  });
}

function _staleWhileRevalidate(req, cacheName) {
  return caches.match(req).then(function(cached) {
    var fetchPromise = fetch(req).then(function(resp) {
      if (resp && resp.ok) {
        var clone = resp.clone();
        caches.open(cacheName).then(function(c){ c.put(req, clone); });
      }
      return resp;
    }).catch(function(){ return cached; });
    return cached || fetchPromise;
  });
}

// ── MESSAGE — permet à l'app de forcer skipWaiting ──
self.addEventListener('message', function(event) {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

// ═══════════════════════════════════════════════════════════════════
//  PUSH NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════

// ── Réception d'une push ──
self.addEventListener('push', function(event) {
  var payload = {};
  try { payload = event.data ? event.data.json() : {}; }
  catch(e) { payload = { title: 'DjamikShop', body: event.data ? event.data.text() : '' }; }

  var title = payload.title || 'DjamikShop';
  var options = {
    body:    payload.body  || '',
    icon:    payload.icon  || '/assets/icons/icon.svg',
    badge:   payload.badge || '/assets/icons/icon.svg',
    image:   payload.image,
    tag:     payload.tag    || 'djamik-' + Date.now(),
    data:    payload.data   || { url: payload.url || '/pages/index.html' },
    actions: payload.actions || [],
    requireInteraction: !!payload.requireInteraction,
    silent:  !!payload.silent
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

// ── Click sur une notification → ouvre l'app sur la bonne page ──
self.addEventListener('notificationclick', function(event) {
  event.notification.close();
  var targetUrl = (event.notification.data && event.notification.data.url) || '/pages/index.html';

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientsList) {
      // Si une fenêtre DjamikShop est déjà ouverte, focus + navigate
      for (var i = 0; i < clientsList.length; i++) {
        var c = clientsList[i];
        if (c.url.indexOf(self.location.origin) === 0) {
          c.focus();
          if ('navigate' in c) return c.navigate(targetUrl);
          return c.postMessage({ type: 'NAVIGATE', url: targetUrl });
        }
      }
      // Sinon ouvrir une nouvelle fenêtre
      if (self.clients.openWindow) return self.clients.openWindow(targetUrl);
    })
  );
});

// ── Subscription perdue/expirée → permet à l'app de re-souscrire ──
self.addEventListener('pushsubscriptionchange', function(event) {
  event.waitUntil(
    self.clients.matchAll().then(function(clientsList) {
      clientsList.forEach(function(c) { c.postMessage({ type: 'PUSH_SUBSCRIPTION_CHANGED' }); });
    })
  );
});
