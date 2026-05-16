// ═══════════════════════════════════════════════════════════════════
//  FEATURES / ADD-PRODUCT — Publier une annonce
// ═══════════════════════════════════════════════════════════════════

window.onDjamikReady(function() {
  var panel = document.getElementById('add-product-form');
  if (!panel) return;

  // ── Mode édition : ?edit=PRODUCT_ID dans l'URL ──
  var urlParams = new URLSearchParams(window.location.search);
  var editId    = urlParams.get('edit');
  var editMode  = !!editId;

  (window.requireAuth ? window.requireAuth('add-product.html' + (editMode ? '?edit=' + editId : '')) : Promise.resolve(true)).then(async function(user) {
    if (!user) return;

    var existingProduct = null;
    if (editMode) {
      existingProduct = await _fetchProductForEdit(editId, user);
      if (!existingProduct) return;   // erreur déjà affichée

      // Met à jour titre/breadcrumb pour refléter le mode édition
      document.title = 'Modifier l\'annonce — DjamikShop';
      var h1 = document.querySelector('.page-body h1');
      if (h1) h1.lastChild.textContent = ' Modifier l\'annonce';
      var crumb = document.querySelector('.breadcrumb span');
      if (crumb) crumb.textContent = 'Modifier';
    }

    _buildForm(panel, user, existingProduct);
  });

  // ── Récupère l'annonce à éditer + check ownership ──
  async function _fetchProductForEdit(productId, user) {
    if (!window._supabase) {
      window.toast && window.toast('Connexion requise.', 'error');
      return null;
    }
    try {
      var r = await window._supabase.from('products').select('*').eq('id', productId).single();
      if (!r || r.error || !r.data) {
        window.toast && window.toast('Annonce introuvable.', 'error');
        setTimeout(function(){ window.location.href = 'my-profile.html'; }, 1200);
        return null;
      }
      if (r.data.seller_id !== user.id) {
        window.toast && window.toast('Vous ne pouvez modifier que vos propres annonces.', 'error');
        setTimeout(function(){ window.location.href = 'my-profile.html'; }, 1500);
        return null;
      }
      return r.data;
    } catch(e) {
      window.toast && window.toast('Erreur de chargement.', 'error');
      return null;
    }
  }

  function _buildForm(panel, user, existing) {
    existing = existing || null;
    var cats     = (window.APP && window.APP.categories)     || [];
    var conds    = (window.APP && window.APP.conditions)     || [];
    var cities   = (window.APP && window.APP.cities)         || [];
    var payments = (window.APP && window.APP.paymentMethods) || [];

    panel.innerHTML =
      '<form id="ap-form" novalidate>' +

      // ── Photos ──
      '<div class="form-group">' +
        '<label class="form-label">Photos <span style="color:var(--ink-3);font-weight:400">(max 3)</span></label>' +
        '<div id="ap-photo-drop" class="ap-photo-drop">' +
          '<div style="pointer-events:none">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" width="36" height="36" style="display:block;margin:0 auto 8px;color:var(--ink-3)"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>' +
            '<span style="color:var(--ink-3);font-size:.875rem">Glissez des photos ou <strong style="color:var(--primary)">parcourez</strong></span>' +
          '</div>' +
          '<input type="file" id="ap-file-input" accept="image/*" multiple style="position:absolute;inset:0;opacity:0;cursor:pointer;width:100%;height:100%">' +
        '</div>' +
        '<div id="ap-previews" class="ap-previews"></div>' +
      '</div>' +

      // ── Titre ──
      '<div class="form-group">' +
        '<label class="form-label" for="ap-title">Titre <span style="color:var(--danger)">*</span></label>' +
        '<input type="text" class="form-input" id="ap-title" placeholder="Ex : iPhone 13 Pro 128 Go état neuf" maxlength="80" required>' +
      '</div>' +

      // ── Catégorie + État ──
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">' +
        '<div class="form-group">' +
          '<label class="form-label" for="ap-category">Catégorie <span style="color:var(--danger)">*</span></label>' +
          '<select class="form-input" id="ap-category" required>' +
            '<option value="">Choisir…</option>' +
            cats.map(function(c){ return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="ap-condition">État <span style="color:var(--danger)">*</span></label>' +
          '<select class="form-input" id="ap-condition" required>' +
            '<option value="">Choisir…</option>' +
            conds.map(function(c){ return '<option value="' + c.id + '">' + c.label + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +

      // ── Prix + Ville ──
      '<div style="display:grid;grid-template-columns:1fr 1fr;gap:var(--space-4)">' +
        '<div class="form-group">' +
          '<label class="form-label" for="ap-price">Prix (FCFA) <span style="color:var(--danger)">*</span></label>' +
          '<input type="number" class="form-input" id="ap-price" placeholder="Ex : 150 000" min="0" required>' +
        '</div>' +
        '<div class="form-group">' +
          '<label class="form-label" for="ap-city">Ville <span style="color:var(--danger)">*</span></label>' +
          '<select class="form-input" id="ap-city" required>' +
            '<option value="">Choisir une ville</option>' +
            cities.map(function(c){ return '<option value="' + c + '">' + c + '</option>'; }).join('') +
          '</select>' +
        '</div>' +
      '</div>' +

      // ── Description ──
      '<div class="form-group">' +
        '<label class="form-label" for="ap-desc">Description</label>' +
        '<textarea class="form-input" id="ap-desc" rows="4" placeholder="Décrivez votre article : état, caractéristiques, raison de vente…" maxlength="1000" style="resize:vertical;min-height:100px"></textarea>' +
        '<div style="text-align:right;font-size:.75rem;color:var(--ink-3);margin-top:2px"><span id="ap-desc-count">0</span>/1000</div>' +
      '</div>' +

      // ── Paiements ──
      '<div class="form-group">' +
        '<label class="form-label">Modes de paiement acceptés</label>' +
        '<div class="ap-payment-grid">' +
          payments.map(function(p) {
            return '<label class="ap-payment-item">' +
              '<input type="checkbox" name="ap-payment" value="' + p.id + '" checked>' +
              '<span style="color:' + p.color + ';font-weight:600">' + p.label + '</span>' +
            '</label>';
          }).join('') +
        '</div>' +
      '</div>' +

      // ── Genre (facultatif, multi-select) ──
      '<div class="form-group">' +
        '<label class="form-label">Pour qui ? <span style="color:var(--ink-3);font-weight:400">(facultatif)</span></label>' +
        '<div class="ap-genre-grid">' +
          '<label class="ap-genre-item"><input type="checkbox" name="ap-genre" value="homme"><span>👨 Homme</span></label>' +
          '<label class="ap-genre-item"><input type="checkbox" name="ap-genre" value="femme"><span>👩 Femme</span></label>' +
          '<label class="ap-genre-item"><input type="checkbox" name="ap-genre" value="enfant"><span>🧒 Enfant</span></label>' +
        '</div>' +
      '</div>' +

      // ── Négociable ──
      '<div class="form-group" style="display:flex;align-items:center;gap:10px">' +
        '<input type="checkbox" id="ap-negotiable" style="width:18px;height:18px;accent-color:var(--primary);flex-shrink:0">' +
        '<label for="ap-negotiable" style="cursor:pointer;font-weight:500;margin:0">Prix négociable</label>' +
      '</div>' +

      // ── Submit ──
      '<div style="display:flex;gap:12px;margin-top:var(--space-6)">' +
        '<a href="' + (existing ? 'my-profile.html' : 'index.html') + '" class="btn btn-outline" style="flex:1;text-align:center">Annuler</a>' +
        '<button type="submit" class="btn btn-primary" id="ap-submit" style="flex:2">' +
          (existing
            ? '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Enregistrer les modifications'
            : '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg> Publier l\'annonce'
          ) +
        '</button>' +
      '</div>' +

      '</form>';

    _injectStyles();
    _initImages(existing);
    _initCounter();
    _prefillForm(existing);
    _initSubmit(user, existing);
  }

  // ── Pré-remplit le formulaire en mode édition ──
  function _prefillForm(existing) {
    if (!existing) return;
    var byId = function(id){ return document.getElementById(id); };
    if (byId('ap-title'))      byId('ap-title').value      = existing.title       || '';
    if (byId('ap-category'))   byId('ap-category').value   = existing.category    || '';
    if (byId('ap-condition'))  byId('ap-condition').value  = existing.condition   || '';
    if (byId('ap-price'))      byId('ap-price').value      = existing.price       || '';
    if (byId('ap-city'))       byId('ap-city').value       = existing.city        || '';
    if (byId('ap-desc'))       { byId('ap-desc').value     = existing.description || ''; var c = byId('ap-desc-count'); if (c) c.textContent = (existing.description || '').length; }
    if (byId('ap-negotiable')) byId('ap-negotiable').checked = !!existing.negotiable;
    var pms = existing.payment_methods || [];
    document.querySelectorAll('input[name=ap-payment]').forEach(function(cb){
      cb.checked = pms.indexOf(cb.value) !== -1;
    });
    var genres = existing.genre || [];
    document.querySelectorAll('input[name=ap-genre]').forEach(function(cb){
      cb.checked = genres.indexOf(cb.value) !== -1;
    });
  }

  // ── Image upload & preview ──
  // On garde 2 listes synchronisées :
  //   files[]    = File natifs (pour upload Storage au submit)
  //   previews[] = data URLs base64 (pour affichage local immédiat)
  function _initImages(existing) {
    var files       = [];        // nouveaux fichiers à uploader
    var previewsArr = [];        // data URLs des nouveaux fichiers
    var existingUrls = [];       // URLs déjà uploadées (mode édition)
    if (existing && Array.isArray(existing.images)) {
      existingUrls = existing.images.slice();
    } else if (existing && existing.image_url) {
      existingUrls = [existing.image_url];
    }
    var fileInput = document.getElementById('ap-file-input');
    var drop      = document.getElementById('ap-photo-drop');
    var previewsEl = document.getElementById('ap-previews');

    fileInput.addEventListener('change', function() { _addFiles(this.files); this.value = ''; });
    drop.addEventListener('dragover',  function(e){ e.preventDefault(); drop.classList.add('drag-over'); });
    drop.addEventListener('dragleave', function(){ drop.classList.remove('drag-over'); });
    drop.addEventListener('drop', function(e) {
      e.preventDefault(); drop.classList.remove('drag-over');
      _addFiles(e.dataTransfer.files);
    });

    function _totalCount() { return existingUrls.length + files.length; }

    function _addFiles(fl) {
      Array.from(fl).forEach(function(file) {
        if (_totalCount() >= 3) { window.toast && window.toast('Maximum 3 photos.', 'error'); return; }
        if (!file.type.startsWith('image/')) return;
        if (file.size > 5 * 1024 * 1024) {
          window.toast && window.toast('Image > 5 Mo ignorée.', 'error');
          return;
        }
        files.push(file);
        var reader = new FileReader();
        reader.onload = function(ev) {
          previewsArr.push(ev.target.result);
          _render();
        };
        reader.readAsDataURL(file);
      });
    }

    function _render() {
      var existingHtml = existingUrls.map(function(url, i) {
        return '<div class="ap-preview-item">' +
          '<img src="' + url + '" alt="">' +
          '<button type="button" class="ap-preview-del" data-type="existing" data-i="' + i + '" title="Supprimer">×</button>' +
        '</div>';
      }).join('');
      var newHtml = previewsArr.map(function(src, i) {
        return '<div class="ap-preview-item">' +
          '<img src="' + src + '" alt="">' +
          '<button type="button" class="ap-preview-del" data-type="new" data-i="' + i + '" title="Supprimer">×</button>' +
        '</div>';
      }).join('');
      previewsEl.innerHTML = existingHtml + newHtml;
      previewsEl.querySelectorAll('.ap-preview-del').forEach(function(btn) {
        btn.addEventListener('click', function() {
          var i = parseInt(this.dataset.i);
          if (this.dataset.type === 'existing') {
            existingUrls.splice(i, 1);
          } else {
            files.splice(i, 1);
            previewsArr.splice(i, 1);
          }
          _render();
        });
      });
    }
    _render();   // affiche les images existantes immédiatement

    // Expose pour le submit handler
    drop._files        = files;
    drop._previewsArr  = previewsArr;
    drop._existingUrls = existingUrls;
  }

  // ── Upload des images vers Supabase Storage ──
  // Retourne un array d'URLs publiques. Si Storage indispo, fallback : data URLs.
  async function _uploadImages(files, previews, userId) {
    if (!files || !files.length) return [];
    if (!window._supabase) return previews.slice();   // fallback : data URLs

    var urls = [];
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      var ext  = (file.name.split('.').pop() || 'jpg').toLowerCase();
      var safeExt = ['jpg','jpeg','png','webp','gif'].indexOf(ext) !== -1 ? ext : 'jpg';
      var path = userId + '/' + Date.now() + '_' + i + '.' + safeExt;

      try {
        var up = await window._supabase.storage
          .from('product-images')
          .upload(path, file, { upsert: false, cacheControl: '3600' });
        if (up && !up.error) {
          var pub = window._supabase.storage.from('product-images').getPublicUrl(path);
          if (pub && pub.data && pub.data.publicUrl) urls.push(pub.data.publicUrl);
          else urls.push(previews[i]);   // fallback
        } else {
          console.warn('[add-product] image upload failed:', up && up.error);
          urls.push(previews[i]);   // fallback data URL
        }
      } catch(e) {
        console.warn('[add-product] image upload exception:', e);
        urls.push(previews[i]);
      }
    }
    return urls;
  }

  // ── Description counter ──
  function _initCounter() {
    var desc  = document.getElementById('ap-desc');
    var count = document.getElementById('ap-desc-count');
    if (desc && count) {
      desc.addEventListener('input', function() { count.textContent = desc.value.length; });
    }
  }

  // ── Form submit ──
  function _initSubmit(user, existing) {
    var form = document.getElementById('ap-form');
    if (!form) return;

    form.addEventListener('submit', async function(e) {
      e.preventDefault();

      var title      = (document.getElementById('ap-title')      || {}).value.trim();
      var category   = (document.getElementById('ap-category')   || {}).value;
      var condition  = (document.getElementById('ap-condition')  || {}).value;
      var priceRaw   = (document.getElementById('ap-price')      || {}).value;
      var city       = (document.getElementById('ap-city')       || {}).value;
      var desc       = (document.getElementById('ap-desc')       || {}).value.trim();
      var negotiable = (document.getElementById('ap-negotiable') || {}).checked;
      var payChecks  = Array.from(document.querySelectorAll('input[name=ap-payment]:checked')).map(function(c){ return c.value; });
      var genreChecks = Array.from(document.querySelectorAll('input[name=ap-genre]:checked')).map(function(c){ return c.value; });
      var dropEl     = document.getElementById('ap-photo-drop') || {};
      var imageFiles    = dropEl._files        || [];
      var imagePreviews = dropEl._previewsArr  || [];
      var existingUrls  = dropEl._existingUrls || [];
      var price      = parseInt(priceRaw, 10);

      if (!title)        { window.toast && window.toast('Ajoutez un titre.', 'error'); return; }
      if (!category)     { window.toast && window.toast('Choisissez une catégorie.', 'error'); return; }
      if (!condition)    { window.toast && window.toast('Précisez l\'état.', 'error'); return; }
      if (!priceRaw || isNaN(price) || price < 0) { window.toast && window.toast('Entrez un prix valide.', 'error'); return; }
      if (!city)         { window.toast && window.toast('Choisissez une ville.', 'error'); return; }

      // ── Modération auto : mots interdits ──
      var fullText = (title + ' ' + desc).toLowerCase();
      var forbidden = ['drogue','cocaine','cocaïne','heroine','héroïne','cannabis','weed','arme à feu','pistolet','kalashnikov','ak-47','grenade','contrefaçon','faux billet','passeport','permis vente','escort','sexe payant','prostitution','ivoire','peau de léopard','rhinoceros','rhinocéros','enfant à vendre','organe','rein à vendre'];
      var hit = forbidden.find(function(w) { return fullText.indexOf(w) !== -1; });
      if (hit) {
        window.toast && window.toast('Annonce refusée : contenu interdit (« ' + hit + ' »). Voir nos CGU.', 'error', 6000);
        // Signale au serveur (capture IP + UA réels)
        window.reportIncident && window.reportIncident('forbidden_word', 'medium', { word: hit, title: title.slice(0, 100) });
        return;
      }

      // ── Résolution session pour les checks ci-dessous ──
      var sessionUser = user;
      if (!sessionUser || typeof sessionUser === 'boolean' || !sessionUser.id) {
        if (window.currentUser) sessionUser = await window.currentUser();
      }
      if (!sessionUser || !sessionUser.id) {
        window.toast && window.toast('Session expirée. Reconnectez-vous.', 'error');
        setTimeout(function(){ window.location.href = 'login.html?next=add-product.html'; }, 1200);
        return;
      }

      // ── Email vérifié obligatoire avant publication ──
      if (sessionUser.email_confirmed_at === null || sessionUser.email_confirmed_at === undefined) {
        // Note : peut être absent selon Supabase config. On laisse passer si pas dispo.
        if (sessionUser.confirmed_at === null) {
          window.toast && window.toast('Vérifiez votre email avant de publier (lien envoyé à l\'inscription).', 'error', 6000);
          return;
        }
      }

      // ── Limite par tier (uniquement à la création) ──
      // Source de vérité = trigger SQL (bypass impossible). On check ici pour
      // afficher un message clair avant l'aller-retour serveur.
      if (!existing && window._supabase) {
        try {
          var userTier = window.myTier ? await window.myTier() : 'free';
          var tierLimit = (window.tierListingLimit ? window.tierListingLimit(userTier) : (userTier === 'premium' ? 100 : userTier === 'vip' ? 50 : 10));
          var countRes = await window._supabase
            .from('products')
            .select('id', { count: 'exact', head: true })
            .eq('seller_id', sessionUser.id)
            .eq('sold', false);
          if (countRes && countRes.count >= tierLimit) {
            var msg = 'Limite atteinte : ' + tierLimit + ' annonces max sur le plan ' + (userTier === 'free' ? 'Gratuit' : userTier.toUpperCase()) + '.';
            if (userTier === 'free')      msg += ' Passe en VIP (50) ou Premium (100) pour publier plus.';
            else if (userTier === 'vip')  msg += ' Passe en Premium (100) pour publier plus.';
            window.confirm2 ? window.confirm2(msg + '\n\nVoir les tarifs ?').then(function(ok) {
              if (ok) window.location.href = 'tarifs.html';
            }) : alert(msg);
            window.reportIncident && window.reportIncident('spam_limit', 'low', { current: countRes.count, tier: userTier, limit: tierLimit });
            return;
          }
        } catch(e) {}
      }

      var btn = document.getElementById('ap-submit');
      btn.disabled = true;
      btn.innerHTML = '<span class="btn-spinner"></span> ' + (existing ? 'Enregistrement…' : 'Publication…');

      // session déjà résolue plus haut → alias
      var session = sessionUser;

      // Récupère le profil pour avoir nom + avatar
      var profile = {};
      if (window._supabase) {
        try {
          var pRes = await window._supabase.from('profiles').select('full_name, avatar_url').eq('id', session.id).single();
          if (pRes && pRes.data) profile = pRes.data;
        } catch(e) {}
      }

      var sellerId     = session.id;
      var sellerName   = profile.full_name || session.user_metadata && session.user_metadata.full_name || session.email || 'Vendeur';
      var sellerAvatar = profile.avatar_url ||
        ('https://ui-avatars.com/api/?name=' + encodeURIComponent(sellerName) + '&background=E8501A&color=fff&size=120');

      // Upload des NOUVELLES images vers Storage, puis fusionne avec les existantes (mode édition)
      btn.innerHTML = '<span class="btn-spinner"></span> Upload images…';
      var newUrls = await _uploadImages(imageFiles, imagePreviews, sellerId);
      var images  = existingUrls.concat(newUrls);

      var product = {
        id:              window.genId ? window.genId() : ('p-' + Date.now()),
        title:           title,
        category:        category,
        condition:       condition,
        price:           price,
        city:            city,
        description:     desc,
        negotiable:      negotiable,
        payment_methods: payChecks,
        images:          images,
        image:           images[0] || null,
        image_url:       images[0] || null,
        sold:            false,
        seller_id:       sellerId,
        seller_name:     sellerName,
        seller_avatar:   sellerAvatar,
        created_at:      new Date().toISOString()
      };

      btn.innerHTML = '<span class="btn-spinner"></span> ' + (existing ? 'Enregistrement…' : 'Publication…');

      // Payload commun INSERT/UPDATE
      var dbPayload = {
        title:           product.title,
        category:        product.category,
        condition:       product.condition,
        price:           product.price,
        city:            product.city,
        description:     product.description,
        image_url:       product.image,
        images:          product.images,
        payment_methods: product.payment_methods,
        negotiable:      product.negotiable,
        genre:           genreChecks
      };

      var supabaseOK = false;

      if (existing) {
        // ── UPDATE (mode édition) ──
        if (window._supabase) {
          try {
            var upd = await window._supabase.from('products')
              .update(dbPayload)
              .eq('id', existing.id)
              .eq('seller_id', sellerId)   // garde-fou : ne touche que mes annonces
              .select().single();
            if (upd && !upd.error) {
              supabaseOK = true;
              product.id         = existing.id;
              product.created_at = existing.created_at;
            } else if (upd && upd.error) {
              console.warn('[add-product] Supabase update failed:', upd.error);
              window._lastSupabaseError = upd.error.message || JSON.stringify(upd.error);
            }
          } catch(err) {
            console.warn('[add-product] Supabase update exception:', err);
            window._lastSupabaseError = err && err.message;
          }
        }
        // Mise à jour locale
        try {
          if (window.updateMyProduct) window.updateMyProduct(existing.id, product);
        } catch(err) { console.warn('[add-product] local update error', err); }

        var msgU = supabaseOK
          ? 'Annonce mise à jour !'
          : ('Échec : ' + (window._lastSupabaseError || 'erreur inconnue'));
        window.toast && window.toast(msgU, supabaseOK ? 'success' : 'error', 6000);
        setTimeout(function() { window.location.href = 'my-profile.html'; }, 1000);
        return;
      }

      // ── INSERT (création) ──
      dbPayload.sold      = false;
      dbPayload.seller_id = sellerId;

      if (window._supabase) {
        try {
          var ins = await window._supabase.from('products').insert([dbPayload]).select().single();
          if (ins && !ins.error) {
            supabaseOK = true;
            if (ins.data && ins.data.id) {
              product.id         = ins.data.id;
              product.created_at = ins.data.created_at || product.created_at;
            }
          } else if (ins && ins.error) {
            console.warn('[add-product] Supabase insert failed:', ins.error);
            window._lastSupabaseError = ins.error.message || JSON.stringify(ins.error);
          }
        } catch(err) {
          console.warn('[add-product] Supabase exception:', err);
          window._lastSupabaseError = err && err.message;
        }
      }

      try {
        if (window.addMyProduct) window.addMyProduct(product);
        else { var myProds = JSON.parse(localStorage.getItem('dj_my_products') || '[]'); myProds.unshift(product); localStorage.setItem('dj_my_products', JSON.stringify(myProds)); }
      } catch(err) { console.warn('[add-product] local save error', err); }

      var msg = supabaseOK
        ? 'Annonce publiée avec succès !'
        : ('Échec mise en ligne : ' + (window._lastSupabaseError || 'erreur inconnue') + '. Sauvée en local.');
      window.toast && window.toast(msg, supabaseOK ? 'success' : 'error', 6000);
      if (window.shareProduct && window.confirm2) {
        setTimeout(function() {
          window.confirm2('Partager votre annonce sur WhatsApp maintenant ?').then(function(ok) {
            if (ok) window.shareProduct(product);
            window.location.href = 'index.html';
          });
        }, 500);
      } else {
        setTimeout(function() { window.location.href = 'index.html'; }, 1200);
      }
    });
  }

  // ── Styles ──
  function _injectStyles() {
    if (document.getElementById('ap-styles')) return;
    var s = document.createElement('style');
    s.id = 'ap-styles';
    s.textContent = [
      '.ap-photo-drop{position:relative;border:2px dashed var(--surface-3);border-radius:var(--r-lg);padding:32px 20px;text-align:center;cursor:pointer;transition:border-color .2s,background .2s;overflow:hidden}',
      '.ap-photo-drop:hover,.ap-photo-drop.drag-over{border-color:var(--primary);background:rgba(232,80,26,.04)}',
      '.ap-previews{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}',
      '.ap-preview-item{position:relative;width:80px;height:80px;border-radius:var(--r-md);overflow:hidden;border:1px solid var(--surface-3)}',
      '.ap-preview-item img{width:100%;height:100%;object-fit:cover;display:block}',
      '.ap-preview-del{position:absolute;top:3px;right:3px;width:20px;height:20px;border-radius:50%;background:rgba(0,0,0,.65);color:#fff;border:none;cursor:pointer;font-size:16px;line-height:20px;text-align:center;padding:0}',
      '.ap-payment-grid{display:flex;flex-wrap:wrap;gap:8px}',
      '.ap-payment-item{display:flex;align-items:center;gap:6px;padding:7px 14px;border:1px solid var(--surface-3);border-radius:var(--r-md);cursor:pointer;font-size:.85rem;transition:border-color .15s}',
      '.ap-payment-item:hover{border-color:var(--primary)}',
      '.ap-payment-item input{accent-color:var(--primary);cursor:pointer}',
      '.ap-genre-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}',
      '.ap-genre-item{display:flex;align-items:center;justify-content:center;gap:6px;padding:12px 8px;border:1px solid var(--surface-3);border-radius:var(--r-md);cursor:pointer;font-size:.9rem;font-weight:600;color:var(--ink-2);transition:all .15s;background:var(--white)}',
      '.ap-genre-item input{display:none}',
      '.ap-genre-item:hover{border-color:var(--primary)}',
      '.ap-genre-item:has(input:checked){border-color:var(--primary);background:rgba(232,80,26,.06);color:var(--primary)}',
    ].join('');
    document.head.appendChild(s);
  }
});
