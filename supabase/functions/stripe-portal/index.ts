/**
 * stripe-portal – Supabase Edge Function
 *
 * Creates a Stripe Customer Portal session so subscribers can manage their
 * billing, update payment methods, and cancel subscriptions.
 *
 * Required secrets:
 *   STRIPE_SECRET_KEY   – Stripe secret key
 *   SITE_URL            – Public URL of the app (for return redirect)
 *
 * POST body: none required (user is identified via JWT)
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
    const SITE_URL = Deno.env.get('SITE_URL') ?? 'http://localhost:3000';
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
    const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';

    if (!STRIPE_SECRET_KEY) {
      return jsonResponse({ error: 'STRIPE_SECRET_KEY is not configured.' }, 500);
    }

    const authHeader = req.headers.get('Authorization') ?? '';
    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    // Get the Stripe customer ID for this user
    const { data: subRow } = await supabase
      .from('subscriptions')
      .select('stripe_customer_id')
      .eq('user_id', user.id)
      .maybeSingle();

    if (!subRow?.stripe_customer_id) {
      return jsonResponse({ error: 'No Stripe customer record found. Please subscribe first.' }, 404);
    }

    const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        customer: subRow.stripe_customer_id,
        return_url: `${SITE_URL}/account`,
      }),
    });

    if (!portalRes.ok) {
      const err = await portalRes.json();
      return jsonResponse({ error: err?.error?.message ?? 'Failed to create portal session.' }, 502);
    }

    const portal = await portalRes.json();
    return jsonResponse({ url: portal.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return jsonResponse({ error: message }, 500);
  }
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
