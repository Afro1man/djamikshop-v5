// ═══════════════════════════════════════════════════════════════════
//  FEATURES / AUTH — Strict Supabase Auth
//  Plus de mode démo localStorage. Tout passe par Supabase :
//   - signup → _sb().auth.signUp (un trigger DB crée le profile)
//   - login  → _sb().auth.signInWithPassword
//   - logout → _sb().auth.signOut
//  Le user.id (UUID) est cached dans `dj_user_id` pour le scoping
//  state.js (rapide, sync). Maintenu à jour via onAuthStateChange.
// ═══════════════════════════════════════════════════════════════════

// Garde anti-double-load
if (window._authLoaded) {
  // skip
} else {
  window._authLoaded = true;

// Helper : retourne le client Supabase courant. Lu dynamiquement car
// peut être initialisé après le chargement de ce script (ordre des modules).
function _sb() { return window._supabase; }

// ─── Cache du user_id pour le scoping (state.js) ───
function _setUserCache(user) {
  if (user && user.id) localStorage.setItem('dj_user_id', user.id);
  else                 localStorage.removeItem('dj_user_id');
}

// Initialisation : récupère la session courante et synchronise le cache
if (_sb() && _sb().auth) {
  // Au load, sync le cache si une session existe déjà (cookie/localStorage Supabase)
  _sb().auth.getSession().then(function(r) {
    if (r && r.data && r.data.session) _setUserCache(r.data.session.user);
    else                                _setUserCache(null);
  }).catch(function() {});

  // Maintient le cache à jour quand la session change (login/logout/refresh)
  _sb().auth.onAuthStateChange(function(event, session) {
    _setUserCache(session ? session.user : null);
  });
}

// ─── PUBLIC API ───
window.requireAuth = async function(redirectUrl) {
  var next = redirectUrl || window.location.href;
  if (!_sb()) {
    window.toast && window.toast('Service indisponible. Réessayez plus tard.', 'error');
    return null;
  }
  var res = await _sb().auth.getSession();
  if (!res || !res.data || !res.data.session) {
    window.toast && window.toast('Connectez-vous pour continuer.', 'info');
    setTimeout(function(){ window.location.href = 'login.html?next=' + encodeURIComponent(next); }, 900);
    return null;
  }
  return res.data.session.user;
};

window.logout = async function() {
  if (_sb()) await _sb().auth.signOut().catch(function(){});
  _setUserCache(null);
  // Nettoie aussi l'ancienne clé démo (rétrocompat)
  localStorage.removeItem('dj_demo_session');
  window.toast && window.toast('À bientôt !', 'default');
  setTimeout(function(){ window.location.href = 'login.html'; }, 600);
};

// Helper sync : retourne le user_id courant (depuis le cache)
window.currentUserId = function() {
  return localStorage.getItem('dj_user_id') || null;
};

// Helper async : retourne le user complet depuis Supabase
window.currentUser = async function() {
  if (!_sb()) return null;
  try {
    var r = await _sb().auth.getSession();
    return r && r.data && r.data.session ? r.data.session.user : null;
  } catch(e) { return null; }
};

async function redirectIfAuth() {
  var params = new URLSearchParams(window.location.search);
  var next = params.get('next') || 'index.html';
  if (!_sb()) return;
  var res = await _sb().auth.getSession().catch(function(){ return {data:{}}; });
  if (res.data && res.data.session) {
    _setUserCache(res.data.session.user);
    window.location.href = next;
  }
}

// ─── RATE LIMITER (5 essais / 60 sec) ───
var RATE_KEY = 'dj_login_attempts', MAX_TRIES = 5, LOCKOUT_SEC = 60;
function getRateState() { try { return JSON.parse(localStorage.getItem(RATE_KEY) || '{"count":0,"until":0}'); } catch(e){ return {count:0,until:0}; } }
function isLocked() { var s = getRateState(); if (s.until && Date.now() < s.until) return Math.ceil((s.until - Date.now()) / 1000); return 0; }
function recordFail() { var s = getRateState(); s.count = (s.count||0) + 1; if (s.count >= MAX_TRIES) s.until = Date.now() + LOCKOUT_SEC * 1000; localStorage.setItem(RATE_KEY, JSON.stringify(s)); return Math.max(0, MAX_TRIES - s.count); }
function resetRate() { localStorage.removeItem(RATE_KEY); }

// ─── PASSWORD STRENGTH ───
window.checkPasswordStrength = function(pwd) {
  var score = 0, tips = [];
  if (pwd.length >= 8) score++; else tips.push('8 caractères min');
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd)) score++; else tips.push('majuscule');
  if (/[0-9]/.test(pwd)) score++; else tips.push('chiffre');
  if (/[^A-Za-z0-9]/.test(pwd)) score++; else tips.push('symbole');
  var levels = [
    {label:'Très faible',color:'#ef4444'}, {label:'Faible',color:'#f59e0b'},
    {label:'Moyen',color:'#eab308'}, {label:'Fort',color:'#10b981'}, {label:'Excellent',color:'#3b82f6'}
  ];
  return { score: score, level: levels[Math.min(score,4)], tips: tips };
};

