/**
 * stripe-webhook – Supabase Edge Function
 *
 * Receives Stripe webhook events and syncs subscription state into the
 * `subscriptions` table via the service-role key (bypasses RLS).
 *
 * Required secrets:
 *   STRIPE_SECRET_KEY           – Stripe secret key
 *   STRIPE_WEBHOOK_SECRET       – Signing secret from the Stripe dashboard webhook endpoint
 *   SUPABASE_SERVICE_ROLE_KEY   – Service-role key for privileged DB writes
 *
 * Stripe events handled:
 *   checkout.session.completed
 *   customer.subscription.created
 *   customer.subscription.updated
 *   customer.subscription.deleted
 *   invoice.payment_failed
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
  const STRIPE_WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET') ?? '';
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

  if (!STRIPE_SECRET_KEY || !STRIPE_WEBHOOK_SECRET) {
    return jsonResponse({ error: 'Stripe secrets are not configured.' }, 500);
  }

  const signature = req.headers.get('stripe-signature');
  if (!signature) {
    return jsonResponse({ error: 'Missing stripe-signature header.' }, 400);
  }

  const rawBody = await req.arrayBuffer();

  // Verify the webhook signature using the Web Crypto API
  const verified = await verifyStripeSignature(
    STRIPE_WEBHOOK_SECRET,
    signature,
    rawBody,
  );
  if (!verified) {
    return jsonResponse({ error: 'Invalid webhook signature.' }, 400);
  }

  const event = JSON.parse(new TextDecoder().decode(rawBody));

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        if (session.mode === 'subscription') {
          const subscriptionId = session.subscription;
          const customerId = session.customer;
          const userId = session.metadata?.supabase_user_id;
          const plan = session.metadata?.plan ?? 'pro';

          if (userId && subscriptionId) {
            // Fetch full subscription from Stripe to get period details
            const subRes = await stripeGet(STRIPE_SECRET_KEY, `/subscriptions/${subscriptionId}`);
            const sub = subRes.ok ? await subRes.json() : null;

            await supabase.from('subscriptions').upsert(
              {
                user_id: userId,
                stripe_customer_id: customerId,
                stripe_subscription_id: subscriptionId,
                stripe_price_id: sub?.items?.data?.[0]?.price?.id ?? null,
                plan,
                status: sub?.status ?? 'active',
                current_period_start: sub ? new Date(sub.current_period_start * 1000).toISOString() : null,
                current_period_end: sub ? new Date(sub.current_period_end * 1000).toISOString() : null,
                cancel_at_period_end: sub?.cancel_at_period_end ?? false,
              },
              { onConflict: 'user_id' },
            );
          }
        }
        break;
      }

      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        const plan = resolvePlanFromPriceId(
          sub.items?.data?.[0]?.price?.id ?? '',
          Deno.env.get('STRIPE_PRO_PRICE_ID') ?? '',
          Deno.env.get('STRIPE_TEAM_PRICE_ID') ?? '',
        );

        await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_customer_id: sub.customer,
            stripe_subscription_id: sub.id,
            stripe_price_id: sub.items?.data?.[0]?.price?.id ?? null,
            plan,
            status: sub.status,
            current_period_start: new Date(sub.current_period_start * 1000).toISOString(),
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
            cancel_at_period_end: sub.cancel_at_period_end,
          },
          { onConflict: 'user_id' },
        );
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const userId = sub.metadata?.supabase_user_id;
        if (!userId) break;

        await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            stripe_subscription_id: sub.id,
            plan: 'free',
            status: 'canceled',
            cancel_at_period_end: false,
          },
          { onConflict: 'user_id' },
        );
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        if (!subscriptionId) break;

        await supabase
          .from('subscriptions')
          .update({ status: 'past_due' })
          .eq('stripe_subscription_id', subscriptionId);
        break;
      }

      default:
        // Acknowledge unhandled events without error
        break;
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[stripe-webhook] handler error:', message);
    return jsonResponse({ error: message }, 500);
  }

  return jsonResponse({ received: true });
});

/** Derive the plan name from a Stripe price ID */
function resolvePlanFromPriceId(priceId: string, proPriceId: string, teamPriceId: string): string {
  if (priceId === proPriceId) return 'pro';
  if (priceId === teamPriceId) return 'team';
  return 'free';
}

/** Verify Stripe webhook signature (HMAC-SHA256) */
async function verifyStripeSignature(
  secret: string,
  signatureHeader: string,
  body: ArrayBuffer,
): Promise<boolean> {
  try {
    const parts: Record<string, string> = {};
    for (const part of signatureHeader.split(',')) {
      const [k, v] = part.split('=');
      parts[k] = v;
    }
    const timestamp = parts['t'];
    const expectedSig = parts['v1'];
    if (!timestamp || !expectedSig) return false;

    const payload = `${timestamp}.${new TextDecoder().decode(body)}`;
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign'],
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
    const hex = Array.from(new Uint8Array(sig))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    return hex === expectedSig;
  } catch {
    return false;
  }
}

async function stripeGet(secretKey: string, path: string): Promise<Response> {
  return fetch(`https://api.stripe.com/v1${path}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
