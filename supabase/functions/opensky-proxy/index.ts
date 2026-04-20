Deno.serve(async (req: Request) => {
  try {
    const clientId = Deno.env.get('OPENSKY_CLIENT_ID')
    const clientSecret = Deno.env.get('OPENSKY_CLIENT_SECRET')

    if (!clientId || !clientSecret) {
      throw new Error('Missing OpenSky OAuth credentials')
    }

    const body = await req.json().catch(() => ({}))
    const {
      lamin = 24,
      lomin = -130,
      lamax = 50,
      lomax = -65,
    } = body as Record<string, number>

    // 1) Get OAuth token
    const tokenResp = await fetch(
      'https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: clientId,
          client_secret: clientSecret,
        }),
      },
    )

    const tokenText = await tokenResp.text()
    let tokenJson: Record<string, unknown> = {}
    try {
      tokenJson = JSON.parse(tokenText)
    } catch {
      throw new Error(`Token endpoint returned non-JSON: ${tokenText}`)
    }

    if (!tokenResp.ok || !tokenJson.access_token) {
      throw new Error(`Token request failed: ${tokenResp.status} ${tokenText}`)
    }

    const accessToken = String(tokenJson.access_token)

    // 2) Call OpenSky API
    const params = new URLSearchParams({
      lamin: String(lamin),
      lomin: String(lomin),
      lamax: String(lamax),
      lomax: String(lomax),
    })

    const resp = await fetch(
      `https://opensky-network.org/api/states/all?${params.toString()}`,
      {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      },
    )

    const text = await resp.text()

    return new Response(
      JSON.stringify({
        marker: 'OPENSKY-OAUTH-TEST',
        status: resp.status,
        statusText: resp.statusText,
        body: text,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  } catch (err) {
    return new Response(
      JSON.stringify({
        marker: 'OPENSKY-OAUTH-TEST',
        error: err instanceof Error ? err.message : String(err),
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    )
  }
})