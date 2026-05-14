// ═══════════════════════════════════════════════════════════════════
//  EDGE FUNCTION : log-event
//  Reçoit un signalement d'incident depuis le client + capture
//  l'IP réelle et le User-Agent côté serveur (impossible à forger).
//
//  POST { event_type, severity?, details? }
//  Headers : x-client-info (auto-injecté par le SDK Supabase)
// ═══════════════════════════════════════════════════════════════════

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

const ALLOWED_EVENTS = new Set([
  'forbidden_word', 'spam_limit', 'bypass_attempt', 'login_brute',
  'suspicious_devtools', 'rate_limit_offer', 'rate_limit_message',
  'manual_report', 'csp_violation', 'console_tampering'
]);

const ALLOWED_SEVERITY = new Set(['low','medium','high','critical']);

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return cors();
  if (req.method !== 'POST')    return json({ error: 'Method not allowed' }, 405);

  // Capture l'IP réelle (Supabase Edge Functions tournent derrière Cloudflare)
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
          || req.headers.get('cf-connecting-ip')
          || req.headers.get('x-real-ip')
          || 'unknown';
  const ua = req.headers.get('user-agent') || 'unknown';

  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'Invalid JSON' }, 400); }

  let { event_type, severity, details, user_id } = body;
  if (!event_type || !ALLOWED_EVENTS.has(event_type)) return json({ error: 'Invalid event_type' }, 400);
  if (severity && !ALLOWED_SEVERITY.has(severity))    severity = 'low';
  if (!severity) severity = 'low';

  // Si l'auth header est présent, on récupère le user_id réel (sécurise contre usurpation)
  let realUserId: string | null = null;
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { data } = await supabase.auth.getUser(token);
      if (data && data.user) realUserId = data.user.id;
    } catch {}
  }

  await supabase.from('security_events').insert([{
    user_id:    realUserId || user_id || null,
    ip,
    user_agent: ua,
    event_type,
    severity,
    details:    details || {}
  }]);

  return json({ ok: true });
});

function json(o: unknown, status = 200): Response {
  return new Response(JSON.stringify(o), {
    status, headers: { 'Content-Type': 'application/json', ...corsHeaders() }
  });
}
function cors(): Response { return new Response(null, { status: 204, headers: corsHeaders() }); }
function corsHeaders(): Record<string,string> {
  return {
    'Access-Control-Allow-Origin':  '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type'
  };
}
