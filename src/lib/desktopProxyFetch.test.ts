import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { callImageApi } from './api'
import { desktopProxyFetch, disableStreamingForDesktopProxy, isDesktopProxyAvailable, isDesktopStreamProxyAvailable } from './desktopProxyFetch'
import { fetchImageUrlAsDataUrl } from './imageApiShared'

describe('desktopProxyFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  function installWindow(proxy?: (request: any) => Promise<any>, streamRuntime?: {
    start?: (request: any) => Promise<any>
    cancel?: (streamId: string) => Promise<void>
    eventsOn?: (eventName: string, callback: (...data: unknown[]) => void) => () => void
  }) {
    ;(globalThis as any).window = {
      go: proxy || streamRuntime
        ? {
            main: {
              App: {
                ...(proxy ? { ProxyAPIRequest: proxy } : {}),
                ...(streamRuntime?.start ? { StartProxyStream: streamRuntime.start } : {}),
                ...(streamRuntime?.cancel ? { CancelProxyStream: streamRuntime.cancel } : {}),
              },
            },
          }
        : undefined,
      runtime: streamRuntime?.eventsOn ? { EventsOn: streamRuntime.eventsOn } : undefined,
    }
  }

  it('uses Wails native proxy when the runtime is available', async () => {
    const proxy = vi.fn().mockResolvedValue({
      status: 200,
      statusText: '200 OK',
      headers: { 'Content-Type': 'application/json' },
      bodyText: '{"ok":true}',
    })
    installWindow(proxy)
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const response = await desktopProxyFetch('https://api.example.com/v1/images/generations', {
      method: 'POST',
      headers: { Authorization: 'Bearer test-key', 'Content-Type': 'application/json' },
      body: '{"prompt":"hello"}',
    })

    expect(fetchMock).not.toHaveBeenCalled()
    expect(proxy).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://api.example.com/v1/images/generations',
      method: 'POST',
      headers: expect.objectContaining({
        authorization: 'Bearer test-key',
        'content-type': 'application/json',
      }),
      bodyText: '{"prompt":"hello"}',
    }))
    await expect(response.json()).resolves.toEqual({ ok: true })
  })

  it('falls back to browser fetch when Wails runtime is unavailable', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))

    const response = await desktopProxyFetch('https://api.example.com/v1/images/generations')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    await expect(response.text()).resolves.toBe('ok')
  })

  it('does not proxy relative same-origin URLs', async () => {
    const proxy = vi.fn()
    installWindow(proxy)
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('ok'))

    await desktopProxyFetch('/api-proxy/images/generations')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(proxy).not.toHaveBeenCalled()
  })

  it('serializes multipart bodies for Wails native proxy', async () => {
    const proxy = vi.fn().mockResolvedValue({
      status: 200,
      statusText: '200 OK',
      headers: { 'Content-Type': 'application/json' },
      bodyText: '{"ok":true}',
    })
    installWindow(proxy)
    const formData = new FormData()
    formData.append('prompt', 'hello')
    formData.append('image[]', new Blob(['image-bytes'], { type: 'image/png' }), 'input.png')

    await desktopProxyFetch('https://api.example.com/v1/images/edits', {
      method: 'POST',
      body: formData,
    })

    const request = proxy.mock.calls[0][0]
    expect(request.formData).toEqual([
      { name: 'prompt', value: 'hello' },
      expect.objectContaining({
        name: 'image[]',
        fileName: 'input.png',
        contentType: 'image/png',
        dataBase64: btoa('image-bytes'),
      }),
    ])
    expect(request.headers?.['content-type']).toBeUndefined()
  })

  it('converts binary proxy responses into Response bodies', async () => {
    installWindow(vi.fn().mockResolvedValue({
      status: 200,
      statusText: '200 OK',
      headers: { 'Content-Type': 'image/png' },
      bodyBase64: btoa(String.fromCharCode(1, 2, 3)),
    }))

    const response = await desktopProxyFetch('https://cdn.example.com/image.png')
    expect([...new Uint8Array(await response.arrayBuffer())]).toEqual([1, 2, 3])
  })

  it('keeps streaming fields when the desktop stream bridge is active', () => {
    installWindow(vi.fn())
    const body = {
      model: 'model',
      stream: true,
      partial_images: 2,
      tools: [{ type: 'image_generation', partial_images: 2 }],
    }

    expect(isDesktopProxyAvailable()).toBe(true)
    expect(disableStreamingForDesktopProxy(body)).toEqual({
      model: 'model',
      tools: [{ type: 'image_generation' }],
    })

    const start = vi.fn().mockResolvedValue({ streamId: 'stream-1' })
    const cancel = vi.fn().mockResolvedValue(undefined)
    const eventsOn = vi.fn(() => vi.fn())
    installWindow(vi.fn(), { start, cancel, eventsOn })

    expect(isDesktopStreamProxyAvailable()).toBe(true)
    expect(disableStreamingForDesktopProxy({
      model: 'model',
      stream: true,
      partial_images: 2,
      tools: [{ type: 'image_generation', partial_images: 2 }],
    })).toEqual({
      model: 'model',
      stream: true,
      partial_images: 2,
      tools: [{ type: 'image_generation', partial_images: 2 }],
    })
  })

  it('downloads generated image URLs through the desktop proxy', async () => {
    const proxy = vi.fn().mockResolvedValue({
      status: 200,
      statusText: '200 OK',
      headers: { 'Content-Type': 'image/png' },
      bodyBase64: btoa('image'),
    })
    installWindow(proxy)
    const fetchMock = vi.spyOn(globalThis, 'fetch')

    const dataUrl = await fetchImageUrlAsDataUrl('https://cdn.example.com/generated.png', 'image/png')

    expect(fetchMock).not.toHaveBeenCalled()
    expect(proxy).toHaveBeenCalledWith(expect.objectContaining({
      url: 'https://cdn.example.com/generated.png',
      method: 'GET',
    }))
    expect(dataUrl).toBe('data:image/png;base64,aW1hZ2U=')
  })

  it('streams image requests through the Wails event bridge when available', async () => {
    const proxy = vi.fn().mockResolvedValue({
      status: 200,
      statusText: '200 OK',
      headers: { 'Content-Type': 'application/json' },
      bodyText: JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }),
    })
    let streamCallback: ((event: any) => void) | null = null
    const start = vi.fn().mockImplementation(async (request) => {
      queueMicrotask(() => {
        streamCallback?.({
          streamId: request.streamId,
          type: 'headers',
          status: 200,
          statusText: '200 OK',
          headers: { 'Content-Type': 'text/event-stream' },
        })
        streamCallback?.({
          streamId: request.streamId,
          type: 'chunk',
          chunkText: 'data: {"type":"image_generation.partial_image","b64_json":"cGFydGlhbA==","partial_image_index":0}\n\n',
        })
        streamCallback?.({
          streamId: request.streamId,
          type: 'chunk',
          chunkText: 'data: {"type":"image_generation.completed","b64_json":"aW1hZ2U="}\n\n',
        })
        streamCallback?.({ streamId: request.streamId, type: 'done' })
      })
      return { streamId: request.streamId }
    })
    const cancel = vi.fn().mockResolvedValue(undefined)
    const unsubscribe = vi.fn()
    const eventsOn = vi.fn((eventName: string, callback: (...data: unknown[]) => void) => {
      streamCallback = callback
      return unsubscribe
    })
    installWindow(proxy, { start, cancel, eventsOn })
    const partials: string[] = []

    const result = await callImageApi({
      settings: {
        ...DEFAULT_SETTINGS,
        apiKey: 'test-key',
        streamImages: true,
        streamPartialImages: 2,
        profiles: DEFAULT_SETTINGS.profiles.map((profile) => ({
          ...profile,
          apiKey: 'test-key',
          streamImages: true,
          streamPartialImages: 2,
        })),
      },
      prompt: 'prompt',
      params: { ...DEFAULT_PARAMS },
      inputImageDataUrls: [],
      onPartialImage: (event) => {
        partials.push(event.image)
      },
    })

    expect(proxy).not.toHaveBeenCalled()
    expect(eventsOn).toHaveBeenCalledWith('gpt-image-playground:proxy-stream', expect.any(Function))
    expect(start).toHaveBeenCalledTimes(1)
    const body = JSON.parse(start.mock.calls[0][0].bodyText)
    expect(body.stream).toBe(true)
    expect(body.partial_images).toBe(2)
    expect(partials).toEqual(['data:image/png;base64,cGFydGlhbA=='])
    expect(result.images).toEqual(['data:image/png;base64,aW1hZ2U='])
    expect(unsubscribe).toHaveBeenCalled()
  })

  it('cancels Wails stream requests when the response body is canceled', async () => {
    let streamCallback: ((event: any) => void) | null = null
    const start = vi.fn().mockImplementation(async (request) => {
      queueMicrotask(() => {
        streamCallback?.({
          streamId: request.streamId,
          type: 'headers',
          status: 200,
          statusText: '200 OK',
          headers: { 'Content-Type': 'text/event-stream' },
        })
      })
      return { streamId: request.streamId }
    })
    const cancel = vi.fn().mockResolvedValue(undefined)
    installWindow(vi.fn(), {
      start,
      cancel,
      eventsOn: vi.fn((eventName: string, callback: (...data: unknown[]) => void) => {
        streamCallback = callback
        return vi.fn()
      }),
    })

    const response = await desktopProxyFetch('https://api.example.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stream: true }),
    })
    await response.body?.cancel()

    expect(cancel).toHaveBeenCalledWith(start.mock.calls[0][0].streamId)
  })
})