window.attachStrengthMeter = function(inputId, meterId) {
  var inp = document.getElementById(inputId), met = document.getElementById(meterId);
  if (!inp || !met) return;
  inp.addEventListener('input', function() {
    if (!inp.value) { met.innerHTML = ''; return; }
    var r = window.checkPasswordStrength(inp.value);
    var pct = (r.score/5*100) + '%';
    var tip = r.tips.length ? 'Ajouter : ' + r.tips.slice(0,2).join(', ') : 'Super mot de passe ✓';
    met.innerHTML = '<div class="strength-bar-wrap"><div class="strength-bar-fill" style="width:'+pct+';background:'+r.level.color+'"></div></div><div class="strength-label" style="color:'+r.level.color+'">'+r.level.label+' — <span style="color:var(--ink-3);font-weight:400">'+tip+'</span></div>';
  });
};

window.attachShowHide = function(inputId, btnId) {
  var inp = document.getElementById(inputId), btn = document.getElementById(btnId);
  if (!inp || !btn) return;
  btn.addEventListener('click', function(e) {
    e.preventDefault();
    var show = inp.type === 'password';
    inp.type = show ? 'text' : 'password';
    btn.innerHTML = show
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19m-6.72-1.07a3 3 0 11-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>';
  });
};

// ─── VALIDATION ───
function fieldOk(id, valid, msg) {
  var el = document.getElementById(id), fb = document.getElementById(id + '-feedback');
  if (!el) return;
  el.classList.toggle('input-valid', valid);
  el.classList.toggle('input-invalid', !valid && !!msg);
  if (fb) {
    if (valid) fb.innerHTML = '<svg class="dj-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
    else fb.textContent = msg || '';
    fb.className = 'field-feedback ' + (valid ? 'ok' : 'err');
  }
}

function startLockout(sec, btn, label) {
  btn.disabled = true;
  var t = setInterval(function() {
    sec--;
    btn.textContent = label + ' (' + sec + 's)';
    if (sec <= 0) { clearInterval(t); btn.disabled = false; btn.textContent = label; resetRate(); }
  }, 1000);
}

