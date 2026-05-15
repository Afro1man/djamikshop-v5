// ═══════════════════════════════════════════════════════════════════
//  FEATURES / MY-PROFILE — Profil utilisateur (self ou public)
//  ?id=X → vue publique du vendeur X (lecture seule, bouton Contacter)
//  pas de id  → mon propre profil (édition, gestion annonces, déconnexion)
// ═══════════════════════════════════════════════════════════════════

window.onDjamikReady(function() {
  var root = document.getElementById('profile-root');
  if (!root) return;

  var params      = new URLSearchParams(location.search);
  var requestedId = params.get('id');

  _resolveCurrentUser().then(function(currentUser) {
    var myId = currentUser ? (currentUser.id || currentUser.sub) : null;

    // Mode SELF : pas d'id en URL OU id == moi
    if (!requestedId || requestedId === myId) {
      if (!currentUser) return _renderGuestState();
      return _renderSelf(currentUser);
    }

    // Mode PUBLIC : on regarde quelqu'un d'autre
    return _renderPublic(requestedId, currentUser);
  });

  // ────────────────────────────────────────────────────────────
  //  RESOLVE CURRENT USER
  // ────────────────────────────────────────────────────────────
  async function _resolveCurrentUser() {
    if (window._supabase) {
      try {
        var res = await window._supabase.auth.getSession();
        if (res && res.data && res.data.session && res.data.session.user) {
          var u = res.data.session.user;
          var prof = {};
          try { prof = await window._supabase.from('profiles').select('*').eq('id', u.id).single(); } catch(e) {}
          return Object.assign({}, u, (prof && prof.data) || {});
        }
      } catch(e) {}
    }
    try {
      var raw = localStorage.getItem('dj_demo_session');
      if (raw) {
        var sess = JSON.parse(raw);
        if (sess && (!sess.expires_at || new Date(sess.expires_at) > new Date())) return sess;
      }
    } catch(e) {}
    return null;
  }

  // ────────────────────────────────────────────────────────────
  //  GUEST STATE — visiteur non connecté qui consulte son propre profil
  // ────────────────────────────────────────────────────────────
  function _renderGuestState() {
    _injectStyles();
    root.innerHTML =
      '<div class="empty-state">' +
        '<div class="empty-icon">' + _icon('user') + '</div>' +
        '<h3>Connectez-vous pour voir votre profil</h3>' +
        '<p>Accédez à vos annonces, vos commandes et vos paramètres.</p>' +
        '<a href="login.html?next=my-profile.html" class="btn btn-primary mt-4">Se connecter</a>' +
      '</div>';
  }

  // ────────────────────────────────────────────────────────────
  //  PUBLIC PROFILE — un autre vendeur
  // ────────────────────────────────────────────────────────────
  async function _renderPublic(sellerId, viewer) {
    _injectStyles();
    _showSkeleton();

    // Récupère le profil + ses annonces en parallèle
    var profilePromise   = _fetchProfile(sellerId);
    var productsPromise  = _fetchProducts(sellerId);

    var profile  = await profilePromise;
    var products = await productsPromise;

    if (!profile) {
      root.innerHTML =
        '<div class="empty-state">' +
          '<div class="empty-icon">' + _icon('user') + '</div>' +
          '<h3>Vendeur introuvable</h3>' +
          '<p>Ce profil n\'existe pas ou n\'est plus disponible.</p>' +
          '<a href="index.html" class="btn btn-primary mt-4">Parcourir les annonces</a>' +
        '</div>';
      return;
    }

    var active     = products.filter(function(p){ return !p.sold; });
    var sold       = products.filter(function(p){ return p.sold; });
    var totalViews = active.reduce(function(s, p){ return s + (window.getViews ? window.getViews(p.id) : 0); }, 0);

    root.innerHTML =
      _profileCardHtml(profile, { editable: false, viewerId: viewer && (viewer.id || viewer.sub) }) +
      _statsHtml(active.length, sold.length, totalViews) +
      _tabsHtml(active.length, sold.length) +
      '<div id="profile-listings"></div>';

    _renderListings(active, false);
    _wirePublicEvents(profile, active, sold);
  }

  // ────────────────────────────────────────────────────────────
  //  SELF PROFILE — moi
  // ────────────────────────────────────────────────────────────
  async function _renderSelf(user) {
    _injectStyles();
    _showSkeleton();

    var products = await _fetchProducts(user.id || user.sub);
    var active     = products.filter(function(p){ return !p.sold; });
    var sold       = products.filter(function(p){ return p.sold; });
    var totalViews = active.reduce(function(s, p){ return s + (window.getViews ? window.getViews(p.id) : 0); }, 0);

    root.innerHTML =
      _profileCardHtml(user, { editable: true }) +
      _statsHtml(active.length, sold.length, totalViews) +
      _tabsHtml(active.length, sold.length) +
      '<div id="profile-listings"></div>';

    _renderListings(active, true);
    _wireSelfEvents(user, products, active, sold);
  }

  // ────────────────────────────────────────────────────────────
  //  HTML BUILDERS
  // ────────────────────────────────────────────────────────────
  function _profileCardHtml(p, opts) {
    var name     = p.full_name || p.email || 'Vendeur';
    var email    = p.email || '';
    var phone    = p.phone || '';
    var city     = p.location || '';
    var bio      = p.bio || '';
    var avatar   = p.avatar_url ||
      ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name) + '&background=E8501A&color=fff&size=160&bold=true');
    var verified = window.isVerified ? window.isVerified(p) : !!(phone && phone.length >= 8);
    var memberSince = p.created_at ? new Date(p.created_at).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }) : null;

    var actions;
    if (opts.editable) {
      actions =
        '<button class="btn btn-primary btn-sm" id="btn-edit-profile">' + _icon('edit') + ' Modifier</button>' +
        '<button class="btn btn-outline btn-sm" id="btn-share-profile">' + _icon('share') + ' Partager</button>';
    } else {
      var isGuest = !opts.viewerId;
      actions =
        (isGuest
          ? '<a href="login.html" class="btn btn-primary btn-sm">' + _icon('chat') + ' Se connecter pour contacter</a>'
          : '<button class="btn btn-primary btn-sm" id="btn-contact-seller">' + _icon('chat') + ' Contacter</button>') +
        '<button class="btn btn-outline btn-sm" id="btn-share-profile">' + _icon('share') + ' Partager</button>';
    }

    return '<div class="profile-card">' +
      '<div class="profile-cover"></div>' +
      '<div class="profile-avatar-wrap">' +
        '<img src="' + avatar + '" alt="" class="profile-avatar" id="profile-avatar-img">' +
        (verified ? '<div class="profile-verified" title="Vendeur vérifié">' + _icon('check') + '</div>' : '') +
      '</div>' +
      '<div class="profile-body">' +
        '<h2 class="profile-name">' + window.escHtml(name) + '</h2>' +
        (bio ? '<div class="profile-bio">' + window.escHtml(bio) + '</div>' : '') +
        (opts.editable && email ? '<div class="profile-meta">' + _icon('mail') + ' ' + window.escHtml(email) + '</div>' : '') +
        (phone ? '<div class="profile-meta">' + _icon('phone') + ' ' + window.formatPhoneNE(phone) + '</div>' : '') +
        (city  ? '<div class="profile-meta">' + _icon('map_pin') + ' ' + window.escHtml(city) + '</div>' : '') +
        (memberSince ? '<div class="profile-meta">' + _icon('calendar') + ' Membre depuis ' + memberSince + '</div>' : '') +
        '<div class="profile-actions">' + actions + '</div>' +
      '</div>' +
    '</div>';
  }

  function _statsHtml(activeN, soldN, viewsN) {
    return '<div class="profile-stats">' +
      '<div class="profile-stat"><div class="profile-stat-val">' + activeN + '</div><div class="profile-stat-lbl">Actives</div></div>' +
      '<div class="profile-stat"><div class="profile-stat-val">' + soldN + '</div><div class="profile-stat-lbl">Vendues</div></div>' +
      '<div class="profile-stat"><div class="profile-stat-val">' + viewsN + '</div><div class="profile-stat-lbl">Vues</div></div>' +
    '</div>';
  }

  function _tabsHtml(activeN, soldN) {
    return '<div class="profile-tabs">' +
      '<button class="profile-tab active" data-tab="active">Actives (' + activeN + ')</button>' +
      '<button class="profile-tab" data-tab="sold">Vendues (' + soldN + ')</button>' +
    '</div>';
  }

  // ────────────────────────────────────────────────────────────
  //  LISTINGS
  // ────────────────────────────────────────────────────────────
  function _renderListings(products, withActions) {
    var container = document.getElementById('profile-listings');
    if (!container) return;
    if (!products.length) {
      container.innerHTML =
        '<div class="empty-state"><div class="empty-icon">' + _icon('package') + '</div>' +
          '<h3>Aucune annonce</h3>' +
          '<p>' + (withActions ? 'Publiez votre première annonce pour commencer à vendre.' : 'Ce vendeur n\'a pas encore publié d\'annonce.') + '</p>' +
          (withActions ? '<a href="add-product.html" class="btn btn-primary mt-4">' + _icon('plus') + ' Publier</a>' : '') +
        '</div>';
      return;
    }
    container.innerHTML = '<div class="profile-listings-grid">' + products.map(function(p) {
      var img = (p.images && p.images[0]) || p.image || p.image_url;
      var boosted = window.isBoosted && window.isBoosted(p.id);
      return '<div class="profile-listing">' +
        '<div class="profile-listing-img" onclick="window.location.href=\'product-details.html?id=' + p.id + '\'">' +
          (img ? '<img src="' + img + '" alt="">' : '<div class="profile-listing-ph">' + _icon('package') + '</div>') +
          (boosted ? '<span class="profile-badge boost">Boosté</span>' : '') +
          (p.sold   ? '<span class="profile-badge sold">Vendu</span>' : '') +
        '</div>' +
        '<div class="profile-listing-body">' +
          '<div class="profile-listing-title">' + window.escHtml(p.title || '') + '</div>' +
          '<div class="profile-listing-price">' + window.formatPrice(p.price) + '</div>' +
          '<div class="profile-listing-meta">' +
            _icon('eye') + ' ' + (window.getViews ? window.getViews(p.id) : 0) + ' vues · ' +
            window.relativeDate(p.created_at) +
          '</div>' +
          (withActions && !p.sold ? '<div class="profile-listing-actions">' +
            '<button class="profile-act-btn edit" data-id="' + p.id + '" data-act="edit">' + _icon('edit') + ' Modifier</button>' +
            (boosted ? '' : '<button class="profile-act-btn boost" data-id="' + p.id + '" data-act="boost">' + _icon('rocket') + ' Booster</button>') +
            '<button class="profile-act-btn" data-id="' + p.id + '" data-act="sold">' + _icon('check') + ' Vendu</button>' +
            '<button class="profile-act-btn danger" data-id="' + p.id + '" data-act="delete">' + _icon('trash') + '</button>' +
          '</div>' : '') +
        '</div>' +
      '</div>';
    }).join('') + '</div>';

    if (withActions) {
      container.querySelectorAll('[data-act]').forEach(function(btn) {
        btn.addEventListener('click', function() { _onAction(btn.dataset.act, btn.dataset.id); });
      });
    }
  }

  // ────────────────────────────────────────────────────────────
  //  EVENT WIRING
  // ────────────────────────────────────────────────────────────
  function _wireSelfEvents(user, products, active, sold) {
    document.querySelectorAll('.profile-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.profile-tab').forEach(function(t){ t.classList.remove('active'); });
        tab.classList.add('active');
        _renderListings(tab.dataset.tab === 'sold' ? sold : active, true);
      });
    });

    var editBtn  = document.getElementById('btn-edit-profile');
    if (editBtn)  editBtn.addEventListener('click', function() { _openEditModal(user); });

    var shareBtn = document.getElementById('btn-share-profile');
    if (shareBtn) shareBtn.addEventListener('click', function() { _shareProfile(user); });
  }

  function _wirePublicEvents(seller, active, sold) {
    document.querySelectorAll('.profile-tab').forEach(function(tab) {
      tab.addEventListener('click', function() {
        document.querySelectorAll('.profile-tab').forEach(function(t){ t.classList.remove('active'); });
        tab.classList.add('active');
        _renderListings(tab.dataset.tab === 'sold' ? sold : active, false);
      });
    });

    var contactBtn = document.getElementById('btn-contact-seller');
    if (contactBtn) {
      contactBtn.addEventListener('click', function() {
        // Ouvre messages.html avec le vendeur pré-rempli
        var url = 'messages.html?seller=' + encodeURIComponent(seller.id) +
                  '&seller_name=' + encodeURIComponent(seller.full_name || seller.email || 'Vendeur');
        if (seller.avatar_url) url += '&seller_avatar=' + encodeURIComponent(seller.avatar_url);
        window.location.href = url;
      });
    }

    var shareBtn = document.getElementById('btn-share-profile');
    if (shareBtn) shareBtn.addEventListener('click', function() { _shareProfile(seller); });
  }

  // ────────────────────────────────────────────────────────────
  //  PRODUCT ACTIONS (self only)
  // ────────────────────────────────────────────────────────────
  async function _onAction(act, productId) {
    var product = await _findProduct(productId);
    if (!product) { window.toast && window.toast('Annonce introuvable.', 'error'); return; }

    if (act === 'edit') {
      window.location.href = 'add-product.html?edit=' + encodeURIComponent(productId);
      return;
    }
    if (act === 'boost') {
      if (window.boostProduct) window.boostProduct(productId);
      setTimeout(function() { window.location.reload(); }, 800);
    }
    else if (act === 'sold') {
      window.confirm2('Marquer cette annonce comme vendue ?').then(function(ok) {
        if (!ok) return;
        _updateProduct(productId, { sold: true });
        window.toast && window.toast('Annonce marquée vendue.', 'success');
        setTimeout(function() { window.location.reload(); }, 600);
      });
    }
    else if (act === 'delete') {
      window.confirm2('Supprimer cette annonce définitivement ?', true).then(function(ok) {
        if (!ok) return;
        _deleteProduct(productId);
        window.toast && window.toast('Annonce supprimée.', 'success');
        setTimeout(function() { window.location.reload(); }, 600);
      });
    }
  }

  // ────────────────────────────────────────────────────────────
  //  EDIT PROFILE MODAL — avec upload avatar + bio
  // ────────────────────────────────────────────────────────────
  function _openEditModal(user) {
    var name   = user.full_name || (user.user_metadata && user.user_metadata.full_name) || '';
    var phone  = user.phone || (user.user_metadata && user.user_metadata.phone) || '';
    var city   = user.location || (user.user_metadata && user.user_metadata.location) || '';
    var bio    = user.bio || '';
    var avatar = user.avatar_url ||
      ('https://ui-avatars.com/api/?name=' + encodeURIComponent(name || 'U') + '&background=E8501A&color=fff&size=120');
    var cities = (window.APP && window.APP.cities) || [];

    var m = window.showModal(
      '<h3 style="font-family:Outfit,sans-serif;margin-bottom:18px">Modifier mon profil</h3>' +

      // Avatar uploader
      '<div class="ep-avatar-wrap">' +
        '<img src="' + avatar + '" alt="" class="ep-avatar-preview" id="ep-avatar-preview">' +
        '<label for="ep-avatar-input" class="ep-avatar-overlay">' + _icon('edit') + ' Changer</label>' +
        '<input type="file" id="ep-avatar-input" accept="image/*" style="display:none">' +
      '</div>' +

      '<div class="form-group">' +
        '<label class="form-label" for="ep-name">Nom complet</label>' +
        '<input type="text" id="ep-name" class="form-input" value="' + window.escHtml(name) + '" required>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label" for="ep-bio">Bio <span style="color:var(--ink-3);font-weight:400">(optionnelle, max 200 car.)</span></label>' +
        '<textarea id="ep-bio" class="form-input" rows="2" maxlength="200" placeholder="Présentez-vous en quelques mots…">' + window.escHtml(bio) + '</textarea>' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label" for="ep-phone">Téléphone</label>' +
        '<input type="tel" id="ep-phone" class="form-input" value="' + window.escHtml(phone) + '" placeholder="9X XX XX XX">' +
      '</div>' +
      '<div class="form-group">' +
        '<label class="form-label" for="ep-city">Ville</label>' +
        '<select id="ep-city" class="form-input">' +
          '<option value="">Choisir…</option>' +
          cities.map(function(c) { return '<option value="' + c + '"' + (c === city ? ' selected' : '') + '>' + c + '</option>'; }).join('') +
        '</select>' +
      '</div>' +
      '<div style="display:flex;gap:10px;justify-content:flex-end;margin-top:20px">' +
        '<button class="btn btn-outline" id="ep-cancel">Annuler</button>' +
        '<button class="btn btn-primary" id="ep-save">Enregistrer</button>' +
      '</div>',
      { maxWidth: '420px' }
    );

    var newAvatarFile = null;
    var preview = m.el.querySelector('#ep-avatar-preview');
    var fileInp = m.el.querySelector('#ep-avatar-input');

    fileInp.addEventListener('change', function() {
      var file = this.files && this.files[0];
      if (!file) return;
      if (file.size > 5 * 1024 * 1024) {
        window.toast && window.toast('Image trop lourde (max 5 Mo).', 'error');
        return;
      }
      newAvatarFile = file;
      var reader = new FileReader();
      reader.onload = function(e) { preview.src = e.target.result; };
      reader.readAsDataURL(file);
    });

    m.el.querySelector('#ep-cancel').onclick = function() { m.close(); };
    m.el.querySelector('#ep-save').onclick = async function(e) {
      var saveBtn = e.target;
      var newName  = m.el.querySelector('#ep-name').value.trim();
      var newBio   = m.el.querySelector('#ep-bio').value.trim();
      var newPhone = m.el.querySelector('#ep-phone').value.trim().replace(/\D/g, '');
      var newCity  = m.el.querySelector('#ep-city').value;
      if (!newName) { window.toast && window.toast('Le nom est requis.', 'error'); return; }

      saveBtn.disabled = true;
      saveBtn.innerHTML = '<span class="btn-spinner"></span> Enregistrement…';

      var avatarUrl = user.avatar_url || null;

      // 1. Upload avatar si nouveau (Supabase Storage)
      if (newAvatarFile && window._supabase) {
        try {
          var ext  = (newAvatarFile.name.split('.').pop() || 'jpg').toLowerCase();
          var path = (user.id || 'user') + '/avatar_' + Date.now() + '.' + ext;
          var up = await window._supabase.storage
            .from('avatars')
            .upload(path, newAvatarFile, { upsert: true, cacheControl: '3600' });
          if (up && !up.error) {
            var pub = window._supabase.storage.from('avatars').getPublicUrl(path);
            avatarUrl = pub.data.publicUrl;
          }
        } catch(err) { console.warn('[profile] avatar upload failed', err); }
      } else if (newAvatarFile) {
        // Mode démo : stocke en base64 dans la session
        var reader = new FileReader();
        avatarUrl = await new Promise(function(resolve) {
          reader.onload = function(e) { resolve(e.target.result); };
          reader.readAsDataURL(newAvatarFile);
        });
      }

      // 2. Upsert dans profiles (Supabase)
      if (window._supabase) {
        try {
          await window._supabase.from('profiles').upsert({
            id: user.id, full_name: newName, bio: newBio, phone: newPhone,
            location: newCity, avatar_url: avatarUrl,
            updated_at: new Date().toISOString()
          });
        } catch(e) { console.warn('[profile] save failed', e); }
      }

      // 3. Met à jour la session démo localStorage
      try {
        var session = JSON.parse(localStorage.getItem('dj_demo_session') || 'null');
        if (session) {
          session.full_name = newName;
          session.bio       = newBio;
          session.phone     = newPhone;
          session.location  = newCity;
          if (avatarUrl) session.avatar_url = avatarUrl;
          localStorage.setItem('dj_demo_session', JSON.stringify(session));
        }
      } catch(e) {}

      m.close();
      window.toast && window.toast('Profil mis à jour.', 'success');
      setTimeout(function() { window.location.reload(); }, 500);
    };
  }

  // ────────────────────────────────────────────────────────────
  //  SHARE
  // ────────────────────────────────────────────────────────────
  function _shareProfile(user) {
    var name = user.full_name || user.email || 'Vendeur';
    var url  = window.location.origin + '/pages/my-profile.html?id=' + (user.id || '');
    var text = 'Découvrez la boutique de ' + name + ' sur DjamikShop';
    if (navigator.share && /Android|iPhone/i.test(navigator.userAgent)) {
      navigator.share({ title: name, text: text, url: url }).catch(function(){});
    } else {
      window.open('https://wa.me/?text=' + encodeURIComponent(text + '\n' + url), '_blank', 'noopener');
    }
  }

  // ────────────────────────────────────────────────────────────
  //  DATA HELPERS
  // ────────────────────────────────────────────────────────────
  async function _fetchProfile(userId) {
    if (window._supabase) {
      try {
        var res = await window._supabase.from('profiles').select('*').eq('id', userId).single();
        if (res && res.data) return res.data;
      } catch(e) {}
    }
    // Fallback : si on regarde notre propre profil démo
    try {
      var raw = localStorage.getItem('dj_demo_session');
      if (raw) {
        var sess = JSON.parse(raw);
        if (sess && sess.id === userId) return sess;
      }
    } catch(e) {}
    return null;
  }

  async function _fetchProducts(userId) {
    var products = [];
    if (window._supabase) {
      try {
        var res = await window._supabase
          .from('products').select('*').eq('seller_id', userId)
          .order('created_at', { ascending: false });
        if (res && res.data) products = res.data;
      } catch(e) {}
    }
    try {
      var local = window.getMyProducts ? window.getMyProducts() : [];
      local.forEach(function(p) {
        if (p.seller_id !== userId) return;
        if (!products.find(function(x){ return x.id === p.id; })) products.push(p);
      });
    } catch(e) {}
    return products;
  }

  async function _findProduct(id) {
    if (window._supabase) {
      try {
        var res = await window._supabase.from('products').select('*').eq('id', id).single();
        if (res && res.data) return res.data;
      } catch(e) {}
    }
    var local = window.getMyProducts ? window.getMyProducts() : [];
    return local.find(function(p){ return p.id === id; }) || null;
  }

  async function _updateProduct(id, patch) {
    if (window._supabase) {
      try { await window._supabase.from('products').update(patch).eq('id', id); } catch(e) {}
    }
    if (window.updateMyProduct) window.updateMyProduct(id, patch);
  }

  async function _deleteProduct(id) {
    if (window._supabase) {
      try { await window._supabase.from('products').delete().eq('id', id); } catch(e) {}
    }
    if (window.removeMyProduct) window.removeMyProduct(id);
  }

  // ────────────────────────────────────────────────────────────
  //  MISC
  // ────────────────────────────────────────────────────────────
  function _showSkeleton() {
    root.innerHTML = '<div class="profile-skeleton">' +
      '<div class="skeleton skeleton-avatar"></div>' +
      '<div class="skeleton skeleton-line" style="width:140px;margin:14px auto"></div>' +
      '<div class="skeleton skeleton-line" style="width:200px;margin:8px auto"></div>' +
    '</div>';
  }

  function _icon(name) {
    return (window.ICONS && window.ICONS[name]) || '';
  }

  function _injectStyles() {
    if (document.getElementById('profile-styles')) return;
    var s = document.createElement('style');
    s.id = 'profile-styles';
    s.textContent = [
      '.profile-skeleton{padding:40px 0;text-align:center}',
      '.skeleton-avatar{width:96px;height:96px;border-radius:50%;margin:0 auto;background:var(--surface-3);animation:pulse 1.5s ease infinite}',
      '@keyframes pulse{0%,100%{opacity:1}50%{opacity:.5}}',

      // Card
      '.profile-card{position:relative;background:var(--white);border:1px solid var(--surface-3);border-radius:var(--r-xl);overflow:hidden;margin-bottom:var(--space-4);box-shadow:var(--shadow-sm)}',
      '.profile-cover{height:80px;background:linear-gradient(135deg,#0F172A 0%,#1E293B 50%,#E8501A 150%)}',
      '.profile-avatar-wrap{position:relative;width:96px;height:96px;margin:-48px auto 0;display:block}',
      '.profile-avatar{width:96px;height:96px;border-radius:50%;border:4px solid var(--white);object-fit:cover;display:block;background:var(--surface-2)}',
      '.profile-verified{position:absolute;bottom:2px;right:2px;width:26px;height:26px;border-radius:50%;background:var(--success,#16a34a);color:#fff;display:flex;align-items:center;justify-content:center;border:2px solid var(--white)}',
      '.profile-verified svg{width:14px;height:14px}',
      '.profile-body{padding:14px 20px 22px;text-align:center}',
      '.profile-name{font-family:Outfit,sans-serif;font-size:1.25rem;font-weight:800;margin:6px 0 4px;color:var(--ink)}',
      '.profile-bio{font-size:.88rem;color:var(--ink-2);margin:8px 0 10px;line-height:1.5;max-width:340px;margin-left:auto;margin-right:auto}',
      '.profile-meta{font-size:.82rem;color:var(--ink-3);margin:4px 0;display:flex;align-items:center;gap:6px;justify-content:center;flex-wrap:wrap}',
      '.profile-meta svg{width:14px;height:14px;flex-shrink:0}',
      '.profile-actions{display:flex;gap:8px;justify-content:center;margin-top:16px;flex-wrap:wrap}',

      // Stats
      '.profile-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:var(--space-4)}',
      '.profile-stat{background:var(--white);border:1px solid var(--surface-3);border-radius:var(--r-lg);padding:14px;text-align:center;box-shadow:var(--shadow-sm)}',
      '.profile-stat-val{font-family:Outfit,sans-serif;font-size:1.6rem;font-weight:800;color:var(--primary,#E8501A);line-height:1}',
      '.profile-stat-lbl{font-size:.72rem;color:var(--ink-3);text-transform:uppercase;letter-spacing:.05em;margin-top:4px}',

      // Tabs
      '.profile-tabs{display:flex;gap:4px;margin-bottom:var(--space-4);background:var(--surface-2);padding:4px;border-radius:var(--r-md)}',
      '.profile-tab{flex:1;padding:8px 12px;background:transparent;border:none;border-radius:calc(var(--r-md) - 2px);font-weight:600;font-size:.85rem;color:var(--ink-3);cursor:pointer;font-family:inherit;transition:all .15s}',
      '.profile-tab.active{background:var(--white);color:var(--ink);box-shadow:var(--shadow-sm)}',

      // Listings
      '.profile-listings-grid{display:grid;grid-template-columns:1fr;gap:10px}',
      '@media(min-width:600px){.profile-listings-grid{grid-template-columns:repeat(2,1fr)}}',
      '.profile-listing{display:flex;background:var(--white);border:1px solid var(--surface-3);border-radius:var(--r-lg);overflow:hidden;box-shadow:var(--shadow-sm)}',
      '.profile-listing-img{position:relative;width:110px;flex-shrink:0;cursor:pointer;background:var(--surface-2)}',
      '.profile-listing-img img{width:100%;height:100%;object-fit:cover;display:block}',
      '.profile-listing-ph{display:flex;align-items:center;justify-content:center;height:100%;color:var(--ink-3)}',
      '.profile-listing-ph svg{width:32px;height:32px}',
      '.profile-badge{position:absolute;top:6px;left:6px;padding:3px 7px;font-size:.65rem;font-weight:700;border-radius:4px;color:#fff;text-transform:uppercase;letter-spacing:.05em}',
      '.profile-badge.boost{background:#7C3AED}',
      '.profile-badge.sold{background:#64748b}',
      '.profile-listing-body{flex:1;padding:10px 12px;min-width:0;display:flex;flex-direction:column}',
      '.profile-listing-title{font-weight:600;font-size:.88rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}',
      '.profile-listing-price{color:var(--primary,#E8501A);font-weight:800;font-size:1rem;margin:2px 0}',
      '.profile-listing-meta{font-size:.7rem;color:var(--ink-3);display:flex;align-items:center;gap:4px}',
      '.profile-listing-meta svg{width:12px;height:12px}',
      '.profile-listing-actions{display:flex;gap:5px;margin-top:auto;padding-top:8px;flex-wrap:wrap}',
      '.profile-act-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 9px;background:var(--surface-2);border:1px solid var(--surface-3);border-radius:6px;font-size:.7rem;font-weight:600;cursor:pointer;color:var(--ink-2);font-family:inherit;transition:all .15s}',
      '.profile-act-btn:hover{background:var(--surface-3)}',
      '.profile-act-btn.boost{color:#7C3AED;border-color:rgba(124,58,237,.3)}',
      '.profile-act-btn.edit{color:var(--primary,#E8501A);border-color:rgba(232,80,26,.3)}',
      '.profile-act-btn.danger{color:var(--danger,#ef4444);border-color:rgba(239,68,68,.3)}',
      '.profile-act-btn svg{width:11px;height:11px}',

      // Edit modal — avatar uploader
      '.ep-avatar-wrap{position:relative;width:120px;height:120px;margin:0 auto 18px;border-radius:50%;overflow:hidden;cursor:pointer}',
      '.ep-avatar-preview{width:100%;height:100%;object-fit:cover;display:block;border-radius:50%}',
      '.ep-avatar-overlay{position:absolute;left:0;right:0;bottom:0;background:rgba(0,0,0,.65);color:#fff;font-size:.78rem;font-weight:600;padding:6px;text-align:center;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:5px}',
      '.ep-avatar-overlay svg{width:13px;height:13px}',
    ].join('');
    document.head.appendChild(s);
  }
});
