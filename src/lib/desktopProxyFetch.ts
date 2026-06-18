export interface DesktopProxyFormDataPart {
  name: string
  value?: string
  fileName?: string
  contentType?: string
  dataBase64?: string
}

export interface DesktopProxyRequest {
  url: string
  streamId?: string
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

export interface DesktopProxyStreamStartResponse {
  streamId: string
}

export interface DesktopProxyStreamEvent {
  streamId: string
  type: 'headers' | 'chunk' | 'done' | 'error' | 'canceled'
  status?: number
  statusText?: string
  headers?: Record<string, string>
  chunkText?: string
  chunkBase64?: string
  error?: string
}

interface WailsAppProxy {
  ProxyAPIRequest?: (request: DesktopProxyRequest) => Promise<DesktopProxyResponse>
  StartProxyStream?: (request: DesktopProxyRequest) => Promise<DesktopProxyStreamStartResponse>
  CancelProxyStream?: (streamId: string) => Promise<void>
}

interface WailsRuntimeProxy {
  EventsOn?: (eventName: string, callback: (...data: unknown[]) => void) => () => void
}

declare global {
  interface Window {
    go?: {
      main?: {
        App?: WailsAppProxy
      }
    }
    runtime?: WailsRuntimeProxy
  }
}

const DESKTOP_PROXY_STREAM_EVENT = 'gpt-image-playground:proxy-stream'

export function isDesktopProxyAvailable(): boolean {
  return typeof window !== 'undefined' && typeof window.go?.main?.App?.ProxyAPIRequest === 'function'
}

export function isDesktopStreamProxyAvailable(): boolean {
  return typeof window !== 'undefined' &&
    typeof window.go?.main?.App?.StartProxyStream === 'function' &&
    typeof window.go?.main?.App?.CancelProxyStream === 'function' &&
    typeof window.runtime?.EventsOn === 'function'
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

function decodeBase64ToBytes(value: string): Uint8Array {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes
}

function isStreamDesktopProxyRequest(request: DesktopProxyRequest): boolean {
  if (request.bodyText) {
    try {
      const payload = JSON.parse(request.bodyText)
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        return (payload as Record<string, unknown>).stream === true
      }
    } catch {
      return false
    }
  }

  if (request.formData) {
    return request.formData.some((part) => part.name === 'stream' && (part.value === 'true' || part.value === '1'))
  }

  return false
}

function buildStreamChunk(event: DesktopProxyStreamEvent): Uint8Array | null {
  if (typeof event.chunkBase64 === 'string' && event.chunkBase64) {
    return decodeBase64ToBytes(event.chunkBase64)
  }
  if (typeof event.chunkText === 'string') {
    return new TextEncoder().encode(event.chunkText)
  }
  return null
}

function createDesktopStreamId(): string {
  const cryptoValue = globalThis.crypto
  if (cryptoValue?.randomUUID) return cryptoValue.randomUUID()
  return `stream-${Date.now()}-${Math.random().toString(36).slice(2)}`
}

async function createDesktopProxyStreamResponse(
  proxyRequest: DesktopProxyRequest,
  signal?: AbortSignal,
): Promise<Response> {
  const runtime = window.runtime
  const app = window.go?.main?.App
  const startProxyStream = app?.StartProxyStream
  const cancelProxyStream = app?.CancelProxyStream
  const eventsOn = runtime?.EventsOn
  if (!startProxyStream || !cancelProxyStream || !eventsOn) {
    const proxy = app?.ProxyAPIRequest
    if (!proxy) throw new Error('Desktop proxy is unavailable')
    const response = await proxy(proxyRequest)
    return createResponseFromDesktopProxy(response)
  }

  const queuedChunks: Uint8Array[] = []
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null
  let headersResolved = false
  let streamClosed = false
  let startedStreamId = createDesktopStreamId()
  proxyRequest.streamId = startedStreamId
  let unsubscribe: () => void = () => undefined
  let cancelReason: unknown = null
  let cleanedUp = false
  let abortHandler: (() => void) | null = null
  let resolveHeaders: ((value: { status: number; statusText: string; headers: Headers }) => void) | null = null
  let rejectHeaders: ((reason?: unknown) => void) | null = null

  const headerPromise = new Promise<{ status: number; statusText: string; headers: Headers }>((resolve, reject) => {
    resolveHeaders = resolve
    rejectHeaders = reject
  })

  const cleanup = (cancelUpstream = false) => {
    if (cleanedUp) return
    cleanedUp = true
    unsubscribe()
    if (abortHandler) signal?.removeEventListener('abort', abortHandler)
    if (cancelUpstream && startedStreamId) {
      void cancelProxyStream(startedStreamId).catch(() => undefined)
    }
  }

  const flushQueue = () => {
    if (!controller) return
    while (queuedChunks.length > 0) {
      controller.enqueue(queuedChunks.shift()!)
    }
    if (streamClosed) {
      controller.close()
    }
  }

  const finishWithError = (error: unknown) => {
    const err = error instanceof Error ? error : new Error(String(error))
    cancelReason = err
    cleanup(true)
    if (controller) controller.error(err)
    if (!headersResolved) rejectHeaders?.(err)
  }

  const onStreamEvent = (...data: unknown[]) => {
    const raw = data[0]
    if (!raw || typeof raw !== 'object') return
    const event = raw as DesktopProxyStreamEvent
    if (startedStreamId && event.streamId !== startedStreamId) return

    if (event.type === 'error' || event.type === 'canceled') {
      const error = new Error(event.error || (event.type === 'canceled' ? 'request canceled' : 'stream failed'))
      finishWithError(error)
      return
    }

    if (event.type === 'headers') {
      if (headersResolved) return
      headersResolved = true
      resolveHeaders?.({
        status: event.status ?? 200,
        statusText: event.statusText || '',
        headers: new Headers(event.headers ?? {}),
      })
      return
    }

    if (event.type === 'done') {
      streamClosed = true
      flushQueue()
      cleanup()
      return
    }

    if (event.type !== 'chunk') return
    const chunk = buildStreamChunk(event)
    if (!chunk) return
    if (controller) {
      controller.enqueue(chunk)
    } else {
      queuedChunks.push(chunk)
    }
  }

  unsubscribe = eventsOn(DESKTOP_PROXY_STREAM_EVENT, onStreamEvent)

  const bodyStream = new ReadableStream<Uint8Array>({
    start(ctrl) {
      controller = ctrl
      flushQueue()
    },
    cancel() {
      cleanup(true)
    },
  })

  abortHandler = () => {
    const error = signal?.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
    finishWithError(error)
  }
  if (signal?.aborted) {
    abortHandler()
    throw signal.reason instanceof Error ? signal.reason : new DOMException('Aborted', 'AbortError')
  }
  signal?.addEventListener('abort', abortHandler, { once: true })

  try {
    const started = await startProxyStream(proxyRequest)
    startedStreamId = started.streamId
    const headerInfo = await headerPromise
    if (cancelReason) throw cancelReason instanceof Error ? cancelReason : new Error(String(cancelReason))
    return new Response(bodyStream, {
      status: headerInfo.status,
      statusText: headerInfo.statusText || undefined,
      headers: headerInfo.headers,
    })
  } catch (error) {
    finishWithError(error)
    throw error
  }
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
  if (isStreamDesktopProxyRequest(proxyRequest) && isDesktopStreamProxyAvailable()) {
    return createDesktopProxyStreamResponse(proxyRequest, init?.signal ?? undefined)
  }
  const response = await proxy(proxyRequest)
  return createResponseFromDesktopProxy(response)
}

export function disableStreamingForDesktopProxy<T extends Record<string, unknown>>(value: T): T {
  if (!isDesktopProxyAvailable() || isDesktopStreamProxyAvailable()) return value
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
  return Boolean(streamImages) && (!isDesktopProxyAvailable() || isDesktopStreamProxyAvailable())
}
