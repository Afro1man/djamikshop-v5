# Edge Function : `share`

Sert un HTML avec balises Open Graph dynamiques pour que les liens partagés sur WhatsApp / Facebook / Twitter affichent une preview riche du produit (image, titre, prix).

## Comment ça marche

```
Bot WhatsApp ─► /functions/v1/share?id=abc123
                ├─► fetch product depuis Supabase
                └─► retourne HTML avec og:image, og:title, og:description du produit

Vrai user   ─► /functions/v1/share?id=abc123
                └─► reçoit le même HTML qui contient un meta-refresh + JS redirect
                    vers /pages/product-details.html?id=abc123
```

## Déploiement

### Prérequis
- [Supabase CLI](https://supabase.com/docs/guides/cli) installé : `npm i -g supabase`
- Connecté : `supabase login`

### 1. Lier le projet

```bash
cd <racine-projet>
supabase link --project-ref iiswzieybgcqrywvopsf
```

### 2. Configurer la variable `SITE_URL`

Adapter à l'URL publique du site (où vit `/pages/product-details.html`).

```bash
supabase secrets set SITE_URL=https://djamikshop.com
```

> Si tu héberges sur GitHub Pages : `https://<user>.github.io/djamikshop-v5`
> Sur Vercel/Netlify : `https://djamikshop.vercel.app`

`SUPABASE_URL` et `SUPABASE_ANON_KEY` sont injectées automatiquement par Supabase.

### 3. Déployer

```bash
supabase functions deploy share --no-verify-jwt
```

Le flag `--no-verify-jwt` est essentiel : la fonction est publique, lue par des bots non authentifiés.

### 4. Vérifier

L'URL devient :
```
https://iiswzieybgcqrywvopsf.supabase.co/functions/v1/share?id=<productId>
```

Tester avec :
- [Facebook Sharing Debugger](https://developers.facebook.com/tools/debug/) — voir l'aperçu OG
- WhatsApp : envoyer le lien à soi-même, vérifier la preview après quelques secondes
- `curl -I` pour voir les headers
- `curl https://...co/functions/v1/share?id=<productId>` pour voir le HTML

## RLS (Row Level Security)

La fonction utilise la `SUPABASE_ANON_KEY`. La table `products` doit autoriser le `SELECT` public pour qu'elle puisse lire :

```sql
create policy "Public read on products"
  on products for select
  using (true);
```

Si seules les annonces non vendues doivent être partageables :

```sql
create policy "Public read non-sold"
  on products for select
  using (sold = false);
```

## Cache

Le HTML est mis en cache **5 min côté navigateur** et **10 min côté CDN** (`Cache-Control: public, max-age=300, s-maxage=600`). Suffisant pour absorber les pics de partage sans surcharger Supabase.

Si tu modifies un produit (titre, prix, image) et veux que le nouveau preview apparaisse immédiatement sur WhatsApp, attendre l'expiration du cache OU refaire un partage 10 min plus tard.

## Coûts

Free tier Supabase : 500 000 invocations / mois. Largement suffisant pour démarrer.
