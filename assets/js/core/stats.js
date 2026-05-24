// ═══════════════════════════════════════════════════════════════════
//  CORE / STATS — tracking vues + clics produits (batch + dedupe)
//
//  - trackProductView(id)  : appelé par IntersectionObserver sur les cards
//  - trackProductClick(id) : appelé sur ouverture page detail
//  - Dedup session : un produit n'est compté qu'une fois par session
//  - Batch toutes les 30s → 1 seul RPC Supabase pour tout flusher
//  - Bonne perf 3G : pas de requete reseau a chaque scroll
// ═══════════════════════════════════════════════════════════════════

(function() {
  var BATCH_INTERVAL_MS = 30 * 1000;     // 30s entre 2 flush
  var STORAGE_KEY       = 'dj_stats_queue';
  var SESSION_KEY_V     = 'dj_session_viewed';
  var SESSION_KEY_C     = 'dj_session_clicked';

  // ─── Helpers session dedupe (sessionStorage = reset a chaque tab fermee) ───
  function _sessionSet(key) {
    try {
      var arr = JSON.parse(sessionStorage.getItem(key) || '[]');
      return new Set(arr);
    } catch(e) { return new Set(); }
  }
  function _sessionSave(key, set) {
    try { sessionStorage.setItem(key, JSON.stringify(Array.from(set))); } catch(e){}
  }

  var viewedThisSession  = _sessionSet(SESSION_KEY_V);
  var clickedThisSession = _sessionSet(SESSION_KEY_C);

  // ─── Queue (localStorage = persiste meme si tab fermee, flush au prochain load) ───
  function _getQueue() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch(e) { return {}; }
  }
  function _saveQueue(q) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(q)); } catch(e){}
  }

  function _enqueue(productId, type) {
    if (!productId) return;
    var q = _getQueue();
    if (!q[productId]) q[productId] = { v: 0, c: 0 };
    if (type === 'view')  q[productId].v += 1;
    if (type === 'click') q[productId].c += 1;
    _saveQueue(q);
  }

  // ─── API publique ───
  window.trackProductView = function(productId) {
    if (!productId || viewedThisSession.has(productId)) return;
    viewedThisSession.add(productId);
    _sessionSave(SESSION_KEY_V, viewedThisSession);
    _enqueue(productId, 'view');
  };

  window.trackProductClick = function(productId) {
    if (!productId || clickedThisSession.has(productId)) return;
    clickedThisSession.add(productId);
    _sessionSave(SESSION_KEY_C, clickedThisSession);
    _enqueue(productId, 'click');
    // Click = signal fort, on flush rapidement
    setTimeout(_flush, 500);
  };

  // ─── Flush batch ───
  var flushing = false;
  function _flush() {
    if (flushing) return;
    if (!window._supabase) return;
    var q = _getQueue();
    var keys = Object.keys(q);
    if (!keys.length) return;

    flushing = true;
    // On vide la queue tout de suite (optimiste). En cas d'echec on remet.
    _saveQueue({});

    window._supabase.rpc('bump_product_stats', { p_batch: q })
      .then(function(res) {
        flushing = false;
        if (res && res.error) {
          // Remet la queue en cas d'echec (sera retentee au prochain flush)
          var cur = _getQueue();
          keys.forEach(function(k) {
            if (!cur[k]) cur[k] = { v: 0, c: 0 };
            cur[k].v += q[k].v;
            cur[k].c += q[k].c;
          });
          _saveQueue(cur);
          console.warn('[stats] flush failed, will retry', res.error.message);
        }
      })
      .catch(function(err) {
        flushing = false;
        // Reput la queue
        var cur = _getQueue();
        keys.forEach(function(k) {
          if (!cur[k]) cur[k] = { v: 0, c: 0 };
          cur[k].v += q[k].v;
          cur[k].c += q[k].c;
        });
        _saveQueue(cur);
        console.warn('[stats] flush exception', err);
      });
  }

  // Flush periodique
  setInterval(_flush, BATCH_INTERVAL_MS);

  // Flush quand l'user quitte / cache la page
  window.addEventListener('beforeunload', _flush);
  document.addEventListener('visibilitychange', function() {
    if (document.visibilityState === 'hidden') _flush();
  });

  // Flush au load (au cas ou queue restee de la session precedente)
  setTimeout(_flush, 3000);

  // ─── IntersectionObserver pour cards de listes ───
  // Auto-installe sur tous les elements [data-track-view] qui apparaissent.
  // Une card est "vue" quand 50% visible pendant >800ms.
  var observer = null;
  var pendingIds = new Map(); // id -> timeoutId
  function _initObserver() {
    if (observer || !('IntersectionObserver' in window)) return;
    observer = new IntersectionObserver(function(entries) {
      entries.forEach(function(entry) {
        var pid = entry.target.dataset.trackView;
        if (!pid) return;
        if (entry.isIntersecting && entry.intersectionRatio >= 0.5) {
          // Attends 800ms pour eviter de compter le scroll-flash
          if (!pendingIds.has(pid)) {
            pendingIds.set(pid, setTimeout(function() {
              window.trackProductView(pid);
              pendingIds.delete(pid);
              // Une fois trackee, on arrete d'observer (economie CPU)
              observer.unobserve(entry.target);
            }, 800));
          }
        } else {
          // Card sortie du viewport avant 800ms → on annule
          if (pendingIds.has(pid)) {
            clearTimeout(pendingIds.get(pid));
            pendingIds.delete(pid);
          }
        }
      });
    }, { threshold: [0, 0.5, 1.0] });
  }

  // API : appelle ca apres avoir injecte des cards dans le DOM
  window.observeProductCards = function(rootEl) {
    _initObserver();
    if (!observer) return;
    var nodes = (rootEl || document).querySelectorAll('[data-track-view]:not([data-tracking])');
    nodes.forEach(function(n) {
      n.dataset.tracking = '1';
      observer.observe(n);
    });
  };

  // Init au prochain frame
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _initObserver);
  } else {
    _initObserver();
  }
})();
