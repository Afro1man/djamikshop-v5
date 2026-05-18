# DjamikShop v1.2.5 — Mémoire projet pour Claude

Document de référence pour reprendre le travail après reset du contexte.
**À lire EN PREMIER à chaque nouvelle session** avant toute modification.

---

## 🎯 Le projet

**DjamikShop** — Marketplace 100% nigérienne (Niger 🇳🇪).
- **Stack** : Vanilla HTML/JS/CSS (no framework) + Supabase + Vercel + Capacitor (APK Android)
- **Repo** : https://github.com/Afro1man/djamikshop-v5
- **Production web** : https://djamikshop-v5.vercel.app
- **Owner** : Malik (Afro1man, maliksaley19@gmail.com)
- **WhatsApp support** : +227 89 77 00 02
- **Slogan** : "Tout se vend ici" — La marketplace du Niger

## 📦 Architecture racine

```
djamikshop-v5/
├── assets/               # Source CSS + JS
│   ├── css/main.css      # Avec @import pour components/
│   └── js/
│       ├── app.js        # Bootloader (modules critiques + lazy)
│       ├── core/         # Modules transverses (config, state, auth helpers, sponsor, etc.)
│       ├── components/   # shell.js (navbar+menu), bottom-nav.js, ui.js
│       └── features/     # auth, products, messages, my-profile, add-product, offers, etc.
├── pages/                # Toutes les pages HTML
├── supabase/migrations/  # 23 migrations SQL numérotées
├── www/                  # Copie pour Capacitor (sync via npx cap sync)
├── android/              # Projet Android Capacitor (généré, gitignored sauf src)
├── sw.js                 # Service Worker (cache, push)
├── manifest.webmanifest  # PWA manifest
├── capacitor.config.json # webDir: "www", appId: com.djamikshop.app
└── package.json          # @capacitor/core, /cli, /android, /app
```

## 🛠 Workflow modifications

**Toute modification UI/code doit :**
1. Éditer le fichier source dans `assets/` ou `pages/`
2. Copier vers `www/` si on veut que l'APK ait la maj : `cp <file> www/<same path>`
3. Pour Capacitor : `npx cap sync android` (re-bundle)
4. Bumper `sw.js` VERSION (v1.2.X → v1.2.X+1) pour invalider le SW cache
5. `git commit + push` → Vercel déploie auto
6. Pour rebuild APK : `cd android && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew.bat installDebug` (tel branché en USB)

## 🔑 Variables clés (en mémoire)

- Admin user (Malik) : `e21f27dc-697a-4543-bb2a-01b9f4bbd69d`
- Supabase URL : `https://iiswzieybgcqrywvopsf.supabase.co`
- Resend SMTP : configuré dans Supabase Dashboard (3000 mails/mois free)
- "Confirm email" : ACTIVÉ dans Supabase Auth
- Mobile Money : Mynita + Amanata uniquement (Orange/Airtel/Moov SUPPRIMÉS)
- Numéro WhatsApp business : `+227 89 77 00 02`

## ✅ Features livrées (v1.2.5)

### Compte vendeur
- Inscription email + verif obligatoire (Resend)
- Profil avec avatar, bio, ville, téléphone
- Public_id court `DJ-XXXXXX` (6 chars exclut 0/O/1/I)
- CRUD annonces : titre, description, prix, ville, catégorie, condition, 3 photos max, genre (homme/femme/enfant)
- Limite annonces actives : Free=10, VIP=50, Premium=100

### Messages chat
- Realtime Supabase (postgres_changes)
- Bouton supprimer (soft delete via `deleted_for` uuid[])
- Upload image (Supabase Storage `product-images`)
- Read receipts (✓✓)
- Typing indicator (broadcast channel)
- Card produit dans le header si conv liée
- Tri par last_message_at desc (auto-resort sur envoi/réception)

### Notifications
- Table `notifications` (insert via RLS, RPC pour admin)
- Page notifications avec realtime
- Bouton supprimer
- Push web notifications (VAPID + edge function `send-push`)
- Bandeau "Activer notifs" sur page messages

### Offres
- Table `offers` (buyer_id, product_id, amount, status, note)
- Pages "Mes offres" (Reçues/Envoyées) avec accept/reject/delete
- Soft delete `deleted_for`
- Validation par trigger (email vérif + rate limit 10/h + ban check)

### Signalements
- Table `reports` (reason, status, message)
- Modal avec 6 raisons (scam, forbidden, false_price, duplicate, offensive, other)
- Anti-doublon (1 par produit/user)
- Rate limit 5/h

