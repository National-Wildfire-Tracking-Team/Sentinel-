/**
 * stripe-checkout – Supabase Edge Function
 *
 * Creates a Stripe Checkout Session for upgrading to Pro or Team plans.
 * The caller must be authenticated (JWT in Authorization header).
 *
 * Required secrets:
 *   STRIPE_SECRET_KEY        – Stripe secret key (sk_live_… or sk_test_…)
 *   STRIPE_PRO_PRICE_ID      – Stripe Price ID for the Pro monthly plan
 *   STRIPE_TEAM_PRICE_ID     – Stripe Price ID for the Team monthly plan
 *   SITE_URL                 – Public URL of the app (for success/cancel redirects)
 *
 * POST body (JSON):
 *   plan   "pro" | "team"    – which plan to subscribe to
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const STRIPE_SECRET_KEY = Deno.env.get('STRIPE_SECRET_KEY') ?? '';
    const STRIPE_PRO_PRICE_ID = Deno.env.get('STRIPE_PRO_PRICE_ID') ?? '';
    const STRIPE_TEAM_PRICE_ID = Deno.env.get('STRIPE_TEAM_PRICE_ID') ?? '';
    const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!STRIPE_SECRET_KEY) {
      return jsonResponse({ error: 'STRIPE_SECRET_KEY is not configured.' }, 500);
    }

    // Authenticate the requesting user via their JWT
    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const body = await req.json().catch(() => ({}));
    const { plan } = body as { plan?: string };

    if (!plan || !['pro', 'team'].includes(plan)) {
      return jsonResponse({ error: 'Invalid plan. Must be "pro" or "team".' }, 400);
    }

    const priceId = plan === 'pro' ? STRIPE_PRO_PRICE_ID : STRIPE_TEAM_PRICE_ID;
    if (!priceId) {
      return jsonResponse(
        { error: `STRIPE_${plan.toUpperCase()}_PRICE_ID is not configured.` },
        500,
      );
    }

    // Look up or create a Stripe customer for this user
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    let customerId: string | undefined = subRow?.stripe_customer_id ?? undefined;

    if (!customerId) {
      // Create a new Stripe customer
      const customerRes = await stripePost(STRIPE_SECRET_KEY, '/customers', {
        email: user.email ?? '',
        metadata: { supabase_user_id: user.id },
      });
      if (!customerRes.ok) {
        const err = await customerRes.json();
        return jsonResponse({ error: err?.error?.message ?? 'Failed to create Stripe customer.' }, 502);
      }
      const customer = await customerRes.json();
      customerId = customer.id;

      // Persist the customer ID (service role required for this upsert)
      const serviceSupabase = createClient(
        SUPABASE_URL,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      );
      await serviceSupabase.from('subscriptions').upsert(
        { user_id: user.id, stripe_customer_id: customerId, plan: 'free', status: 'active' },
        { onConflict: 'user_id' },
      );
    }

    // Create the Checkout Session
    const sessionRes = await stripePost(STRIPE_SECRET_KEY, '/checkout/sessions', {
      customer: customerId,
      mode: 'subscription',
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${SITE_URL}/account?checkout=success`,
      cancel_url: `${SITE_URL}/pricing?checkout=canceled`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { supabase_user_id: user.id },
      },
      metadata: { supabase_user_id: user.id, plan },
    });

    if (!sessionRes.ok) {
      const err = await sessionRes.json();
      return jsonResponse({ error: err?.error?.message ?? 'Failed to create checkout session.' }, 502);
    }

    const session = await sessionRes.json();
    return jsonResponse({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});

/** Helper: POST to Stripe REST API */
async function stripePost(
  secretKey: string,
  path: string,
  data: Record<string, unknown>,
): Promise<Response> {
  return fetch(`https://api.stripe.com/v1${path}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secretKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: toFormEncoded(data),
  });
}

function toFormEncoded(obj: Record<string, unknown>, prefix = ''): string {
  const parts: string[] = [];
  for (const [key, val] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}[${key}]` : key;
    if (val !== null && typeof val === 'object' && !Array.isArray(val)) {
      parts.push(toFormEncoded(val as Record<string, unknown>, fullKey));
    } else if (Array.isArray(val)) {
      val.forEach((item, i) => {
        if (item !== null && typeof item === 'object') {
          parts.push(toFormEncoded(item as Record<string, unknown>, `${fullKey}[${i}]`));
        } else {
          parts.push(`${encodeURIComponent(`${fullKey}[${i}]`)}=${encodeURIComponent(String(item))}`);
        }
      });
    } else if (val !== undefined) {
      parts.push(`${encodeURIComponent(fullKey)}=${encodeURIComponent(String(val))}`);
    }
  }
  return parts.join('&');
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