// ═══════════════════════════════════════════════════════════════════
//  LOGIN
// ═══════════════════════════════════════════════════════════════════
var loginForm = document.getElementById('login-form');
if (loginForm) {
  redirectIfAuth();
  window.attachShowHide('password', 'pwd-toggle');

  var rem0 = isLocked();
  if (rem0 > 0) {
    var sb0 = loginForm.querySelector('[type=submit]');
    startLockout(rem0, sb0, 'Se connecter');
    if (!document.getElementById('reset-attempts-link')) {
      var link = document.createElement('div');
      link.id = 'reset-attempts-link';
      link.style.cssText = 'margin-top:10px;text-align:center;font-size:.78rem';
      link.innerHTML = '<a href="#" style="color:var(--ink-3);text-decoration:underline">Réinitialiser les tentatives</a>';
      link.querySelector('a').addEventListener('click', function(e) {
        e.preventDefault();
        resetRate();
        sb0.disabled = false;
        sb0.textContent = 'Se connecter';
        link.remove();
        window.toast && window.toast('Tentatives réinitialisées.', 'success');
      });
      loginForm.appendChild(link);
    }
  }

  var emailInp = document.getElementById('email');
  if (emailInp) emailInp.addEventListener('blur', function() {
    fieldOk('email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInp.value.trim()), 'Email invalide');
  });

  loginForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = loginForm.querySelector('[type=submit]');
    var email = document.getElementById('email').value.trim();
    var pwd = document.getElementById('password').value;

    var locked = isLocked();
    if (locked) { window.toast('Trop de tentatives. Réessayez dans ' + locked + 's.', 'error'); return; }
    if (!email || !pwd) { window.toast('Remplissez tous les champs.', 'error'); return; }
    if (!_sb()) { window.toast('Service indisponible.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Connexion…';

    var res = await _sb().auth.signInWithPassword({ email: email, password: pwd })
      .catch(function(err){ return { error: err }; });

    if (res.error) {
      recordFail();
      var lk = isLocked();
      if (lk > 0) { window.toast('Compte verrouillé 60s.', 'error'); startLockout(lk, btn, 'Se connecter'); }
      else {
        var raw = (res.error.message || '').toLowerCase();
        var friendly;
        if (raw.indexOf('email not confirmed') !== -1)         friendly = 'Email non vérifié. Cliquez sur le lien dans votre boîte mail pour activer votre compte.';
        else if (raw.indexOf('invalid login credentials') !== -1) friendly = 'Email ou mot de passe incorrect.';
        else if (raw.indexOf('rate limit') !== -1)             friendly = 'Trop de tentatives, attendez 1 minute.';
        else                                                    friendly = res.error.message || 'Erreur de connexion';
        window.toast(friendly, 'error', 5000);
        btn.disabled = false; btn.innerHTML = 'Se connecter';
      }
      return;
    }

    resetRate();
    if (res.data && res.data.user) _setUserCache(res.data.user);
    window.toast('Connexion réussie !', 'success');
    var p = new URLSearchParams(window.location.search);
    setTimeout(function(){ window.location.href = p.get('next') || 'index.html'; }, 800);
  });
}

// ═══════════════════════════════════════════════════════════════════
//  SIGNUP
// ═══════════════════════════════════════════════════════════════════
var signupForm = document.getElementById('signup-form');
if (signupForm) {
  redirectIfAuth();
  window.attachShowHide('password', 'pwd-toggle');
  window.attachShowHide('confirm', 'conf-toggle');
  window.attachStrengthMeter('password', 'pwd-strength');

  // Populate cities
  var locSelect = document.getElementById('location');
  if (locSelect && window.APP && window.APP.cities) {
    locSelect.innerHTML = '<option value="">Choisir une ville</option>' +
      window.APP.cities.map(function(c){ return '<option value="' + c + '">' + c + '</option>'; }).join('');
  }

  var nameInp = document.getElementById('full_name');
  if (nameInp) nameInp.addEventListener('input', function(){ fieldOk('full_name', nameInp.value.trim().length >= 2, 'Min. 2 caractères'); });

  var emailSu = document.getElementById('email');
  if (emailSu) emailSu.addEventListener('blur', function(){
    var ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailSu.value.trim());
    fieldOk('email', ok, 'Format invalide');
  });

  var pwdInp = document.getElementById('password'), cnfInp = document.getElementById('confirm');
  if (cnfInp && pwdInp) cnfInp.addEventListener('input', function(){
    fieldOk('confirm', cnfInp.value === pwdInp.value && cnfInp.value.length > 0, 'Mots de passe différents');
  });

  // ── Honeypot : marque le timestamp d'ouverture du formulaire ──
  var hpStart = document.getElementById('hp-formstart');
  if (hpStart) hpStart.value = Date.now().toString();

  signupForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = signupForm.querySelector('[type=submit]');
    var fname = document.getElementById('full_name').value.trim();
    var email = document.getElementById('email').value.trim();
    var pwd = document.getElementById('password').value;
    var cnf = document.getElementById('confirm').value;
    var phone = (document.getElementById('phone') || {value:''}).value.trim();
    var whatsapp = (document.getElementById('whatsapp_number') || {value:''}).value.trim();
    var location = (document.getElementById('location') || {value:''}).value;
    var terms = document.getElementById('terms');

    // ── HONEYPOT CHECKS (silencieux : un bot ne voit pas l'erreur, on simule un succes) ──
    var hpWebsite = (document.getElementById('hp-website') || {value:''}).value;
    var hpEmail2  = (document.getElementById('hp-email2')  || {value:''}).value;
    var hpStartVal = parseInt((document.getElementById('hp-formstart') || {value:'0'}).value, 10) || 0;
    var elapsedMs = Date.now() - hpStartVal;
    if (hpWebsite || hpEmail2) {
      // Un humain ne remplit JAMAIS ces champs (cache hors viewport + tabindex -1)
      console.warn('[anti-spam] honeypot triggered');
      // Faux success pour ne pas alerter le bot
      btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Création…';
      setTimeout(function(){ window.toast('Compte créé ! Vérifie ton email.', 'success'); btn.disabled = false; btn.innerHTML = 'Créer mon compte'; }, 1500);
      return;
    }
    if (hpStartVal > 0 && elapsedMs < 2000) {
      // Submit en <2s = humain impossible, c'est un bot
      console.warn('[anti-spam] form filled too fast', elapsedMs, 'ms');
      setTimeout(function(){ window.toast('Compte créé ! Vérifie ton email.', 'success'); }, 1500);
      return;
    }

    if (fname.length < 2) { window.toast('Nom trop court.', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { window.toast('Email invalide.', 'error'); return; }
    if (pwd.length < 8) { window.toast('Mot de passe : 8 caractères min.', 'error'); return; }
    if (pwd !== cnf) { window.toast('Les mots de passe ne correspondent pas.', 'error'); return; }
    if (window.checkPasswordStrength(pwd).score < 2) { window.toast('Mot de passe trop faible.', 'error'); return; }
    if (terms && !terms.checked) { window.toast('Acceptez les conditions.', 'error'); return; }
    if (!whatsapp || whatsapp.length < 6) { window.toast('Numéro WhatsApp requis (pour qu\'on te contacte).', 'error'); return; }
    if (!_sb()) { window.toast('Service indisponible.', 'error'); return; }

    btn.disabled = true; btn.innerHTML = '<span class="btn-spinner"></span> Création…';

    var res = await _sb().auth.signUp({
      email: email,
      password: pwd,
      options: {
        data: { full_name: fname, whatsapp_number: whatsapp, phone: phone, location: location },
        emailRedirectTo: window.location.origin + '/pages/auth-callback.html'
      }
    }).catch(function(err){ return { error: err }; });

    // Met a jour profile avec WhatsApp + phone + location (le trigger handle_new_user gere full_name)
    if (res && res.data && res.data.user && res.data.user.id) {
      try {
        await _sb().from('profiles').update({
          whatsapp_number: whatsapp,
          phone: phone || null,
          location: location || null
        }).eq('id', res.data.user.id);
      } catch(e) {}
    }

    if (res.error) {
      var raw = (res.error.message || '').toLowerCase();
      var friendly;
      if (raw.indexOf('already registered') !== -1 || raw.indexOf('already exists') !== -1) {
        friendly = 'Cet email est déjà utilisé. Essayez de vous connecter.';
      } else {
        friendly = res.error.message || 'Erreur lors de la création';
      }
      window.toast(friendly, 'error', 5000);
      btn.disabled = false; btn.innerHTML = 'Créer mon compte';
      return;
    }

    if (res.data && res.data.user) {
      // Le profile est auto-créé via le trigger handle_new_user.
      // On le complète avec phone + location si fournis.
      if (phone || location) {
        try {
          await _sb().from('profiles').upsert({
            id: res.data.user.id,
            full_name: fname,
            email: email,
            phone: phone || null,
            location: location || null,
            updated_at: new Date().toISOString()
          });
        } catch(e) { /* trigger a déjà fait l'essentiel */ }
      }
      _setUserCache(res.data.user);
    }

    // Si la session est immédiate (email confirmation désactivée) → home
    if (res.data && res.data.session) {
      window.toast('Bienvenue sur DjamikShop !', 'success');
      setTimeout(function(){ window.location.href = 'index.html'; }, 1000);
    } else {
      window.toast('Compte créé ! Vérifiez votre email pour activer votre compte.', 'success', 6000);
      setTimeout(function(){ window.location.href = 'login.html'; }, 2500);
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════════════
var forgotForm = document.getElementById('forgot-form');
if (forgotForm) {
  forgotForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = forgotForm.querySelector('[type=submit]');
    var email = (document.getElementById('email') || {}).value.trim();
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { window.toast('Email invalide.', 'error'); return; }
    if (!_sb()) { window.toast('Service indisponible.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Envoi…';

    try {
      var redirectTo = window.location.origin + '/pages/reset-password.html';
      await _sb().auth.resetPasswordForEmail(email, { redirectTo: redirectTo });
      window.toast('Lien envoyé ! Vérifiez votre boîte mail.', 'success', 5000);
      setTimeout(function(){ window.location.href = 'login.html'; }, 2000);
    } catch(err) {
      window.toast('Erreur : ' + (err.message || 'impossible d\'envoyer le lien.'), 'error');
      btn.disabled = false;
      btn.innerHTML = 'Envoyer le lien';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  RESET PASSWORD
// ═══════════════════════════════════════════════════════════════════
var resetForm = document.getElementById('reset-form');
if (resetForm) {
  window.attachShowHide('new-password', 'npwd-toggle');
  window.attachShowHide('new-confirm',  'ncnf-toggle');
  window.attachStrengthMeter('new-password', 'npwd-strength');

  resetForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    var btn = resetForm.querySelector('[type=submit]');
    var newPwd = (document.getElementById('new-password') || {}).value;
    var confirm = (document.getElementById('new-confirm') || {}).value;

    if (newPwd.length < 8) { window.toast('8 caractères minimum.', 'error'); return; }
    if (newPwd !== confirm) { window.toast('Les mots de passe ne correspondent pas.', 'error'); return; }
    if (window.checkPasswordStrength(newPwd).score < 2) { window.toast('Mot de passe trop faible.', 'error'); return; }
    if (!_sb()) { window.toast('Service indisponible.', 'error'); return; }

    btn.disabled = true;
    btn.innerHTML = '<span class="btn-spinner"></span> Mise à jour…';

    try {
      // L'utilisateur arrive via le lien email qui a déjà créé une session temporaire.
      var res = await _sb().auth.updateUser({ password: newPwd });
      if (res.error) throw res.error;
      window.toast('Mot de passe mis à jour !', 'success');
      setTimeout(function(){ window.location.href = 'login.html'; }, 1500);
    } catch(err) {
      window.toast('Erreur : ' + (err.message || 'impossible de réinitialiser.'), 'error');
      btn.disabled = false;
      btn.innerHTML = 'Réinitialiser';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════
//  GOOGLE OAUTH (login + signup)
// ═══════════════════════════════════════════════════════════════════
async function signInWithGoogle(btn) {
  if (!_sb()) { window.toast && window.toast('Service indisponible.', 'error'); return; }
  if (btn) {
    btn.disabled = true;
    var originalHtml = btn.innerHTML;
    btn.innerHTML = '<span class="btn-spinner"></span> Connexion à Google…';
  }
  try {
    var redirectTo = window.location.origin + '/pages/auth-callback.html';
    var res = await _sb().auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo,
        queryParams: { access_type: 'offline', prompt: 'select_account' }
      }
    });
    // Si pas d'erreur, le navigateur va etre redirige automatiquement vers Google
    if (res && res.error) throw res.error;
  } catch(err) {
    if (btn) { btn.disabled = false; btn.innerHTML = originalHtml; }
    var msg = (err && err.message) || 'Erreur de connexion Google.';
    window.toast && window.toast(msg, 'error', 5000);
    console.warn('[google oauth]', err);
  }
}
window.signInWithGoogle = signInWithGoogle;

// Wire les boutons Google sur login + signup
var btnGLogin  = document.getElementById('btn-google-login');
var btnGSignup = document.getElementById('btn-google-signup');
if (btnGLogin)  btnGLogin.addEventListener('click',  function(){ signInWithGoogle(btnGLogin);  });
if (btnGSignup) btnGSignup.addEventListener('click', function(){ signInWithGoogle(btnGSignup); });

} // fin garde anti-double-load
