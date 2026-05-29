# DjamikShop v1.2.41 — Mémoire projet pour Claude

Document de référence pour reprendre le travail après reset du contexte.
**À lire EN PREMIER à chaque nouvelle session** avant toute modification.

---

## 🔥 V2 — Pivot majeur (mai 2026)

Refonte du modèle économique pour la survie long terme au Niger.

### Changements clés
- **Annonces illimitées et 100% gratuites** (plus de quotas free/VIP/Premium)
- **Boosters à l'unité** au lieu d'abonnements mensuels
  - 1 booster = 7 jours en haut des résultats (étoile dorée)
  - 2 boosters = section Vedette (bordure brillante, en haut de l'accueil), 7 jours
  - **Les boosters n'expirent JAMAIS** (argument commercial central)
  - 1 booster offert à l'inscription + 1 offert à tous les users existants (backfill migration 34)
- **3 packs Mynita** (paiement +227 89 77 00 02, validation admin manuelle) :
  - Starter : 3 boosters / 1 200 FCFA
  - Business : 10 boosters / 3 500 FCFA
  - Pro : 25 boosters / 7 500 FCFA
- **Messagerie interne SUPPRIMÉE** → tout passe par WhatsApp
  - Bouton vert "Contacter sur WhatsApp" sur chaque fiche produit
  - Message pré-rempli : "Bonjour, je suis intéressé par votre annonce [titre]…"
  - Tables `messages` + `conversations` DROP (migration 35)
  - Champ obligatoire `profiles.whatsapp_number` au signup
- **Système d'offres caché** (table conservée, UI retirée — bouton + lien menu) car tout passe par WhatsApp
- **VIP/Premium suspendus** (code conservé mais UI cachée)

### Pages clés V2
- `/pages/buy-boosters.html` — achat de packs avec affichage stock temps réel
- Page `tarifs.html` → redirige vers `buy-boosters.html`
- `/pages/comment-ca-marche.html` — mise à jour : WhatsApp + boosters

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
- ⛔ **SUPPRIMÉ en V2** (migration 35) — remplacé par WhatsApp deep links

### Notifications
- Table `notifications` (insert via RLS, RPC pour admin)
- Page notifications avec realtime
- Bouton supprimer
- Push web notifications (VAPID + edge function `send-push`)
- Bandeau "Activer notifs" sur page messages

### Offres
- ⛔ **UI cachée en V2** (bouton fiche + lien menu retirés) — table conservée
- Table `offers` (buyer_id, product_id, amount, status, note)
- Logique : tout passe par WhatsApp maintenant

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

### Sponsorisation (ANCIEN — VIP/Premium suspendus en V2)
- Code conservé mais UI cachée — voir section V2 en haut

### Économie boosters (V2)
- Table `user_boosters` (user_id, count, total_received, total_spent)
- Table `booster_purchases` (audit + historique signup_gift/purchase/admin_grant/migration_v2)
- Colonne `boosts.vedette` boolean
- RPCs : `my_booster_stock()`, `use_booster(product_id, vedette)`, `buy_booster_pack(pack, payment_method, note)`, `admin_confirm_booster_purchase(ref)`, `grant_booster(user_id, qty, source)`
- Trigger `on_user_signup_gift_booster` sur auth.users → 1 booster gratuit
- Validation admin via flow `payment_requests` existant (admin_note = `"PURCHASE_ID:..."`, tier = `"booster_pack:starter|business|pro"`)
- Vue `v2_stats` pour dashboard admin
- `tier_listing_limit()` renvoie 999999 (annonces illimitées)

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
34_booster_economy.sql              V2 : économie boosters à l'unité, annonces illimitées, backfill 1 booster + notif V2 à tous les users
35_whatsapp_drop_messaging.sql      Ajoute profiles.whatsapp_number, drop messages + conversations + bump_conversation + validate_message_insert
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
10. **Notifications schema** : colonnes = `user_id, type, title, body, data` (PAS `message`/`link`). Pour le lien, mettre dans `data: {"link":"/pages/..."}`. Erreur facile à faire si on relit du vieux code.
11. **Types notifications** : check constraint accepte uniquement `'order','offer','message','system','promo','subscription','boost','report'`. Pour les notifs boosters V2, réutiliser `'subscription'`.
12. **`buy_booster_pack`** crée à la fois un row dans `booster_purchases` ET un `payment_requests` pour que le flow admin existant marche. Le tier vaut `'booster_pack:starter|business|pro'`.
13. **WhatsApp deep link** : normaliser le numéro — si 8 chiffres locaux, préfixer `227`. Format final `https://wa.me/<digits>?text=<encoded>`.

## ⚠️ État config Auth (mai 2026)

- **"Confirm email" DÉSACTIVÉ** dans Supabase (Auth → Providers → Email)
  - Raison : Resend en mode testing (sans domaine vérifié), ne peut envoyer qu'à maliksaley19@gmail.com (erreur SMTP `550 You can only send testing emails to your own email address`)
  - Workaround : email vérif désactivée, users peuvent signer avec emails bidons mais s'inscrivent instantanément
  - **À faire dès domaine acquis** : vérifier domaine sur Resend → re-activer Confirm email dans Supabase
- **Google OAuth ACTIVÉ** : fonctionne nickel, bypass email vérif (Google vérifie déjà)

## 🚧 Pending / TODO

1. **Notifications intelligentes** (P3 V2) :
   - 50 vues sans booster → suggestion d'améliorer photos
   - Vendeur inactif 2 semaines → nudge
   - Booster expiré → propo renouvellement
   - Première vente → célébration + suggestion booster
2. **Dashboard admin V2** : utiliser vue `v2_stats` (revenue, boosters circulation/consumed, active vedette, etc.)
3. **Acheter un domaine** (djamikshop.com / .ne) → vérifier sur Resend → re-activer Confirm email
4. **Keystore release** : signer APK pour Play Store
5. **Compte Google Play Developer** : 25$ à payer + vérif 24-48h
6. **Screenshots Play Store** : 2-8 captures à faire
7. **Description longue Play Store** : 4000 caractères à rédiger
8. **Plugins Capacitor natifs** (optionnel) : @capacitor/camera, /push-notifications, /share, /network, /preferences

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

- **Version** : v1.2.41 sur prod (Vercel + APK debug sur tel)
- **V2 livrée** : économie boosters + WhatsApp + annonces illimitées + offres cachées
- **Migrations 34 + 35** : exécutées en prod Supabase
- **Admin panel** : complet avec hiérarchie staff
- **Phase** : test grandeur nature WhatsApp en cours (avant Play Store)
