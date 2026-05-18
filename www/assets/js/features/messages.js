// ═══════════════════════════════════════════════════════════════════
//  FEATURES / MESSAGES — Chat Supabase qualité WhatsApp
//  - Realtime cross-device (postgres_changes)
//  - Read receipts ✓✓
//  - Indicateur "en train d'écrire…" (broadcast channel)
//  - Card produit dans le header (si conv liée)
//  - Date séparateurs
//  - Pre-fill intro depuis fiche produit
//  - Liste des convs mise à jour live
// ═══════════════════════════════════════════════════════════════════

  // ── Bandeau "Activer les notifications" ──
  // Affiché sur la page Messages si :
  //  - Le navigateur supporte les push
  //  - L'utilisateur n'a PAS encore donné l'autorisation
  //  - Pas dismissed récemment (cache 3 jours)
  async function _maybeShowPushBanner() {
    if (document.getElementById('push-banner')) return;
    if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
    if (Notification.permission === 'granted') return;     // déjà OK
    var dismissed = parseInt(localStorage.getItem('dj_push_dismissed') || '0', 10);
    if (dismissed && Date.now() < dismissed) return;

    var bar = document.createElement('div');
    bar.id = 'push-banner';
    bar.innerHTML =
      '<div class="pb-inner">' +
        '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 01-3.46 0"/></svg>' +
        '<div class="pb-text"><strong>Active les notifications</strong> pour recevoir tes messages même quand l\'app est fermée.</div>' +
        '<button class="pb-yes" id="pb-yes">Activer</button>' +
        '<button class="pb-close" id="pb-close" aria-label="Fermer">×</button>' +
      '</div>';
    if (!document.getElementById('pb-styles')) {
      var s = document.createElement('style');
      s.id = 'pb-styles';
      s.textContent =
        '#push-banner{background:linear-gradient(135deg,#FFE3D1,#FFD0B5);border-bottom:1px solid rgba(232,80,26,.25);padding:10px 0;animation:pbSlide .3s ease}' +
        '.pb-inner{display:flex;align-items:center;gap:12px;padding:0 16px;max-width:1280px;margin:0 auto}' +
        '#push-banner svg{color:var(--brand,#E8501A);flex-shrink:0}' +
        '.pb-text{flex:1;min-width:0;font-size:.85rem;color:var(--ink,#0F1115);line-height:1.4}' +
        '.pb-yes{flex-shrink:0;background:var(--brand,#E8501A);color:#fff;border:none;padding:8px 16px;border-radius:8px;font-weight:700;font-size:.82rem;cursor:pointer;font-family:inherit}' +
        '.pb-yes:hover{background:#C03E0E}' +
        '.pb-close{flex-shrink:0;background:transparent;border:none;color:var(--ink-3,#5A6273);font-size:22px;cursor:pointer;padding:2px 8px;line-height:1;font-family:inherit}' +
        '@keyframes pbSlide{from{transform:translateY(-100%)}to{transform:translateY(0)}}' +
        '@media(max-width:600px){.pb-text{font-size:.78rem}}';
      document.head.appendChild(s);
    }
    document.body.insertBefore(bar, document.body.firstChild);

    document.getElementById('pb-yes').addEventListener('click', async function() {
      var btn = this;
      btn.disabled = true; btn.textContent = '...';
      try {
        if (window.subscribePush) {
          var ok = await window.subscribePush();
          if (ok) {
            bar.remove();
            window.toast && window.toast('Notifications activées ! Tu seras prévenu quand on t\'écrit.', 'success', 5000);
            return;
          }
        }
        window.toast && window.toast('Tu as refusé les notifications.', 'error');
      } catch(e) {}
      btn.disabled = false; btn.textContent = 'Activer';
    });

    document.getElementById('pb-close').addEventListener('click', function() {
      bar.remove();
      localStorage.setItem('dj_push_dismissed', String(Date.now() + 3 * 24 * 3600 * 1000));
    });
  }

