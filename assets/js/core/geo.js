// ═══════════════════════════════════════════════════════════════════
//  CORE / GEO — Géolocalisation utilisateur + distances entre villes
// ═══════════════════════════════════════════════════════════════════

(function() {

  // ── Coordonnées des 10 villes du Niger (lat, lng) ──
  var CITY_COORDS = {
    'Niamey':         { lat: 13.5117, lng: 2.1251 },
    'Zinder':         { lat: 13.8064, lng: 8.9883 },
    'Maradi':         { lat: 13.5000, lng: 7.1000 },
    'Tahoua':         { lat: 14.8907, lng: 5.2647 },
    'Agadez':         { lat: 16.9742, lng: 7.9912 },
    'Dosso':          { lat: 13.0444, lng: 3.1936 },
    'Diffa':          { lat: 13.3120, lng: 12.6113 },
    'Tillabéri':      { lat: 14.2074, lng: 1.4544 },
    "Birni-N'Konni":  { lat: 13.7958, lng: 5.2553 },
    'Arlit':          { lat: 18.7369, lng: 7.3853 }
  };

  // ── Haversine (km entre 2 points GPS) ──
  function _haversine(lat1, lng1, lat2, lng2) {
    var R = 6371;     // rayon Terre en km
    var toRad = function(d){ return d * Math.PI / 180; };
    var dLat = toRad(lat2 - lat1);
    var dLng = toRad(lng2 - lng1);
    var a = Math.sin(dLat/2)*Math.sin(dLat/2) +
            Math.cos(toRad(lat1))*Math.cos(toRad(lat2)) *
            Math.sin(dLng/2)*Math.sin(dLng/2);
    var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  // ── API publique ──

  // Coordonnées d'une ville par nom
  window.cityCoords = function(name) {
    if (!name) return null;
    return CITY_COORDS[name] || null;
  };

  // Distance entre deux villes (km, arrondi). null si manque coords.
  window.cityDistance = function(cityA, cityB) {
    var a = window.cityCoords(cityA);
    var b = window.cityCoords(cityB);
    if (!a || !b) return null;
    return Math.round(_haversine(a.lat, a.lng, b.lat, b.lng));
  };

  // Distance entre point GPS utilisateur et une ville
  window.distanceToCity = function(userLat, userLng, cityName) {
    var c = window.cityCoords(cityName);
    if (!c) return null;
    return Math.round(_haversine(userLat, userLng, c.lat, c.lng));
  };

  // Format lisible
  window.formatDistance = function(km) {
    if (km == null) return '';
    if (km < 1) return 'à proximité';
    if (km < 10) return 'à ' + km + ' km';
    if (km < 100) return 'à ~' + km + ' km';
    return 'à ' + Math.round(km / 10) * 10 + ' km';
  };

  // Trouve la ville la plus proche d'une position GPS
  window.nearestCity = function(lat, lng) {
    var best = null, bestDist = Infinity;
    for (var name in CITY_COORDS) {
      var c = CITY_COORDS[name];
      var d = _haversine(lat, lng, c.lat, c.lng);
      if (d < bestDist) { bestDist = d; best = name; }
    }
    return best ? { city: best, distance: Math.round(bestDist) } : null;
  };

  // ── Position utilisateur (cache 24h dans localStorage) ──

  var STORAGE_KEY = 'dj_user_loc';
  var CACHE_MS    = 24 * 3600 * 1000;

  window.getStoredLocation = function() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      var loc = JSON.parse(raw);
      if (!loc || !loc.lat || !loc.savedAt) return null;
      if (Date.now() - loc.savedAt > CACHE_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return loc;
    } catch(e) { return null; }
  };

  window.clearStoredLocation = function() {
    try { localStorage.removeItem(STORAGE_KEY); } catch(e) {}
  };

  // Demande la géoloc native (renvoie Promise)
  window.requestUserLocation = function() {
    return new Promise(function(resolve) {
      if (!navigator.geolocation) { resolve(null); return; }
      navigator.geolocation.getCurrentPosition(
        function(pos) {
          var nearest = window.nearestCity(pos.coords.latitude, pos.coords.longitude);
          var loc = {
            lat:      pos.coords.latitude,
            lng:      pos.coords.longitude,
            city:     nearest ? nearest.city : null,
            distance: nearest ? nearest.distance : null,
            savedAt:  Date.now()
          };
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(loc)); } catch(e) {}
          resolve(loc);
        },
        function(err) {
          console.warn('[geo] denied or failed:', err && err.message);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 }
      );
    });
  };

  // Distance entre l'utilisateur et un produit (via sa ville)
  window.distanceToProduct = function(product) {
    var loc = window.getStoredLocation();
    if (!loc || !product || !product.city) return null;
    return window.distanceToCity(loc.lat, loc.lng, product.city);
  };

})();
