type GuardResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

/**
 * Authenticate an end-user JWT and consume a database-backed per-user,
 * per-minute allowance. The service-role key is used only for the rate-limit
 * RPC and is never returned to the caller.
 */
export async function guardExpensiveRequest(
  req: Request,
  functionName: string,
  requestsPerMinute: number,
): Promise<GuardResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authorization = req.headers.get('Authorization') ?? '';

  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return { ok: false, status: 500, error: 'Supabase credentials are not configured.' };
  }
  if (!authorization.toLowerCase().startsWith('bearer ')) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
    headers: {
      apikey: anonKey,
      Authorization: authorization,
    },
  });
  if (!userResponse.ok) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const user = await userResponse.json().catch(() => null);
  if (!user?.id) {
    return { ok: false, status: 401, error: 'Unauthorized' };
  }

  const rateResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/consume_edge_rate_limit`, {
    method: 'POST',
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      p_function_name: functionName,
      p_subject: user.id,
      p_limit: requestsPerMinute,
    }),
  });
  if (!rateResponse.ok) {
    return { ok: false, status: 503, error: 'Rate limiter unavailable.' };
  }

  const allowed = await rateResponse.json().catch(() => false);
  if (allowed !== true) {
    return { ok: false, status: 429, error: 'Rate limit exceeded. Please retry shortly.' };
  }

  return { ok: true, userId: user.id };
}
