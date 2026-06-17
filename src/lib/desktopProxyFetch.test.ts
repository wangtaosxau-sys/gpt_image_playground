import { afterEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_PARAMS } from '../types'
import { DEFAULT_SETTINGS } from './apiProfiles'
import { callImageApi } from './api'
import { desktopProxyFetch, disableStreamingForDesktopProxy, isDesktopProxyAvailable } from './desktopProxyFetch'
import { fetchImageUrlAsDataUrl } from './imageApiShared'

describe('desktopProxyFetch', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    delete (globalThis as any).window
  })

  function installWindow(proxy?: (request: any) => Promise<any>) {
    ;(globalThis as any).window = {
      go: proxy ? { main: { App: { ProxyAPIRequest: proxy } } } : undefined,
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

  it('removes streaming fields when the desktop proxy is active', () => {
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

  it('downgrades streaming image requests when the desktop proxy is active', async () => {
    const proxy = vi.fn().mockResolvedValue({
      status: 200,
      statusText: '200 OK',
      headers: { 'Content-Type': 'application/json' },
      bodyText: JSON.stringify({ data: [{ b64_json: 'aW1hZ2U=' }] }),
    })
    installWindow(proxy)

    await callImageApi({
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
    })

    const body = JSON.parse(proxy.mock.calls[0][0].bodyText)
    expect(body.stream).toBeUndefined()
    expect(body.partial_images).toBeUndefined()
  })
})
