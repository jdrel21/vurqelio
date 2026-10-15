// Webhook Stripe → marchează campania ca plătită.
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets: supabase secrets set STRIPE_SECRET_KEY=sk_... STRIPE_WEBHOOK_SECRET=whsec_...
import Stripe from 'npm:stripe@17';
import { createClient } from 'npm:@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!);
const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature!, Deno.env.get('STRIPE_WEBHOOK_SECRET')!, undefined, cryptoProvider);
  } catch (err) {
    return new Response(`Webhook error: ${(err as Error).message}`, { status: 400 });
  }

  if (event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') {
    const s = event.data.object as Stripe.Checkout.Session;
    if (s.client_reference_id && s.payment_status === 'paid') {
      const sb = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
      const { data: c } = await sb.from('campaigns').select('id, status, expected_cents').eq('id', s.client_reference_id).maybeSingle();
      // Acceptăm doar dacă suma plătită acoperă pachetul ales (nu se poate plăti pachetul ieftin pentru unul scump).
      if (c && c.status === 'pending_payment' && (s.amount_total ?? 0) >= c.expected_cents) {
        await sb.from('campaigns').update({ status: 'paid', paid_cents: s.amount_total, stripe_session: s.id })
          .eq('id', c.id).eq('status', 'pending_payment');
      }
    }
  }
  return new Response(JSON.stringify({ received: true }), { headers: { 'Content-Type': 'application/json' } });
});