### Géolocalisation
- 10 villes Niger avec coords GPS (Niamey, Zinder, Maradi, Tahoua, Agadez, Dosso, Diffa, Tillabéri, Birni-N'Konni, Arlit)
- Helpers `cityDistance`, `nearestCity`, `requestUserLocation` (cache 24h)
- Tri "Plus proche de moi" dans shop
- Distance affichée sur cartes produit
- Bandeau d'activation sur home

### Sponsorisation (système monétisation)
- 3 tiers : **Free** (10 annonces) / **VIP** 1500 FCFA/mois (50 ann + 5 boosts/j) / **Premium** 2500 FCFA/mois (100 ann + 15 boosts/j)
- Boost = 24h, anti-double-boost sur même annonce
- Section "Annonces vedette" sur home = **Premium boostés uniquement**
- Auto-downgrade quand abo expire + 48h grâce avant suppression annonces excédentaires
- Design VIP : étoile dorée + ruban "VIP" + bordure or animée
- Design Premium : diamant violet rotatif + ruban "PREMIUM" + bordure violette animée
- Promo `WELCOME50` : -50% sur 1er mois VIP = 750 FCFA (eligible si signup <30j + jamais payé)
- Paiement Mobile Money Mynita/Amanata au +227 89 77 00 02
- Code RPC `create_payment_request` génère un ref unique
- Admin valide via `admin_confirm_payment` / `admin_reject_payment`

### Sécurité
- RLS strict sur toutes les tables
- Rate limits : 10 offres/h, 100 msg/h, 5 reports/h, 3 annonces création/30j
- Triggers SQL pour insert validation (email vérif requise sauf messages)
- Auto-ban escalade : 5 incidents/h medium+ → 24h, puis 7j, puis perma
- Bandeau "Compte suspendu" full-screen overlay si banni (z-index 99999)
- Hide products des sellers bannis (RLS)
- Anti-spam emails (Resend SMTP custom au lieu du 3/h défaut Supabase)

### PWA + APK
- PWA installable iOS/Android (manifest + SW)
- Capacitor wrap pour vraie APK Android
- App bundlée dans `www/` (offline-ready pour le shell)
- Plugin `@capacitor/app` pour bouton retour (back-button.js)
- WebView fullscreen, zoom désactivé

### Admin panel (`/pages/admin*.html`)
- Dashboard `/pages/admin.html` : 9 stats + 2 sparklines (inscriptions 14j, annonces 14j)
- Signalements `/pages/admin-reports.html` : tabs En attente/Résolus/Rejetés, actions résoudre/rejeter/supprimer produit
- Utilisateurs `/pages/admin-users.html` : recherche par nom/ville/public_id, bouton Détail, bouton 🗑 (admin only)
- Détail user `/pages/admin-user-detail.html` : hero avec badge tier+ban+public_id, stats détaillées, sections annonces/signalements/paiements, boutons ban/promo staff/supprimer (admin only)
- Bans actifs `/pages/admin-bans.html` : liste avec durée restante, débannir
- Mots interdits `/pages/admin-words.html` : CRUD par catégorie
- Paiements `/pages/admin-payments.html` : tabs pending/confirmed/rejected, bouton "Nettoyer >30j" (admin only)
- Équipe `/pages/admin-staff.html` : liste admins+modérateurs, nomination par code court ou via bouton sur fiche user (admin only)
- Notifications admin temps réel : toast + bip WebAudio sur nouveau signalement/paiement/inscription
- Auto-check si user est admin/mod via `my_staff_role()` RPC

### Hiérarchie staff (v1.2.1+)
- **Admin** (role='admin') : tous pouvoirs, nomme/retire staff
- **Modérateur** (role='moderator') : modère contenu et users normaux
  - ❌ Ne peut PAS bannir/supprimer un staff
  - ❌ Ne peut PAS nommer/retirer staff
  - ❌ Ne peut PAS voir bouton "Équipe" ni supprimer définitivement
- `is_admin()` strict, `is_staff()` = admin OR moderator
- RLS policies adaptées

## 📋 Migrations SQL (chronologique)

```
00_full_schema.sql                  Schema initial (profiles, products, conversations, messages, orders, notifications, reviews, offers, wishlists, push_subscriptions) + RLS
01_security.sql                     security_events, banned_users, forbidden_words, auto-ban
02_delete_conversation.sql          Soft delete conversations
03_notif_insert_policy.sql          Policy INSERT notifications (anyone authenticated)
04_delete_offer.sql                 Soft delete offers
05_reports.sql                      Table reports + RLS
06_admin.sql                        Table admins, is_admin() function
07_admin_permissions.sql            Policies admin sur banned_users, forbidden_words, security_events
08_rate_limit_email_verif.sql       Rate limits + email vérif obligatoire
09_subscriptions.sql                Tables subscriptions, payment_requests, boosts + helpers tier
10_notif_type_subscription.sql      Ajoute 'subscription'/'boost'/'report' aux types notif
11_downgrade_grace.sql              process_expired_subscriptions() + my_subscription_info()
12_public_tier_lookup.sql           users_tiers(uuid[]) RPC publique
13_promo_welcome.sql                Promo WELCOME50
14_new_prices.sql                   VIP 3000→1500, Premium 5000→2500
15_cleanup_payment_methods.sql      Retire orange/airtel/moov des annonces existantes
16_product_genre.sql                Colonne products.genre text[] (homme/femme/enfant)
17_no_double_boost.sql              validate_boost_insert refuse si already_boosted
18_ban_enforcement.sql              Ban TikTok-style (hide products, block messages, etc.)
19_relax_message_verif.sql          Messages ne nécessitent plus email vérifié
20_fix_bump_conversation.sql        Fix: new.content → new.text (column name)
21_admin_delete_user.sql            RPC admin_delete_user + cleanup payments
22_moderators.sql                   Hiérarchie admin/moderator, is_staff()
23_public_user_id.sql               profiles.public_id 'DJ-XXXXXX'
```

## 🐛 Gotchas / pièges connus

1. **Capacitor : ne PAS mettre `webDir: "."`** — provoque "Cannot copy to subdir of itself". Toujours `webDir: "www"`.
2. **Trigger Postgres** : nom de colonne `text` pas `content` dans messages. Bump_conversation a été buggé là-dessus.
3. **RLS sur subscriptions** : on ne peut PAS lire les tiers des autres directement. Utiliser RPC `users_tiers(uuid[])`.
4. **Notifications onAuthStateChange** : ignorer `TOKEN_REFRESHED` (fire toutes les heures) pour pas reset le menu en plein milieu.
5. **CSS `display:none → block`** + transition : casse les anim. Utiliser `visibility:hidden + pointer-events:none`.
6. **Modules JS** : critiques (icons, config, utils, state, sponsor, staff, ban-check, auth, ui, shell, bottom-nav) dans `app.js` modules[] ; non-critiques (back-button, admin-realtime, pwa, share, payment, push, security, geo, email-verify) dans lazyModules[] (chargés via requestIdleCallback).
7. **Path absolu `/pages/...`** ne marche pas dans Capacitor → toujours relatif.
8. **Viewport meta** : Capacitor inclut `user-scalable=no, maximum-scale=1` partout.
9. **APK release** : pas encore signée (juste debug). Pour Play Store : faut keystore + AAB.

## 🚧 Pending / TODO

1. **Logo Djamik définitif** : user veut faire son logo (carte Niger + D noir). En attendant icône Android par défaut.
2. **Keystore release** : signer APK pour Play Store
3. **Compte Google Play Developer** : 25$ à payer + vérif 24-48h
4. **Screenshots Play Store** : 2-8 captures à faire
5. **Description longue Play Store** : 4000 caractères à rédiger
6. **Plugins Capacitor natifs** (optionnel, pour plus tard) : @capacitor/camera, /push-notifications, /share, /network, /preferences

## 📞 Commandes utiles

```bash
# Sync www → Android
npx cap sync android

# Build + install APK debug sur tel branché
cd android && JAVA_HOME="/c/Program Files/Android/Android Studio/jbr" ./gradlew.bat installDebug

# Check device ADB
$LOCALAPPDATA/Android/Sdk/platform-tools/adb.exe devices

# Bump SW + commit
# (edit sw.js VERSION)
# (cp source files to www/)
git add -A && git commit -m "..." && git push
```

## 🎨 Conventions

- **Toujours** bumper `sw.js` VERSION avant push (force le user à recharger)
- **Toujours** copier les fichiers modifiés vers `www/` ET faire `npx cap sync android` après chaque edit
- Messages commit en français OK, code en anglais
- **CSS** : variables dans `core/variables.css`, components dans `components/`
- **JS** : modules core/components/features, IIFE pour scope local
- Couleurs brand : orange `#E8501A`, gold (VIP) `#F5B100`, violet (Premium) `#7C3AED`
- Font : Outfit (titres) + Inter (corps), chargées via Google Fonts en async
- Preconnect : iiswzieybgcqrywvopsf.supabase.co + cdn.jsdelivr.net + fonts (sur toutes pages principales)

## 🔄 État au moment de l'écriture

- **Version** : v1.2.5 sur prod (Vercel + APK debug sur tel)
- **Sponsorisation** : 100% fonctionnelle, en test
- **Admin panel** : complet avec hiérarchie staff
- **Public_id** : généré pour tous les users
- **Phase** : test grandeur nature WhatsApp en cours (avant Play Store)
