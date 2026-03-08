import { NextRequest } from 'next/server'

interface ProxyContext {
  readonly params: {
    readonly path?: string[]
  }
}

const BASE_URL = process.env.JARVIS_API_URL ?? 'http://localhost:8787'

async function proxyRequest(method: string, request: NextRequest, context: ProxyContext): Promise<Response> {
  const path = context.params.path?.join('/') ?? ''
  const upstreamUrl = new URL(`${BASE_URL.replace(/\/$/, '')}/${path}`)
  upstreamUrl.search = request.nextUrl.search

  const headers = new Headers(request.headers)
  headers.delete('host')
  headers.delete('connection')

  const body = method === 'GET' || method === 'DELETE' ? undefined : await request.arrayBuffer()

  const upstream = await fetch(upstreamUrl, {
    method,
    headers,
    body,
  })

  return new Response(upstream.body, {
    status: upstream.status,
    headers: upstream.headers,
  })
}

export async function GET(request: NextRequest, context: ProxyContext): Promise<Response> {
  return proxyRequest('GET', request, context)
}

export async function POST(request: NextRequest, context: ProxyContext): Promise<Response> {
  return proxyRequest('POST', request, context)
}

export async function PUT(request: NextRequest, context: ProxyContext): Promise<Response> {
  return proxyRequest('PUT', request, context)
}

export async function DELETE(request: NextRequest, context: ProxyContext): Promise<Response> {
  return proxyRequest('DELETE', request, context)
}
