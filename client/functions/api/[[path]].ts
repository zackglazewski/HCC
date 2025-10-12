export const onRequest: PagesFunction = async (context) => {
  const { request, env, params } = context
  const origin = (env as any).API_ORIGIN as string | undefined
  if (!origin) {
    return new Response('Missing API_ORIGIN', { status: 500 })
  }

  const url = new URL(request.url)
  const path = (params as any).path ? '/' + (params as any).path : ''
  const target = new URL(origin.replace(/\/$/, '') + '/api' + path + url.search)

  const init: RequestInit = {
    method: request.method,
    headers: new Headers(request.headers),
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : await request.arrayBuffer(),
  }
  // Remove host header to avoid H2 authority confusion
  init.headers!.delete('host')

  const resp = await fetch(target.toString(), init as any)
  // Stream back response
  const headers = new Headers(resp.headers)
  // Ensure CORS not required since same origin; but keep content-type, etc.
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers })
}

