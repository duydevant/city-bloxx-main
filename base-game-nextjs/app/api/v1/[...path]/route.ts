import { NextRequest, NextResponse } from "next/server"

export const dynamic = "force-dynamic"

function resolveBackendBaseUrl(): string | null {
  const raw = (
    process.env.CITY_BLOXX_BACKEND_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    ""
  )
    .trim()
    .replace(/\/+$/, "")
  if (!raw || !/^https?:\/\//i.test(raw)) return null
  return raw.endsWith("/api/v1") ? raw : `${raw}/api/v1`
}

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> },
): Promise<NextResponse> {
  const baseUrl = resolveBackendBaseUrl()
  if (!baseUrl) {
    return NextResponse.json(
      { statusCode: 503, message: "Backend API URL is not configured" },
      { status: 503 },
    )
  }

  const { path } = await context.params
  const subPath = path.join("/")
  const search = request.nextUrl.search || ""
  const targetUrl = `${baseUrl}/${subPath}${search}`

  const siteOrigin = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    request.nextUrl.origin ||
    "https://citybloxx.antfootage.net"
  )
    .trim()
    .replace(/\/+$/, "")

  const headers = new Headers()
  headers.set("Origin", siteOrigin)

  const passthroughHeaders = [
    "content-type",
    "authorization",
    "cookie",
    "user-agent",
    "accept",
    "accept-language",
    "x-forwarded-for",
    "x-real-ip",
  ]
  for (const name of passthroughHeaders) {
    const val = request.headers.get(name)
    if (val) headers.set(name, val)
  }

  const method = request.method.toUpperCase()
  const hasBody = method !== "GET" && method !== "HEAD"
  const bodyBuffer = hasBody ? await request.arrayBuffer() : undefined

  try {
    const upstream = await fetch(targetUrl, {
      method,
      headers,
      body: bodyBuffer && bodyBuffer.byteLength > 0 ? bodyBuffer : undefined,
      redirect: "manual",
      cache: "no-store",
    })

    const responseHeaders = new Headers()
    for (const key of ["content-type", "cache-control", "retry-after", "x-request-id"]) {
      const value = upstream.headers.get(key)
      if (value) responseHeaders.set(key, value)
    }

    const isHttpLocal = request.nextUrl.protocol === "http:"
    const setCookies =
      typeof upstream.headers.getSetCookie === "function"
        ? upstream.headers.getSetCookie()
        : upstream.headers.get("set-cookie")
          ? [upstream.headers.get("set-cookie")!]
          : []

    for (const cookie of setCookies) {
      const adjusted = isHttpLocal ? cookie.replace(/;\s*Secure/gi, "") : cookie
      responseHeaders.append("Set-Cookie", adjusted)
    }

    const responseBody = await upstream.arrayBuffer()
    return new NextResponse(responseBody, {
      status: upstream.status,
      headers: responseHeaders,
    })
  } catch {
    return NextResponse.json(
      { statusCode: 502, message: "Upstream account service unreachable" },
      { status: 502 },
    )
  }
}

export const GET = proxy
export const POST = proxy
export const PUT = proxy
export const PATCH = proxy
export const DELETE = proxy
