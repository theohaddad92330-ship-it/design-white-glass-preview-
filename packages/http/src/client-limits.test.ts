import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HttpError, TechnicalError } from '@bellum/errors'

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }))
vi.mock('undici', () => ({
  Agent: vi.fn(),
  fetch: fetchMock,
}))

import { HttpClient, MAX_RESPONSE_BYTES, ResponseTooLargeError } from './client.js'
import { redactSecrets } from './redact.js'

const MIB = 1024 * 1024

async function causeOf(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(TechnicalError)
    return (err as TechnicalError).cause
  }
  throw new Error('expected rejection')
}

/** JSON `{"pad":"aaa…"}` d'exactement `bytes` octets. */
function jsonOfBytes(bytes: number): string {
  const overhead = '{"pad":""}'.length
  return `{"pad":"${'a'.repeat(bytes - overhead)}"}`
}

describe('HttpClient — #4120 hardening', () => {
  beforeEach(() => {
    fetchMock.mockReset()
    vi.spyOn(Math, 'random').mockReturnValue(0)
  })
  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('error body masking', () => {
    it('masks a Bearer token and an API key in the returned error body', async () => {
      fetchMock.mockResolvedValue(
        new Response('upstream said: Authorization: Bearer abc.def-123 and api_key=SUPERSECRET sk-ant-abcdefghijkl', {
          status: 400,
        }),
      )
      const client = new HttpClient({ baseUrl: 'https://api.test' })
      const cause = (await causeOf(
        client.request({ urlInfo: { template: '/x' }, method: 'GET', maxAttempts: 1 }),
      )) as HttpError
      expect(cause).toBeInstanceOf(HttpError)
      for (const secret of ['abc.def-123', 'SUPERSECRET', 'sk-ant-abcdefghijkl']) {
        expect(cause.body).not.toContain(secret)
        expect(cause.message).not.toContain(secret)
      }
      expect(cause.body).toContain('***')
    })

    it('masks x-internal-* header values and JSON-quoted secrets', () => {
      const out = redactSecrets('{"x-internal-secret":"topsecret","password":"hunter2"} X-Internal-Key: k123')
      expect(out).not.toMatch(/topsecret|hunter2|k123/)
    })

    it('leaves a harmless error body untouched', () => {
      expect(redactSecrets('not found: account 42')).toBe('not found: account 42')
    })
  })

  describe('response size bound', () => {
    it('accepts a response of exactly 8 MiB', async () => {
      fetchMock.mockResolvedValue(new Response(jsonOfBytes(MAX_RESPONSE_BYTES), { status: 200 }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })
      const body = await client.request<{ pad: string }>({ urlInfo: { template: '/x' }, method: 'GET' })
      expect(body.pad.length).toBe(MAX_RESPONSE_BYTES - '{"pad":""}'.length)
    })

    it('rejects 8 MiB + 1 byte with a typed error and never a partial JSON', async () => {
      fetchMock.mockResolvedValue(new Response(jsonOfBytes(MAX_RESPONSE_BYTES + 1), { status: 200 }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })
      const cause = await causeOf(client.request({ urlInfo: { template: '/x' }, method: 'GET' }))
      expect(cause).toBeInstanceOf(ResponseTooLargeError)
      expect(fetchMock).toHaveBeenCalledTimes(1) // pas de retry sur un rejet de taille
    })

    it('rejects on a declared content-length before reading', async () => {
      const res = new Response('{}', { status: 200, headers: { 'content-length': String(MAX_RESPONSE_BYTES + 10) } })
      const textSpy = vi.spyOn(res, 'text')
      fetchMock.mockResolvedValue(res)
      const client = new HttpClient({ baseUrl: 'https://api.test' })
      const cause = await causeOf(client.request({ urlInfo: { template: '/x' }, method: 'GET' }))
      expect(cause).toBeInstanceOf(ResponseTooLargeError)
      expect(textSpy).not.toHaveBeenCalled()
    })

    it('leaves a normal response unchanged', async () => {
      fetchMock.mockResolvedValue(new Response(JSON.stringify({ ok: true, n: 3 }), { status: 200 }))
      const client = new HttpClient({ baseUrl: 'https://api.test' })
      expect(await client.request({ urlInfo: { template: '/x' }, method: 'GET' })).toEqual({ ok: true, n: 3 })
    })
  })

  // #4122 — des mocks de fetch renvoient des réponses réduites (sans headers ni body) : tolérées, borne gardée.
  describe('minimal responses (no headers, no body stream)', () => {
    it('reads a text()-only response', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => '{"a":1}' })
      const client = new HttpClient({ baseUrl: 'https://api.test' })
      expect(await client.request({ urlInfo: { template: '/x' }, method: 'GET' })).toEqual({ a: 1 })
    })

    it('reads a json()-only response', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ b: 2 }) })
      const client = new HttpClient({ baseUrl: 'https://api.test' })
      expect(await client.request({ urlInfo: { template: '/x' }, method: 'GET' })).toEqual({ b: 2 })
    })

    it('rejects a text() larger than 8 MiB with ResponseTooLargeError', async () => {
      fetchMock.mockResolvedValue({ ok: true, status: 200, text: async () => jsonOfBytes(MAX_RESPONSE_BYTES + 1) })
      const client = new HttpClient({ baseUrl: 'https://api.test' })
      const cause = await causeOf(client.request({ urlInfo: { template: '/x' }, method: 'GET' }))
      expect(cause).toBeInstanceOf(ResponseTooLargeError)
    })
  })

  it('keeps MIB constant coherent', () => {
    expect(MAX_RESPONSE_BYTES).toBe(8 * MIB)
  })
})
