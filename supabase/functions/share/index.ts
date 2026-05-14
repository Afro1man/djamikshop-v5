// ═══════════════════════════════════════════════════════════════════
//  EDGE FUNCTION : share
//  Sert un HTML avec balises Open Graph dynamiques pour qu'au partage
//  WhatsApp / Facebook / Twitter, le lien affiche image + titre + prix
//  du produit. Redirige les vrais utilisateurs vers la fiche produit.
//
//  Déploiement :
//    supabase functions deploy share --no-verify-jwt
//
//  URL résultante :
//    https://{project-id}.supabase.co/functions/v1/share?id={productId}
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

// URL publique du site (où vit la vraie fiche produit)
// À ajuster selon ton hébergement (GitHub Pages, Vercel, Netlify, custom domain).
const SITE_URL = Deno.env.get('SITE_URL') || 'https://djamikshop.com';

// Détecte les crawlers sociaux (WhatsApp, Facebook, Twitter, etc.)
function isCrawler(ua: string): boolean {
  if (!ua) return false;
  return /WhatsApp|facebookexternalhit|facebookcatalog|Twitterbot|LinkedInBot|Discordbot|Slackbot|TelegramBot|Pinterest|Skypeuripreview|Embedly|Bingbot|Googlebot|DuckDuckBot|YandexBot|Applebot/i.test(ua);
}

// Bloque la vérification JWT (cette fonction est publique, lue par des bots)
Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  const ua  = req.headers.get('user-agent') || '';
  const bot = isCrawler(ua);

  // Récupère le productId depuis ?id=... ou /share/{id}
  const idFromQuery = url.searchParams.get('id');
  const idFromPath  = url.pathname.split('/').filter(Boolean).pop();
  const productId = idFromQuery || (idFromPath !== 'share' ? idFromPath : null);

  // Pas de productId → bot voit le site générique, humain redirigé vers home
  if (!productId) {
    if (bot) return generic();
    return Response.redirect(`${SITE_URL}/pages/index.html`, 302);
  }

  const productPageUrl = `${SITE_URL}/pages/product-details.html?id=${encodeURIComponent(productId)}`;

  // ⚡ Humain → redirige direct vers la fiche produit (pas de page intermédiaire)
  if (!bot) return Response.redirect(productPageUrl, 302);

  // 🤖 Bot crawler → on lui sert le HTML avec balises OG dynamiques
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!
  );

  const { data: product, error } = await supabase
    .from('products')
    .select('id, title, description, price, city, image_url, created_at')
    .eq('id', productId)
    .single();

  if (error) console.error('[share] Supabase error:', error.message);
  if (error || !product) return generic();

  return buildProductHtml(product);
});

// ── HTML produit (avec OG dynamiques) ──
function buildProductHtml(p: any): Response {
  const price = formatPrice(p.price);
  const title = `${p.title} — ${price} · DjamikShop`;
  const desc  = (p.description || `${p.title} à ${p.city || 'Niger'} pour ${price}. Marketplace du Niger.`).slice(0, 200);

  // Image : image_url ou fallback OG du site
  let image: string;
  if (Array.isArray((p as any).images) && (p as any).images.length > 0) image = (p as any).images[0];
  else if (p.image_url)                                                  image = p.image_url;
  else                                                                   image = `${SITE_URL}/assets/icons/og-image.svg`;

  // Si l'image est relative, la rendre absolue
  if (image && !image.startsWith('http') && !image.startsWith('data:')) {
    image = image.startsWith('/') ? `${SITE_URL}${image}` : `${SITE_URL}/${image}`;
  }

  const productUrl = `${SITE_URL}/pages/product-details.html?id=${encodeURIComponent(p.id)}`;

  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>${esc(title)}</title>
  <meta name="description" content="${esc(desc)}">

  <!-- Open Graph -->
  <meta property="og:type" content="product">
  <meta property="og:title" content="${esc(title)}">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${esc(productUrl)}">
  <meta property="og:site_name" content="DjamikShop">
  <meta property="og:locale" content="fr_FR">

  <!-- Product specifics -->
  <meta property="product:price:amount" content="${p.price}">
  <meta property="product:price:currency" content="XOF">

  <!-- Twitter Card -->
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(title)}">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(image)}">

  <!-- Redirection (humains uniquement, les bots ignorent) -->
  <meta http-equiv="refresh" content="0; url=${esc(productUrl)}">
  <link rel="canonical" href="${esc(productUrl)}">

  <style>
    body { font-family: system-ui, -apple-system, sans-serif; max-width: 480px; margin: 60px auto; padding: 0 20px; text-align: center; color: #1e293b; }
    h1 { color: #E8501A; font-size: 1.5rem; margin: 12px 0; }
    img { max-width: 100%; border-radius: 12px; margin: 20px 0; }
    a { color: #E8501A; text-decoration: none; font-weight: 600; }
    .price { font-size: 1.25rem; color: #E8501A; font-weight: 800; }
  </style>
</head>
<body>
  <h1>DjamikShop</h1>
  <img src="${esc(image)}" alt="${esc(p.title)}" loading="eager">
  <p><strong>${esc(p.title)}</strong></p>
  <p class="price">${esc(price)}</p>
  <p>Redirection en cours…<br><a href="${esc(productUrl)}">Voir l'annonce maintenant</a></p>
  <script>window.location.replace(${JSON.stringify(productUrl)});</script>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      // Cache CDN 10 min, browser 5 min — pour réduire les appels Supabase
      'Cache-Control': 'public, max-age=300, s-maxage=600',
      // CORS permissif (les crawlers viennent de partout)
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ── HTML générique (fallback DjamikShop) ──
function generic(): Response {
  const desc = 'Achetez et vendez partout au Niger : Niamey, Zinder, Maradi, Tahoua, Agadez et plus. Paiement Mobile Money.';
  const image = `${SITE_URL}/assets/icons/og-image.svg`;
  const html = `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="UTF-8">
  <title>DjamikShop — La marketplace du Niger</title>
  <meta name="description" content="${esc(desc)}">
  <meta property="og:type" content="website">
  <meta property="og:title" content="DjamikShop — La marketplace du Niger">
  <meta property="og:description" content="${esc(desc)}">
  <meta property="og:image" content="${esc(image)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:url" content="${esc(SITE_URL)}">
  <meta property="og:site_name" content="DjamikShop">
  <meta property="og:locale" content="fr_FR">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="DjamikShop — La marketplace du Niger">
  <meta name="twitter:description" content="${esc(desc)}">
  <meta name="twitter:image" content="${esc(image)}">
  <meta http-equiv="refresh" content="0; url=${esc(SITE_URL)}/pages/index.html">
</head>
<body>
  <p>Redirection vers <a href="${esc(SITE_URL)}/pages/index.html">DjamikShop</a>…</p>
  <script>window.location.replace(${JSON.stringify(SITE_URL + '/pages/index.html')});</script>
</body>
</html>`;
  return new Response(html, {
    headers: {
      'Content-Type':  'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
      'Access-Control-Allow-Origin': '*'
    }
  });
}

// ── Helpers ──
function esc(s: any): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPrice(n: number): string {
  if (!n && n !== 0) return '—';
  return new Intl.NumberFormat('fr-FR').format(n) + ' FCFA';
}
