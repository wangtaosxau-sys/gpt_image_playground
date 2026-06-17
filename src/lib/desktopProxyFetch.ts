export interface DesktopProxyFormDataPart {
  name: string
  value?: string
  fileName?: string
  contentType?: string
  dataBase64?: string
}

export interface DesktopProxyRequest {
  url: string
  method: string
  headers?: Record<string, string>
  bodyText?: string
  bodyBase64?: string
  formData?: DesktopProxyFormDataPart[]
  timeoutSeconds?: number
}

export interface DesktopProxyResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  bodyText?: string
  bodyBase64?: string
}

interface WailsAppProxy {
  ProxyAPIRequest?: (request: DesktopProxyRequest) => Promise<DesktopProxyResponse>
}

declare global {
  interface Window {
    go?: {
      main?: {
        App?: WailsAppProxy
      }
    }
  }
}

export function isDesktopProxyAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.go?.main?.App?.ProxyAPIRequest === 'function'
}

function shouldUseDesktopProxy(input: RequestInfo | URL): boolean {
  if (!isDesktopProxyAvailable()) return false
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
    ? input.href
    : input.url
  return /^https?:\/\//i.test(url)
}

function normalizeHeaders(headers: HeadersInit | undefined): Record<string, string> {
  const output: Record<string, string> = {}
  if (!headers) return output
  new Headers(headers).forEach((value, key) => {
    output[key] = value
  })
  return output
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000))
  }
  return btoa(binary)
}

async function blobToBase64(blob: Blob): Promise<string> {
  return bytesToBase64(new Uint8Array(await blob.arrayBuffer()))
}

async function createDesktopProxyFormData(formData: FormData): Promise<DesktopProxyFormDataPart[]> {
  const parts: DesktopProxyFormDataPart[] = []
  for (const [name, value] of formData.entries()) {
    if (typeof File !== 'undefined' && value instanceof File) {
      parts.push({
        name,
        fileName: value.name,
        contentType: value.type || 'application/octet-stream',
        dataBase64: await blobToBase64(value),
      })
    } else if (value instanceof Blob) {
      parts.push({
        name,
        fileName: 'blob',
        contentType: value.type || 'application/octet-stream',
        dataBase64: await blobToBase64(value),
      })
    } else {
      parts.push({ name, value: String(value) })
    }
  }
  return parts
}

async function createDesktopProxyRequest(input: RequestInfo | URL, init: RequestInit = {}): Promise<DesktopProxyRequest> {
  const request = typeof Request !== 'undefined' && input instanceof Request ? input : null
  const url = typeof input === 'string'
    ? input
    : input instanceof URL
    ? input.href
    : input.url
  const method = init.method ?? request?.method ?? 'GET'
  const headers = normalizeHeaders(init.headers ?? request?.headers)
  const body = init.body ?? null
  const proxyRequest: DesktopProxyRequest = {
    url,
    method,
    headers,
  }

  if (body instanceof FormData) {
    proxyRequest.formData = await createDesktopProxyFormData(body)
    if (proxyRequest.headers) {
      delete proxyRequest.headers['content-type']
      delete proxyRequest.headers['Content-Type']
    }
  } else if (typeof body === 'string') {
    proxyRequest.bodyText = body
  } else if (body instanceof Blob) {
    proxyRequest.bodyBase64 = await blobToBase64(body)
  } else if (body instanceof ArrayBuffer) {
    proxyRequest.bodyBase64 = bytesToBase64(new Uint8Array(body))
  } else if (ArrayBuffer.isView(body)) {
    proxyRequest.bodyBase64 = bytesToBase64(new Uint8Array(body.buffer, body.byteOffset, body.byteLength))
  } else if (body instanceof URLSearchParams) {
    proxyRequest.bodyText = body.toString()
    proxyRequest.headers = {
      'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
      ...proxyRequest.headers,
    }
  } else if (typeof ReadableStream !== 'undefined' && body instanceof ReadableStream) {
    throw new Error('桌面原生代理暂不支持流式请求体')
  } else if (request && !init.body) {
    const contentType = request.headers.get('content-type') ?? ''
    if (contentType.includes('multipart/form-data')) {
      proxyRequest.formData = await createDesktopProxyFormData(await request.clone().formData())
    } else if (contentType.startsWith('text/') || contentType.includes('json') || contentType.includes('xml')) {
      proxyRequest.bodyText = await request.clone().text()
    } else if (request.body) {
      proxyRequest.bodyBase64 = await blobToBase64(await request.clone().blob())
    }
  }

  return proxyRequest
}

function createResponseFromDesktopProxy(response: DesktopProxyResponse): Response {
  const headers = new Headers(response.headers ?? {})
  const body = response.bodyBase64
    ? Uint8Array.from(atob(response.bodyBase64), (char) => char.charCodeAt(0))
    : response.bodyText ?? ''
  return new Response(body, {
    status: response.status,
    statusText: response.statusText || undefined,
    headers,
  })
}

export async function desktopProxyFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  if (!shouldUseDesktopProxy(input)) return fetch(input, init)
  const proxy = window.go?.main?.App?.ProxyAPIRequest
  if (!proxy) return fetch(input, init)
  const proxyRequest = await createDesktopProxyRequest(input, init)
  const response = await proxy(proxyRequest)
  return createResponseFromDesktopProxy(response)
}

export function disableStreamingForDesktopProxy<T extends Record<string, unknown>>(value: T): T {
  if (!isDesktopProxyAvailable()) return value
  delete value.stream
  delete value.partial_images
  const tools = value.tools
  if (Array.isArray(tools)) {
    for (const tool of tools) {
      if (tool && typeof tool === 'object' && !Array.isArray(tool)) {
        delete (tool as Record<string, unknown>).partial_images
      }
    }
  }
  return value
}

export function effectiveStreamImages(streamImages?: boolean): boolean {
  return Boolean(streamImages) && !isDesktopProxyAvailable()
}
