/**
 * Proxies /api/* to the Express API so the browser only ever talks to this origin.
 *
 * Cloudflare Pages environment variables:
 *   API_ORIGIN          Base URL of the API. Set in both Production and Preview.
 *   ALLOW_API_OVERRIDE  Set to "true" in the *Preview* environment only. Lets a branch preview be
 *                       pointed at a Render pull-request preview of the API:
 *                         /api/__preview?origin=https://hcc-api-pr-42.onrender.com   pin
 *                         /api/__preview?clear=1                                     unpin
 *                         /api/__preview                                             show current
 *                       The choice is stored in a cookie, so it only affects that browser.
 *                       Production never sets this variable, so the endpoint 404s there.
 */
interface Env {
  API_ORIGIN?: string
  ALLOW_API_OVERRIDE?: string
}

const OVERRIDE_COOKIE = 'hcc_api_origin'
const OVERRIDE_TTL_SECONDS = 60 * 60 * 24 * 30 // 30 days
const COOKIE_ATTRS = 'Path=/; HttpOnly; Secure; SameSite=Lax'

/** Overrides may only target Render hosts over https. Returns the normalized origin or null. */
function normalizeAllowedOrigin(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const host = url.hostname.toLowerCase()
  const isRenderHost = host.endsWith('.onrender.com') && host.length > '.onrender.com'.length
  if (url.protocol !== 'https:' || !isRenderHost) return null
  return url.origin
}

function readCookie(header: string | null, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return undefined
}

function overridesEnabled(env: Env): boolean {
  return env.ALLOW_API_OVERRIDE === 'true'
}

function resolveApiOrigin(request: Request, env: Env): string | undefined {
  if (overridesEnabled(env)) {
    const cookie = readCookie(request.headers.get('cookie'), OVERRIDE_COOKIE)
    const override = cookie ? normalizeAllowedOrigin(cookie) : null
    if (override) return override
  }
  return env.API_ORIGIN
}

function handlePreviewOverride(request: Request, env: Env): Response {
  if (!overridesEnabled(env)) return new Response('Not found', { status: 404 })

  const url = new URL(request.url)

  if (url.searchParams.has('clear')) {
    return new Response(null, {
      status: 302,
      headers: { location: '/', 'set-cookie': `${OVERRIDE_COOKIE}=; Max-Age=0; ${COOKIE_ATTRS}` },
    })
  }

  const requested = url.searchParams.get('origin')
  if (!requested) {
    const current = readCookie(request.headers.get('cookie'), OVERRIDE_COOKIE)
    const body = [
      `API origin override: ${current ?? '(none)'}`,
      `Default API_ORIGIN:  ${env.API_ORIGIN ?? '(unset)'}`,
      '',
      'Pin:   /api/__preview?origin=https://<service>-pr-<n>.onrender.com',
      'Clear: /api/__preview?clear=1',
    ].join('\n')
    return new Response(body, { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } })
  }

  const origin = normalizeAllowedOrigin(requested)
  if (!origin) {
    return new Response('origin must be an https://*.onrender.com URL', { status: 400 })
  }
  return new Response(null, {
    status: 302,
    headers: {
      location: '/',
      'set-cookie': `${OVERRIDE_COOKIE}=${encodeURIComponent(origin)}; Max-Age=${OVERRIDE_TTL_SECONDS}; ${COOKIE_ATTRS}`,
    },
  })
}

export const onRequest: PagesFunction<Env> = async (context) => {
  const { request, env, params } = context

  const raw = params.path as string | string[] | undefined
  const path = Array.isArray(raw) ? '/' + raw.join('/') : raw ? '/' + String(raw) : ''

  if (path === '/__preview') return handlePreviewOverride(request, env)

  const origin = resolveApiOrigin(request, env)
  if (!origin) {
    const hint = overridesEnabled(env)
      ? ' Pin one with /api/__preview?origin=https://<service>-pr-<n>.onrender.com'
      : ''
    return new Response('Missing API_ORIGIN.' + hint, { status: 500 })
  }

  const url = new URL(request.url)
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
  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers })
}