window.onDjamikReady(async function() {
  if (!document.getElementById('conv-list-body')) return;

  // ── Banner "Activer les notifications" si non activées ──
  setTimeout(_maybeShowPushBanner, 800);

  var sb = window._supabase;
  if (!sb) {
    document.getElementById('conv-list-body').innerHTML =
      '<div style="padding:30px 16px;text-align:center;color:var(--ink-3);font-size:.875rem">Service indisponible.</div>';
    return;
  }

  // Auth
  var session;
  try {
    var sRes = await sb.auth.getSession();
    session = sRes && sRes.data && sRes.data.session ? sRes.data.session.user : null;
  } catch(e) {}
  if (!session) {
    document.getElementById('conv-list-body').innerHTML =
      '<div style="padding:30px 16px;text-align:center;color:var(--ink-3);font-size:.875rem">' +
        '<a href="login.html?next=messages.html" style="color:var(--primary)">Connectez-vous</a> pour voir vos messages.' +
      '</div>';
    return;
  }
  var meId = session.id;

  var currentConvId   = null;
  var msgRealtimeSub  = null;
  var convRealtimeSub = null;
  var typingChannel   = null;
  var typingTimeout   = null;
  var lastTypingSent  = 0;

  var cachedConvs = [];      // {id, productId, product, otherUser, last_message, last_message_at, unread, messages:[]}
  var profileCache = {};
  var productCache = {};

  // ────────────────────────────────────────────────────────────
  //  FETCH HELPERS
  // ────────────────────────────────────────────────────────────
  async function _fetchProfiles(ids) {
    var missing = ids.filter(function(id){ return id && !profileCache[id]; });
    if (!missing.length) return;
    try {
      var r = await sb.from('profiles').select('id, full_name, avatar_url').in('id', missing);
      if (r && r.data) r.data.forEach(function(p){ profileCache[p.id] = p; });
    } catch(e) {}
  }

  async function _fetchProducts(ids) {
    var missing = ids.filter(function(id){ return id && !productCache[id]; });
    if (!missing.length) return;
    try {
      var r = await sb.from('products').select('id, title, price, image_url, sold').in('id', missing);
      if (r && r.data) r.data.forEach(function(p){ productCache[p.id] = p; });
    } catch(e) {}
  }

  function _otherUserOf(participants) {
    var otherId = (participants || []).find(function(uid){ return uid !== meId; });
    var p = profileCache[otherId] || {};
    var name = p.full_name || 'Utilisateur';
    var avatar = p.avatar_url ||
      ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=E8501A&color=fff');
    return { id: otherId, name: name, avatar: avatar };
  }

  async function _loadConversations() {
    var r;
    try {
      r = await sb.from('conversations')
        .select('*')
        .contains('participants', [meId])
        .not('deleted_for', 'cs', '{' + meId + '}')
        .order('last_message_at', { ascending: false, nullsFirst: false });
    } catch(e) { r = { data: [] }; }
    var convs = (r && r.data) || [];

    // Pre-fetch profils + produits liés
    var otherIds = []; var productIds = [];
    convs.forEach(function(c) {
      (c.participants || []).forEach(function(uid){
        if (uid !== meId && otherIds.indexOf(uid) === -1) otherIds.push(uid);
      });
      if (c.product_id && productIds.indexOf(c.product_id) === -1) productIds.push(c.product_id);
    });
    await Promise.all([_fetchProfiles(otherIds), _fetchProducts(productIds)]);

    cachedConvs = convs.map(function(c) {
      return {
        id:              c.id,
        productId:       c.product_id,
        product:         c.product_id ? productCache[c.product_id] : null,
        participants:    c.participants,
        otherUser:       _otherUserOf(c.participants),
        last_message:    c.last_message,
        last_message_at: c.last_message_at,
        unread:          0,
        messages:        []
      };
    });
    return cachedConvs;
  }

  async function _refreshUnreadCounts() {
    if (!cachedConvs.length) return;
    try {
      var r = await sb.from('messages')
        .select('conv_id')
        .eq('recipient_id', meId)
        .is('read_at', null);
      var counts = {};
      ((r && r.data) || []).forEach(function(m){ counts[m.conv_id] = (counts[m.conv_id] || 0) + 1; });
      cachedConvs.forEach(function(c){ c.unread = counts[c.id] || 0; });
    } catch(e) {}
  }

  async function _loadMessages(convId) {
    try {
      var r = await sb.from('messages').select('*').eq('conv_id', convId).order('created_at', { ascending: true });
      return (r && r.data) || [];
    } catch(e) { return []; }
  }

  async function _markAsRead(convId) {
    try {
      await sb.from('messages')
        .update({ read_at: new Date().toISOString() })
        .eq('conv_id', convId)
        .eq('recipient_id', meId)
        .is('read_at', null);
    } catch(e) {}
  }

  async function _findOrCreateConv(otherUserId, productId) {
    try {
      var r = await sb.from('conversations').select('*').contains('participants', [meId, otherUserId]);
      var existing = ((r && r.data) || []).find(function(c) {
        return productId ? c.product_id === productId : true;
      });
      if (existing) return existing;
    } catch(e) {}
    var ins = await sb.from('conversations').insert([{
      participants: [meId, otherUserId],
      product_id:   productId || null
    }]).select().single();
    if (ins && ins.data) return ins.data;
    return null;
  }

  // ────────────────────────────────────────────────────────────
  //  RENDER LISTE CONVERSATIONS
  // ────────────────────────────────────────────────────────────
  function _renderConvList() {
    var container = document.getElementById('conv-list-body');
    if (!container) return;

    if (!cachedConvs.length) {
      container.innerHTML =
        '<div style="padding:32px 16px;text-align:center;color:var(--ink-3);font-size:.875rem">' +
          'Aucune conversation<br>' +
          '<a href="index.html" style="color:var(--primary)">Parcourir les annonces</a>' +
        '</div>';
      return;
    }

    container.innerHTML = cachedConvs.map(function(c) {
      var active = c.id === currentConvId ? ' active' : '';
      var name   = window.escHtml(c.otherUser.name);
      var last   = c.last_message ? window.escHtml(c.last_message).slice(0, 42) : 'Démarrer la conversation…';
      var time   = c.last_message_at ? window.relativeDate(c.last_message_at) : '';
      var prodLbl = c.product ? '<div class="conv-product">' + window.escHtml(c.product.title) + '</div>' : '';
      return (
        '<div class="conv-item' + active + '" data-id="' + c.id + '">' +
          '<img class="conv-avatar" src="' + c.otherUser.avatar + '" alt="">' +
          '<div class="conv-info">' +
            '<div class="conv-name">' + name + '</div>' +
            prodLbl +
            '<div class="conv-last">' + last + '</div>' +
          '</div>' +
          '<div class="conv-meta">' +
            (time ? '<div class="conv-time">' + time + '</div>' : '') +
            (c.unread > 0 ? '<span class="conv-badge">' + c.unread + '</span>' : '') +
          '</div>' +
          '<button class="conv-menu-btn" data-id="' + c.id + '" aria-label="Options" title="Options">⋯</button>' +
        '</div>'
      );
    }).join('');

    container.querySelectorAll('.conv-item').forEach(function(el) {
      el.addEventListener('click', function(e) {
        if (e.target.closest('.conv-menu-btn')) return; // ignore clicks on menu
        _openConv(this.dataset.id);
      });
    });
    container.querySelectorAll('.conv-menu-btn').forEach(function(btn) {
      btn.addEventListener('click', function(e) {
        e.stopPropagation();
        _showConvMenu(this);
      });
    });
  }

  // ────────────────────────────────────────────────────────────
  //  MENU CONV (⋯) → Supprimer
  // ────────────────────────────────────────────────────────────
  function _showConvMenu(btn) {
    _closeConvMenu();
    var convId = btn.dataset.id;
    var menu = document.createElement('div');
    menu.className = 'conv-menu-pop';
    menu.innerHTML =
      '<button class="conv-menu-item danger" data-act="delete">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
        '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14H7L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2"/>' +
        '</svg>' +
        '<span>Supprimer la discussion</span>' +
      '</button>';
    document.body.appendChild(menu);

    var rect = btn.getBoundingClientRect();
    var menuW = 220;
    var left = Math.min(rect.right - menuW, window.innerWidth - menuW - 8);
    menu.style.left = Math.max(8, left) + 'px';
    menu.style.top  = (rect.bottom + 4) + 'px';

    menu.querySelector('[data-act="delete"]').addEventListener('click', function() {
      _closeConvMenu();
      _confirmDeleteConv(convId);
    });

    setTimeout(function() {
      document.addEventListener('click', _closeConvMenu, { once: true });
    }, 0);
  }
  function _closeConvMenu() {
    var existing = document.querySelector('.conv-menu-pop');
    if (existing) existing.remove();
  }

  function _confirmDeleteConv(convId) {
    if (!confirm('Supprimer cette discussion ?\n\nElle sera retirée de ta liste. Si la personne te répond, elle réapparaîtra.')) return;
    _deleteConv(convId);
  }

  async function _deleteConv(convId) {
    try {
      // append meId to deleted_for via RPC-style update
      var r = await sb.from('conversations').select('deleted_for').eq('id', convId).single();
      var arr = (r && r.data && r.data.deleted_for) || [];
      if (arr.indexOf(meId) === -1) arr.push(meId);
      await sb.from('conversations').update({ deleted_for: arr }).eq('id', convId);

      // Si on était sur cette conv, on revient à la liste
      if (currentConvId === convId) {
        currentConvId = null;
        var chatActive = document.getElementById('chat-active');
        var chatEmpty  = document.getElementById('chat-empty');
        if (chatActive) chatActive.style.display = 'none';
        if (chatEmpty)  chatEmpty.style.display  = '';
        // Mobile : retour à la liste
        var app = document.querySelector('.msg-app');
        if (app) app.classList.remove('show-chat');
      }

      cachedConvs = cachedConvs.filter(function(c){ return c.id !== convId; });
      _renderConvList();
      if (window.toast) window.toast('Discussion supprimée', 'success');
    } catch(e) {
      console.error('[messages] delete conv failed', e);
      if (window.toast) window.toast('Échec de la suppression', 'error');
    }
  }

  // ────────────────────────────────────────────────────────────
  //  OPEN CONVERSATION
  // ────────────────────────────────────────────────────────────
  async function _openConv(convId) {
    currentConvId = convId;
    var conv = cachedConvs.find(function(c){ return c.id === convId; });
    if (!conv) return;

    // Header
    var nameEl   = document.getElementById('chat-partner-name');
    var avatarEl = document.getElementById('chat-partner-avatar');
    var profBtn  = document.getElementById('btn-view-profile');
    if (nameEl)   nameEl.textContent = conv.otherUser.name;
    if (avatarEl) avatarEl.src       = conv.otherUser.avatar;
    if (profBtn)  profBtn.href       = 'my-profile.html?id=' + conv.otherUser.id;

    // Mobile : passe en mode chat (cache la liste)
    var msgApp = document.getElementById('msg-app');
    if (msgApp) msgApp.classList.add('show-chat');

    // Show chat pane
    document.getElementById('chat-empty').classList.add('hidden');
    var activeEl = document.getElementById('chat-active');
    if (activeEl) { activeEl.classList.remove('hidden'); activeEl.style.display = 'flex'; }

    // ── Card produit dans le header (si conv liée à un produit) ──
    _renderProductBanner(conv);

    // Skeleton
    document.getElementById('chat-messages').innerHTML =
      '<div style="text-align:center;color:var(--ink-3);padding:20px">Chargement…</div>';

    conv.messages = await _loadMessages(convId);
    _renderMessages(conv.messages);

    // Mark as read + refresh badges
    await _markAsRead(convId);
    conv.unread = 0;
    _renderConvList();
    if (window.refreshMessagesBadge) window.refreshMessagesBadge();

    // Subscribe realtime + typing
    _subscribeMessageRealtime(convId);
    _subscribeTypingChannel(convId);

    // Focus input
    var inp = document.getElementById('chat-input-text');
    if (inp) setTimeout(function(){ inp.focus(); }, 80);
  }

  // ────────────────────────────────────────────────────────────
  //  PRODUCT BANNER (carte cliquable au-dessus du chat)
  // ────────────────────────────────────────────────────────────
  function _renderProductBanner(conv) {
    var existing = document.getElementById('chat-product-banner');
    if (existing) existing.remove();
    if (!conv.product) return;
    var p = conv.product;
    var img = p.image_url || ('https://ui-avatars.com/api/?name=' + encodeURIComponent(p.title || 'P') + '&background=64748b&color=fff');
    var banner = document.createElement('a');
    banner.id = 'chat-product-banner';
    banner.className = 'chat-product-banner';
    banner.href = 'product-details.html?id=' + p.id;
    banner.innerHTML =
      '<img src="' + img + '" alt="">' +
      '<div class="cpb-info">' +
        '<div class="cpb-title">' + window.escHtml(p.title || '') + (p.sold ? ' · <span style="color:var(--danger,#ef4444)">Vendu</span>' : '') + '</div>' +
        '<div class="cpb-price">' + window.formatPrice(p.price) + '</div>' +
      '</div>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><polyline points="9 18 15 12 9 6"/></svg>';

    var msgEl = document.getElementById('chat-messages');
    msgEl.parentNode.insertBefore(banner, msgEl);
  }

  // ────────────────────────────────────────────────────────────
  //  RENDER MESSAGES + DATE SEPARATORS
  // ────────────────────────────────────────────────────────────
  function _renderMessages(messages) {
    var container = document.getElementById('chat-messages');
    if (!container) return;

    if (!messages || !messages.length) {
      container.innerHTML =
        '<div style="text-align:center;color:var(--ink-3);font-size:.8rem;padding:24px">Envoyez un message pour démarrer</div>';
      return;
    }

    var html = '';
    var lastDateKey = null;
    messages.forEach(function(m) {
      var dateKey = _dateKey(m.created_at);
      if (dateKey !== lastDateKey) {
        html += '<div class="msg-date-sep"><span>' + _dateLabel(m.created_at) + '</span></div>';
        lastDateKey = dateKey;
      }
      var mine = m.sender_id === meId;
      var t    = _shortTime(m.created_at);
      var tick = '';
      if (mine) {
        tick = m.read_at
          ? '<svg class="msg-tick read" viewBox="0 0 24 16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="2 8 7 13 16 4"/><polyline points="9 13 14 8"/></svg>'
          : '<svg class="msg-tick" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="2 8 7 13 14 4"/></svg>';
      }

      // Bulle : image OU texte
      var bubbleContent;
      if (m.image_url) {
        var caption = m.text ? '<div class="msg-caption">' + window.escHtml(m.text) + '</div>' : '';
        bubbleContent = '<div class="msg-bubble msg-bubble-img">' +
          '<img src="' + m.image_url + '" alt="" loading="lazy" onclick="window.open(this.src,\'_blank\')">' +
          caption +
        '</div>';
      } else {
        bubbleContent = '<div class="msg-bubble">' + window.escHtml(m.text) + '</div>';
      }

      html +=
        '<div class="msg-row ' + (mine ? 'mine' : 'theirs') + '" data-id="' + m.id + '">' +
          bubbleContent +
          '<div class="msg-time">' + t + (mine ? ' ' + tick : '') + '</div>' +
        '</div>';
    });
    // Conserve la position si l'user a scrollé vers le haut (lecture des anciens msgs)
    var wasNearBottom = (container.scrollHeight - container.scrollTop - container.clientHeight) < 80;
    container.innerHTML = html;
    if (wasNearBottom) {
      // Double rAF : assure que le layout est calculé après le innerHTML
      requestAnimationFrame(function() {
        requestAnimationFrame(function() {
          container.scrollTop = container.scrollHeight;
        });
      });
    } else {
      // L'user lit les anciens msgs : on affiche un bouton "↓ Nouveau"
      _showNewMessageButton(container);
    }
  }

  function _showNewMessageButton(container) {
    if (document.getElementById('msg-new-btn')) return;
    var btn = document.createElement('button');
    btn.id = 'msg-new-btn';
    btn.className = 'msg-new-btn';
    btn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" width="14" height="14"><polyline points="6 9 12 15 18 9"/></svg> Nouveau message';
    btn.addEventListener('click', function() {
      container.scrollTop = container.scrollHeight;
      btn.remove();
    });
    container.parentNode.appendChild(btn);
    // Auto-remove quand l'user scroll en bas manuellement
    function _onScroll() {
      if ((container.scrollHeight - container.scrollTop - container.clientHeight) < 40) {
        btn.remove();
        container.removeEventListener('scroll', _onScroll);
      }
    }
    container.addEventListener('scroll', _onScroll);
  }

  function _dateKey(iso) { return new Date(iso).toISOString().slice(0, 10); }
  function _dateLabel(iso) {
    var d = new Date(iso);
    var today = new Date();
    var diff = Math.floor((today.setHours(0,0,0,0) - new Date(d).setHours(0,0,0,0)) / 86400000);
    if (diff === 0) return 'Aujourd\'hui';
    if (diff === 1) return 'Hier';
    if (diff < 7)   return d.toLocaleDateString('fr-FR', { weekday: 'long' });
    return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: today.getFullYear() !== d.getFullYear() ? 'numeric' : undefined });
  }
  function _shortTime(iso) {
    return new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }

  // ────────────────────────────────────────────────────────────
  //  SEND MESSAGE
  // ────────────────────────────────────────────────────────────
  var sendForm = document.getElementById('chat-send-form');
  if (sendForm) {
    sendForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      if (!currentConvId) return;
      var inp  = document.getElementById('chat-input-text');
      var text = inp ? inp.value.trim() : '';
      if (!text) return;

      var conv = cachedConvs.find(function(c){ return c.id === currentConvId; });
      if (!conv) return;
      var recipient = conv.participants.find(function(uid){ return uid !== meId; });

      // Optimistic UI
      var optimistic = {
        id: 'tmp-' + Date.now(), conv_id: currentConvId,
        sender_id: meId, recipient_id: recipient,
        text: text, read_at: null, created_at: new Date().toISOString()
      };
      conv.messages.push(optimistic);
      conv.last_message    = text;
      conv.last_message_at = optimistic.created_at;
      _renderMessages(conv.messages);
      _renderConvList();
      if (inp) inp.value = '';

      try {
        var ins = await sb.from('messages').insert([{
          conv_id:      currentConvId,
          sender_id:    meId,
          recipient_id: recipient,
          text:         text
        }]).select().single();

        // Supabase ne throw pas : check explicite de l'erreur
        if (ins && ins.error) {
          var msg = (ins.error.message || '').toLowerCase();
          var friendly = ins.error.message || 'Envoi échoué';
          if (msg.indexOf('compte suspendu') !== -1) friendly = 'Ton compte est suspendu.';
          else if (msg.indexOf('non disponible') !== -1) friendly = 'Ce destinataire n\'est plus joignable.';
          else if (msg.indexOf('100 max') !== -1 || msg.indexOf('rate') !== -1) friendly = 'Trop de messages envoyés cette heure. Réessaye plus tard.';
          else if (msg.indexOf('verifiez') !== -1 || msg.indexOf('vérifiez') !== -1 || msg.indexOf('email') !== -1) friendly = 'Vérifie ton email avant d\'envoyer des messages.';
          window.toast && window.toast(friendly, 'error', 5000);
          // Retire le message optimiste + restaure le texte
          conv.messages = conv.messages.filter(function(m){ return m.id !== optimistic.id; });
          _renderMessages(conv.messages);
          if (inp) inp.value = text;
          return;
        }

        if (ins && ins.data) {
          var idx = conv.messages.findIndex(function(m){ return m.id === optimistic.id; });
          if (idx !== -1) conv.messages[idx] = ins.data;
          _renderMessages(conv.messages);
        }

        // Push notification au destinataire (fire & forget)
        try {
          var senderProfile = profileCache[meId];
          var senderName = (senderProfile && senderProfile.full_name) || (session && session.email) || 'Quelqu\'un';
          var senderAvatar = (senderProfile && senderProfile.avatar_url) ||
            ('https://ui-avatars.com/api/?name=' + encodeURIComponent(senderName) + '&background=E8501A&color=fff');
          fetch(window.APP.pushEndpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_id: recipient,
              payload: {
                title: senderName,
                body:  text.slice(0, 120),
                url:   '/pages/messages.html',
                icon:  senderAvatar,
                tag:   'msg-' + currentConvId
              }
            })
          }).catch(function(){});
        } catch(_) {}

        // Crée aussi une notification in-app
        try {
          await sb.from('notifications').insert([{
            user_id: recipient,
            type:    'message',
            title:   'Nouveau message',
            body:    (profileCache[meId] && profileCache[meId].full_name || 'Quelqu\'un') + ' : ' + text.slice(0, 100),
            data:    { conv_id: currentConvId }
          }]);
        } catch(_) {}
      } catch(err) {
        window.toast && window.toast('Envoi échoué : ' + (err.message || 'erreur réseau'), 'error', 5000);
        // Restaure le texte + retire l'optimistic
        conv.messages = conv.messages.filter(function(m){ return m.id !== optimistic.id; });
        _renderMessages(conv.messages);
        if (inp) inp.value = text;
      }
    });

    // Typing indicator (broadcast léger, pas en DB)
    var inpEl = document.getElementById('chat-input-text');
    if (inpEl) {
      inpEl.addEventListener('input', function() {
        if (!currentConvId || !typingChannel) return;
        var now = Date.now();
        if (now - lastTypingSent > 2000) {
          lastTypingSent = now;
          try { typingChannel.send({ type: 'broadcast', event: 'typing', payload: { user: meId } }); } catch(e) {}
        }
      });
    }
  }

  // ────────────────────────────────────────────────────────────
  //  REALTIME : nouveaux messages dans la conv ouverte
  // ────────────────────────────────────────────────────────────
  function _subscribeMessageRealtime(convId) {
    if (msgRealtimeSub) { try { msgRealtimeSub.unsubscribe(); } catch(e) {} msgRealtimeSub = null; }
    msgRealtimeSub = sb.channel('msg:' + convId)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'messages',
        filter: 'conv_id=eq.' + convId
      }, function(payload) {
        var conv = cachedConvs.find(function(c){ return c.id === convId; });
        if (!conv) return;

        if (payload.eventType === 'INSERT') {
          var m = payload.new;
          if (!m || m.sender_id === meId) return;
          if (conv.messages.find(function(x){ return x.id === m.id; })) return;
          conv.messages.push(m);
          conv.last_message    = m.text;
          conv.last_message_at = m.created_at;
          _renderMessages(conv.messages);
          _renderConvList();
          if (currentConvId === convId) _markAsRead(convId);
        }
        else if (payload.eventType === 'UPDATE') {
          // Le destinataire a lu mon message → met à jour les ✓✓
          var u = payload.new;
          if (!u) return;
          var idx = conv.messages.findIndex(function(x){ return x.id === u.id; });
          if (idx !== -1) {
            conv.messages[idx] = u;
            _renderMessages(conv.messages);
          }
        }
      })
      .subscribe();
  }

  // ────────────────────────────────────────────────────────────
  //  REALTIME GLOBAL : nouvelles convs / nouveaux msg dans toutes les convs
  // ────────────────────────────────────────────────────────────
  function _subscribeAllConversationsRealtime() {
    if (convRealtimeSub) return;
    convRealtimeSub = sb.channel('user-msgs:' + meId)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: 'recipient_id=eq.' + meId
      }, async function(payload) {
        var m = payload.new;
        if (!m) return;
        var conv = cachedConvs.find(function(c){ return c.id === m.conv_id; });
        if (conv) {
          conv.last_message    = m.text;
          conv.last_message_at = m.created_at;
          if (currentConvId !== m.conv_id) conv.unread = (conv.unread || 0) + 1;
          // Re-trie : la conv passe en haut
          cachedConvs.sort(function(a,b){ return new Date(b.last_message_at||0) - new Date(a.last_message_at||0); });
          _renderConvList();
        } else {
          // Nouvelle conv : reload tout
          await _loadConversations();
          await _refreshUnreadCounts();
          _renderConvList();
        }
      })
      .subscribe();
  }

  // ────────────────────────────────────────────────────────────
  //  TYPING INDICATOR (broadcast Supabase Realtime)
  // ────────────────────────────────────────────────────────────
  function _subscribeTypingChannel(convId) {
    if (typingChannel) { try { typingChannel.unsubscribe(); } catch(e) {} typingChannel = null; }
    typingChannel = sb.channel('typing:' + convId, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'typing' }, function(payload) {
        if (!payload || !payload.payload || payload.payload.user === meId) return;
        _showTyping();
      })
      .subscribe();
  }

  function _showTyping() {
    var el = document.getElementById('typing-indicator');
    if (!el) {
      var msgEl = document.getElementById('chat-messages');
      el = document.createElement('div');
      el.id = 'typing-indicator';
      el.className = 'typing-row';
      el.innerHTML = '<div class="typing-dots"><span></span><span></span><span></span></div>';
      msgEl.appendChild(el);
      msgEl.scrollTop = msgEl.scrollHeight;
    }
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(function() {
      var t = document.getElementById('typing-indicator');
      if (t) t.remove();
    }, 3000);
  }

  // ────────────────────────────────────────────────────────────
  //  EMOJI PICKER
  // ────────────────────────────────────────────────────────────
  var EMOJIS = [
    // Smileys
    '😀','😃','😄','😁','😆','😅','🤣','😂','🙂','🙃','😉','😊','😇','🥰','😍','🤩','😘','😗','☺️','😚',
    '😙','🥲','😋','😛','😜','🤪','😝','🤑','🤗','🤭','🤫','🤔','🤐','🤨','😐','😑','😶','😏','😒','🙄',
    '😬','🤥','😌','😔','😪','🤤','😴','😷','🤒','🤕','🤢','🤮','🥵','🥶','🥴','😵','🤯','🤠','🥳','🥸',
    // Hand / People
    '👍','👎','👏','🙏','🤝','💪','✌️','🤞','🤟','🤘','🫶','👌','🤌','✊','👊',
    // Objects / Symbols
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','💔','💕','💖','💗','💘','💝','💯','🔥','✨','⭐','🎉','🎁',
    '✅','❌','⚠️','❓','❗','💸','💰','💳','📦','🚚','🛒','📱','💻','📷','🔑','🏠','🏪',
    // Nature / Food
    '🌍','☀️','🌙','⛅','🌧️','🍔','🍕','🍞','🥖','🍗','🥩','🍳','🍎','🍌','☕','🥤'
  ];

  var emojiPanelOpen = false;
  function _toggleEmojiPanel() {
    var existing = document.getElementById('emoji-panel');
    if (existing) {
      existing.remove();
      emojiPanelOpen = false;
      return;
    }
    var inputBar = document.getElementById('chat-send-form');
    if (!inputBar) return;
    var panel = document.createElement('div');
    panel.id = 'emoji-panel';
    panel.className = 'emoji-panel';
    panel.innerHTML = EMOJIS.map(function(e) {
      return '<button type="button" class="emoji-btn">' + e + '</button>';
    }).join('');
    panel.querySelectorAll('.emoji-btn').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var ta = document.getElementById('chat-input-text');
        if (!ta) return;
        var pos = ta.selectionStart || ta.value.length;
        ta.value = ta.value.slice(0, pos) + this.textContent + ta.value.slice(pos);
        ta.dispatchEvent(new Event('input'));
        ta.focus();
        var newPos = pos + this.textContent.length;
        ta.setSelectionRange(newPos, newPos);
      });
    });
    inputBar.parentNode.insertBefore(panel, inputBar);
    emojiPanelOpen = true;
  }

  // Ferme le panel si on clique ailleurs
  document.addEventListener('click', function(e) {
    if (!emojiPanelOpen) return;
    var panel = document.getElementById('emoji-panel');
    if (!panel) return;
    var emojiBtn = document.getElementById('btn-emoji');
    if (panel.contains(e.target) || (emojiBtn && emojiBtn.contains(e.target))) return;
    panel.remove();
    emojiPanelOpen = false;
  });

  var emojiBtn = document.getElementById('btn-emoji');
  if (emojiBtn) emojiBtn.addEventListener('click', function(e) {
    e.stopPropagation();
    _toggleEmojiPanel();
  });

  // ────────────────────────────────────────────────────────────
  //  IMAGE ATTACHMENT
  // ────────────────────────────────────────────────────────────
  var attachBtn = document.getElementById('btn-attach');
  if (attachBtn) {
    // Crée un input file caché
    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    document.body.appendChild(fileInput);

    attachBtn.addEventListener('click', function() { fileInput.click(); });

    fileInput.addEventListener('change', async function() {
      var file = this.files && this.files[0];
      this.value = '';
      if (!file) return;
      if (!file.type.startsWith('image/')) {
        window.toast && window.toast('Format non supporté.', 'error');
        return;
      }
      if (file.size > 5 * 1024 * 1024) {
        window.toast && window.toast('Image trop lourde (max 5 Mo).', 'error');
        return;
      }
      if (!currentConvId) {
        window.toast && window.toast('Ouvrez une conversation d\'abord.', 'info');
        return;
      }

      // Upload
      window.toast && window.toast('Envoi de l\'image…', 'info', 2000);
      var ext = (file.name.split('.').pop() || 'jpg').toLowerCase();
      if (['jpg','jpeg','png','webp','gif'].indexOf(ext) === -1) ext = 'jpg';
      var path = meId + '/' + currentConvId + '_' + Date.now() + '.' + ext;
      var imageUrl = null;
      try {
        var up = await sb.storage.from('chat-images').upload(path, file, { upsert: false, cacheControl: '3600' });
        if (up && !up.error) {
          var pub = sb.storage.from('chat-images').getPublicUrl(path);
          imageUrl = pub && pub.data && pub.data.publicUrl;
        } else if (up && up.error) {
          window.toast && window.toast('Upload échoué : ' + up.error.message, 'error', 5000);
          return;
        }
      } catch(e) {
        window.toast && window.toast('Upload échoué.', 'error');
        return;
      }
      if (!imageUrl) return;

      // Insert message avec image
      var conv = cachedConvs.find(function(c){ return c.id === currentConvId; });
      if (!conv) return;
      var recipient = conv.participants.find(function(uid){ return uid !== meId; });
      var caption = (document.getElementById('chat-input-text') || {}).value || '';

      // Optimistic
      var optimistic = {
        id: 'tmp-' + Date.now(), conv_id: currentConvId,
        sender_id: meId, recipient_id: recipient,
        text: caption, image_url: imageUrl, read_at: null,
        created_at: new Date().toISOString()
      };
      conv.messages.push(optimistic);
      conv.last_message    = caption || '📷 Photo';
      conv.last_message_at = optimistic.created_at;
      _renderMessages(conv.messages);
      _renderConvList();
      var ta = document.getElementById('chat-input-text');
      if (ta) { ta.value = ''; ta.dispatchEvent(new Event('input')); }

      try {
        var ins = await sb.from('messages').insert([{
          conv_id: currentConvId, sender_id: meId, recipient_id: recipient,
          text: caption, image_url: imageUrl
        }]).select().single();
        if (ins && ins.data) {
          var idx = conv.messages.findIndex(function(m){ return m.id === optimistic.id; });
          if (idx !== -1) conv.messages[idx] = ins.data;
          _renderMessages(conv.messages);
        }
      } catch(err) {
        window.toast && window.toast('Envoi échoué', 'error');
      }
    });
  }

  // ────────────────────────────────────────────────────────────
  //  BACK BUTTON (mobile) + auto-resize textarea + send btn state
  // ────────────────────────────────────────────────────────────
  var backBtn = document.getElementById('msg-back-btn');
  if (backBtn) backBtn.addEventListener('click', function() {
    currentConvId = null;
    var msgApp = document.getElementById('msg-app');
    if (msgApp) msgApp.classList.remove('show-chat');
    if (msgRealtimeSub) { try { msgRealtimeSub.unsubscribe(); } catch(e) {} msgRealtimeSub = null; }
  });

  var ta = document.getElementById('chat-input-text');
  var sendBtn = document.getElementById('btn-send');
  if (ta) {
    function updateSendState() {
      var hasText = ta.value.trim().length > 0;
      if (sendBtn) sendBtn.disabled = !hasText;
      // Auto-resize
      ta.style.height = 'auto';
      ta.style.height = Math.min(ta.scrollHeight, 100) + 'px';
    }
    ta.addEventListener('input', updateSendState);
    // Enter pour envoyer (Shift+Enter pour ligne)
    ta.addEventListener('keydown', function(e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (ta.value.trim()) document.getElementById('chat-send-form').requestSubmit();
      }
    });
    updateSendState();
    // Update après chaque envoi (input vidé)
    var origSubmit = document.getElementById('chat-send-form');
    if (origSubmit) origSubmit.addEventListener('submit', function() {
      setTimeout(updateSendState, 50);
    });
  }

  // ────────────────────────────────────────────────────────────
  //  SEARCH FILTER
  // ────────────────────────────────────────────────────────────
  var searchInput = document.querySelector('.msg-search-wrap input');
  if (searchInput) {
    searchInput.addEventListener('input', function() {
      var q = this.value.toLowerCase();
      document.querySelectorAll('.conv-item').forEach(function(el) {
        var name = (el.querySelector('.conv-name') || {}).textContent || '';
        var last = (el.querySelector('.conv-last') || {}).textContent || '';
        var prod = (el.querySelector('.conv-product') || {}).textContent || '';
        el.style.display = (!q || name.toLowerCase().includes(q) || last.toLowerCase().includes(q) || prod.toLowerCase().includes(q)) ? '' : 'none';
      });
    });
  }

  // ────────────────────────────────────────────────────────────
  //  URL PARAMS : démarrer une conv depuis fiche produit
  // ────────────────────────────────────────────────────────────
  async function _handleUrlParams() {
    var params = new URLSearchParams(window.location.search);
    var sellerId = params.get('seller');
    if (!sellerId) return;
    var productId = params.get('product') || null;
    var conv = await _findOrCreateConv(sellerId, productId);
    if (!conv) return;

    // Pre-fill un message d'intro contextualisé si c'est une nouvelle conv et un produit
    var sendInpEl = document.getElementById('chat-input-text');
    var hadMessages = false;
    try {
      var msgs = await _loadMessages(conv.id);
      hadMessages = msgs.length > 0;
    } catch(e) {}

    await _loadConversations();
    await _refreshUnreadCounts();
    _renderConvList();
    await _openConv(conv.id);

    if (!hadMessages && productId && sendInpEl) {
      var prodTitle = (productCache[productId] && productCache[productId].title) || params.get('product_title') || 'votre annonce';
      sendInpEl.value = 'Bonjour, votre annonce « ' + prodTitle + ' » est-elle toujours disponible ?';
      sendInpEl.focus();
    }
  }

  // ────────────────────────────────────────────────────────────
  //  STYLES
  // ────────────────────────────────────────────────────────────
  if (!document.getElementById('msg-styles')) {
    var s = document.createElement('style');
    s.id = 'msg-styles';
    s.textContent = [
      '.conv-item{display:flex;align-items:center;gap:12px;padding:12px 16px;cursor:pointer;border-bottom:1px solid var(--surface-2);transition:background .15s}',
      '.conv-item:hover,.conv-item.active{background:var(--surface-2)}',
      '.conv-item .conv-avatar{width:48px;height:48px;border-radius:50%;object-fit:cover;flex-shrink:0;background:var(--surface-3)}',
      '.conv-info{flex:1;min-width:0}',
      '.conv-name{font-weight:600;font-size:.9rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.conv-product{font-size:.7rem;color:var(--primary,#E8501A);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:1px}',
      '.conv-last{font-size:.78rem;color:var(--ink-3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:2px}',
      '.conv-meta{display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0}',
      '.conv-time{font-size:.7rem;color:var(--ink-3)}',
      '.conv-badge{background:var(--primary);color:#fff;border-radius:50%;width:18px;height:18px;font-size:.7rem;display:flex;align-items:center;justify-content:center;font-weight:700}',

      // Bouton ⋯ + menu popup
      '.conv-item{position:relative}',
      '.conv-menu-btn{position:absolute;top:6px;right:6px;width:30px;height:30px;border:none;background:transparent;color:var(--ink-3);font-size:1.4rem;font-weight:700;line-height:1;border-radius:50%;cursor:pointer;opacity:.7;transition:opacity .15s,background .15s,color .15s;font-family:inherit;padding:0;display:flex;align-items:center;justify-content:center;z-index:2}',
      '.conv-item:hover .conv-menu-btn{opacity:1}',
      '.conv-menu-btn:hover{background:var(--surface-3);color:var(--ink)}',
      '.conv-meta{padding-right:30px}',
      '.conv-menu-pop{position:fixed;width:220px;background:var(--white);border:1px solid var(--surface-3);border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.15);padding:6px;z-index:1000;animation:convMenuPop .15s ease}',
      '@keyframes convMenuPop{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}',
      '.conv-menu-item{width:100%;display:flex;align-items:center;gap:10px;padding:10px 12px;background:transparent;border:none;cursor:pointer;border-radius:8px;font-family:inherit;font-size:.88rem;color:var(--ink);text-align:left;transition:background .12s}',
      '.conv-menu-item:hover{background:var(--surface-2)}',
      '.conv-menu-item.danger{color:var(--danger,#ef4444)}',
      '.conv-menu-item.danger:hover{background:#fef2f2}',


      // Product banner
      '.chat-product-banner{display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--surface-2);border-bottom:1px solid var(--surface-3);text-decoration:none;color:var(--ink);transition:background .15s}',
      '.chat-product-banner:hover{background:var(--surface-3)}',
      '.chat-product-banner img{width:40px;height:40px;border-radius:var(--r-md);object-fit:cover;flex-shrink:0;background:var(--surface-3)}',
      '.cpb-info{flex:1;min-width:0}',
      '.cpb-title{font-weight:600;font-size:.85rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.cpb-price{font-size:.78rem;color:var(--primary,#E8501A);font-weight:700;margin-top:1px}',

      // Date separator
      '.msg-date-sep{text-align:center;margin:14px 0 8px;font-size:.72rem;color:var(--ink-3);position:relative}',
      '.msg-date-sep span{background:var(--surface);padding:0 10px;font-weight:600;text-transform:uppercase;letter-spacing:.04em}',

      // Bubbles
      '.msg-row{display:flex;flex-direction:column;margin:4px 0}',
      '.msg-row.mine{align-items:flex-end}',
      '.msg-row.theirs{align-items:flex-start}',
      '.msg-bubble{max-width:72%;padding:9px 13px;border-radius:18px;font-size:.875rem;line-height:1.4;word-break:break-word}',
      '.msg-row.mine .msg-bubble{background:#E8501A !important;color:#fff !important;border-bottom-right-radius:4px}',
      '.msg-row.theirs .msg-bubble{background:var(--surface-2);color:var(--ink);border-bottom-left-radius:4px;border:1px solid var(--surface-3)}',
      // Bouton "Nouveau message" qui apparaît si user a scrollé vers le haut
      '.msg-new-btn{position:absolute;left:50%;bottom:80px;transform:translateX(-50%);background:var(--primary,#E8501A);color:#fff;border:none;border-radius:999px;padding:8px 16px;font-size:.78rem;font-weight:700;font-family:inherit;cursor:pointer;display:inline-flex;align-items:center;gap:6px;box-shadow:0 6px 16px rgba(232,80,26,.4);animation:newmsgPop .25s ease;z-index:10}',
      '@keyframes newmsgPop{from{opacity:0;transform:translateX(-50%) translateY(10px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}',
      // Le parent du msg-scroll doit être position:relative pour le bouton flottant
      '#chat-active{position:relative}',

      // Bulle image
      '.msg-bubble-img{padding:3px !important;background:transparent !important;border:none !important;max-width:240px}',
      '.msg-bubble-img img{display:block;width:100%;height:auto;max-height:300px;object-fit:cover;border-radius:14px;cursor:zoom-in;background:var(--surface-2)}',
      '.msg-bubble-img .msg-caption{padding:6px 10px 4px;font-size:.85rem;color:var(--ink);word-break:break-word}',
      '.msg-row.mine .msg-bubble-img .msg-caption{color:var(--ink)}',

      // Emoji panel
      '.emoji-panel{position:absolute;left:8px;right:8px;bottom:60px;max-height:240px;overflow-y:auto;background:var(--white);border:1px solid var(--surface-3);border-radius:12px;padding:8px;box-shadow:0 -4px 16px rgba(0,0,0,.12);display:grid;grid-template-columns:repeat(auto-fill,minmax(36px,1fr));gap:2px;z-index:100;animation:emojiPanelSlide .2s ease}',
      '@keyframes emojiPanelSlide{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}',
      '.emoji-btn{font-size:1.3rem;padding:6px;background:transparent;border:none;cursor:pointer;border-radius:8px;line-height:1;transition:background .12s}',
      '.emoji-btn:hover,.emoji-btn:active{background:var(--surface-2)}',
      '.msg-time{font-size:.65rem;color:var(--ink-3);margin-top:2px;padding:0 4px;display:flex;align-items:center;gap:3px}',
      '.msg-tick{width:14px;height:10px;color:var(--ink-3);stroke-linecap:round;stroke-linejoin:round}',
      '.msg-tick.read{color:#3b82f6}',

      // Typing indicator
      '.typing-row{display:flex;justify-content:flex-start;margin:6px 0}',
      '.typing-dots{background:var(--surface-2);border-radius:18px;border-bottom-left-radius:4px;padding:10px 14px;display:flex;gap:4px}',
      '.typing-dots span{width:6px;height:6px;border-radius:50%;background:var(--ink-3);animation:typing-bounce 1.2s infinite ease-in-out}',
      '.typing-dots span:nth-child(2){animation-delay:.15s}',
      '.typing-dots span:nth-child(3){animation-delay:.3s}',
      '@keyframes typing-bounce{0%,60%,100%{transform:translateY(0);opacity:.5}30%{transform:translateY(-4px);opacity:1}}',
    ].join('');
    document.head.appendChild(s);
  }

  // ────────────────────────────────────────────────────────────
  //  INIT
  // ────────────────────────────────────────────────────────────
  await _fetchProfiles([meId]);   // pré-charge mon propre profil pour les notifs
  await _loadConversations();
  await _refreshUnreadCounts();
  _renderConvList();
  _subscribeAllConversationsRealtime();
  await _handleUrlParams();
});
