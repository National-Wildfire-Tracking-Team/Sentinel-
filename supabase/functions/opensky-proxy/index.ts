Deno.serve(async () => {
  console.log('[opensky-proxy] hello from deployed function')

  return new Response(
    JSON.stringify({
      ok: true,
      message: 'Deployed function is running',
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    },
  )
})
