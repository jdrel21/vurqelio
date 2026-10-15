// Postback pentru offerwall (AdGem, Lootably, Ayet, CPX etc.)
// Deploy: supabase functions deploy offerwall-postback --no-verify-jwt
// Secret: supabase secrets set OFFERWALL_SECRET=un-sir-lung-aleator
import { createClient } from 'npm:@supabase/supabase-js@2';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function safeEqual(a: string, b: string) {
  if (!a || !b || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  const p = new URL(req.url).searchParams;
  if (!safeEqual(p.get('token') ?? '', Deno.env.get('OFFERWALL_SECRET') ?? '')) {
    return new Response('forbidden', { status: 403 });
  }

  const user = p.get('user_id') ?? '';
  const tx = p.get('tx_id') ?? '';
  const provider = (p.get('provider') ?? 'offerwall').slice(0, 30);
  const points = Math.trunc(Math.abs(Number(p.get('points'))));
  const reversed = ['reversed', 'chargeback', '2', '-1'].includes((p.get('status') ?? '').toLowerCase());

  if (!UUID.test(user) || !tx || !Number.isFinite(points) || points <= 0 || points > 100000) {
    return new Response('bad request', { status: 400 });
  }

  const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  const { error } = await sb.rpc('grant_offer_points', {
    p_user: user,
    p_provider: provider,
    p_tx: tx.slice(0, 120),
    p_points: reversed ? -points : points,
    p_reason: p.get('offer') ?? provider,
  });
  if (error) return new Response(error.message, { status: 500 });
  // Opțional: &revenue={PAYOUT} (în EUR) → apare în Raportul lunar
  const revenue = Number(p.get('revenue'));
  if (Number.isFinite(revenue) && revenue > 0 && !reversed) {
    await sb.rpc('record_offer_revenue', { p_cents: Math.round(revenue * 100), p_note: `${provider} · ${tx}`.slice(0, 120) });
  }
  return new Response('1');
});
