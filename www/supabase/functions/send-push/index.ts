// ═══════════════════════════════════════════════════════════════════
//  EDGE FUNCTION : send-push
//  Envoie une notification Web Push à un ou plusieurs utilisateurs.
//
//  Body POST attendu :
//    {
//      "user_id": "user-xxx",                    // cible une personne
//      "user_ids": ["user-a", "user-b"],         // ou plusieurs
//      "endpoint": "https://fcm.googleapis…",    // ou un endpoint précis
//      "payload": {
//        "title": "Nouveau message",
//        "body":  "Ali : Bonjour, c'est dispo ?",
//        "url":   "/pages/messages.html",
//        "icon":  "/assets/icons/icon.svg",
//        "tag":   "msg-conv-123"
//      }
//    }
//
//  Au moins un de user_id, user_ids, endpoint doit être fourni.
//
//  Déploiement :
//    supabase secrets set VAPID_PRIVATE_KEY=…
//    supabase secrets set VAPID_PUBLIC_KEY=…
//    supabase secrets set VAPID_SUBJECT=mailto:contact@djamikshop.com
//    supabase functions deploy send-push
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import webpush from 'https://esm.sh/web-push@3.6.7';

const VAPID_PUBLIC  = Deno.env.get('VAPID_PUBLIC_KEY')!;
const VAPID_PRIVATE = Deno.env.get('VAPID_PRIVATE_KEY')!;
const VAPID_SUBJECT = Deno.env.get('VAPID_SUBJECT') || 'mailto:contact@djamikshop.com';

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return cors();
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  let body: any;
  try { body = await req.json(); }
  catch { return json({ error: 'Invalid JSON' }, 400); }

  const { user_id, user_ids, endpoint, payload } = body;
  if (!payload || !payload.title) return json({ error: 'Missing payload.title' }, 400);

  // 1. Récupère les subscriptions à notifier
  let subs: any[] = [];

  if (endpoint) {
    const { data } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('endpoint', endpoint);
    subs = data || [];
  } else {
    const ids = user_ids && user_ids.length ? user_ids : (user_id ? [user_id] : []);
    if (!ids.length) return json({ error: 'Missing target (user_id, user_ids or endpoint)' }, 400);

    const { data } = await supabase
      .from('push_subscriptions')
      .select('*')
      .in('user_id', ids);
    subs = data || [];
  }

  if (!subs.length) return json({ ok: true, sent: 0, message: 'No subscriptions found' });

  // 2. Envoie en parallèle
  const payloadStr = JSON.stringify(payload);
  const results = await Promise.allSettled(subs.map((s) =>
    webpush.sendNotification({ endpoint: s.endpoint, keys: s.keys }, payloadStr)
  ));

  // 3. Nettoie les subs invalides (410 Gone, 404 Not Found)
  const stale: string[] = [];
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const err: any = (r as PromiseRejectedResult).reason;
      const status = err?.statusCode;
      if (status === 404 || status === 410) stale.push(subs[i].endpoint);
    }
  });
  if (stale.length) {
    await supabase.from('push_subscriptions').delete().in('endpoint', stale);
  }

  const sent = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.length - sent;

  return json({ ok: true, sent, failed, cleaned: stale.length });
});

function json(obj: unknown, status = 200): Response {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}

function cors(): Response {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  };
}
