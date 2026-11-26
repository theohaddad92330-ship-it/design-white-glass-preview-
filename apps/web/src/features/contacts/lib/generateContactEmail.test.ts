import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api-error'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

import { EmailGenerationError, generateContactEmail, generateContactEmailsBounded } from './generateContactEmail'

beforeEach(() => {
  apiFetch.mockReset()
})
afterEach(() => {
  vi.useRealTimers()
})

// #4042.8 — recette prod 12/10 : « brouillon resté Rédaction du brouillon… > 25 s ». Un appel qui ne revient
// pas doit finir en erreur NOMMÉE, jamais en spinner infini.
describe('generateContactEmail', () => {
  it('rend objet et corps', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'Objet', body: 'Corps' } })
    await expect(generateContactEmail('c-1')).resolves.toEqual({ subject: 'Objet', body: 'Corps' })
  })

  it('un appel qui ne revient jamais finit en erreur « timeout » nommée', async () => {
    vi.useFakeTimers()
    apiFetch.mockImplementation(
      (args: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          args.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
        }),
    )
    const result = generateContactEmail('c-1', { timeoutMs: 5_000 })
    const assertion = expect(result).rejects.toMatchObject({ reason: 'timeout' })
    await vi.advanceTimersByTimeAsync(5_001)
    await assertion
  })

  it('la raison du serveur voyage (phrase du moteur), pas un message générique', async () => {
    apiFetch.mockRejectedValue(new ApiError('Le contact n’a pas assez de contexte.', 422, 'message_refused'))
    const error = await generateContactEmail('c-1').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(EmailGenerationError)
    expect(error).toMatchObject({ reason: 'refused', detail: 'Le contact n’a pas assez de contexte.' })
  })

  it('un corps vide est « empty », jamais un brouillon vide', async () => {
    apiFetch.mockResolvedValue({ success: true, data: { subject: 'x', body: '  ' } })
    await expect(generateContactEmail('c-1')).rejects.toMatchObject({ reason: 'empty' })
  })

  it('une coupure réseau est « failed »', async () => {
    apiFetch.mockRejectedValue(new Error('network'))
    await expect(generateContactEmail('c-1')).rejects.toMatchObject({ reason: 'failed' })
  })
})

// #4050.3 (recette M 12/10 : brouillon 1 en 10 s, les 3 vers 40 s) — la génération de N contacts est
// PARALLÈLE bornée, jamais une file : horloge factice, chaque appel dure 10 s.
describe('generateContactEmailsBounded', () => {
  function slowGeneration() {
    let inFlight = 0
    let peak = 0
    apiFetch.mockImplementation(
      () =>
        new Promise(resolve => {
          inFlight += 1
          peak = Math.max(peak, inFlight)
          setTimeout(() => {
            inFlight -= 1
            resolve({ success: true, data: { subject: 'S', body: 'B' } })
          }, 10_000)
        }),
    )
    return () => peak
  }

  it('3 contacts : les 3 appels sont en vol en même temps, tout est rendu en ~10 s (pas 30 s)', async () => {
    vi.useFakeTimers()
    const peak = slowGeneration()
    const settled: string[] = []
    const run = generateContactEmailsBounded(['a', 'b', 'c'], { onSettled: id => settled.push(id) })
    await vi.advanceTimersByTimeAsync(0)
    expect(apiFetch).toHaveBeenCalledTimes(3)
    expect(peak()).toBe(3)
    await vi.advanceTimersByTimeAsync(10_001)
    await run
    expect(settled.sort()).toEqual(['a', 'b', 'c'])
  })

  it('borné à 4 : 6 contacts ne font jamais plus de 4 appels simultanés', async () => {
    vi.useFakeTimers()
    const peak = slowGeneration()
    const run = generateContactEmailsBounded(['a', 'b', 'c', 'd', 'e', 'f'])
    await vi.advanceTimersByTimeAsync(0)
    expect(apiFetch).toHaveBeenCalledTimes(4)
    await vi.advanceTimersByTimeAsync(10_001)
    expect(apiFetch).toHaveBeenCalledTimes(6)
    await vi.advanceTimersByTimeAsync(10_001)
    await run
    expect(peak()).toBe(4)
  })

  it('l’échec d’un contact (429 compris) ne compte que pour lui', async () => {
    apiFetch.mockImplementation(async ({ body }: { body: { contactId: string } }) => {
      if (body.contactId === 'b') throw new ApiError('Trop de requêtes', 429, 'rate_limited')
      return { success: true, data: { subject: 'S', body: 'B' } }
    })
    const outcomes: Record<string, string> = {}
    await generateContactEmailsBounded(['a', 'b', 'c'], {
      onSettled: (id, result) => {
        outcomes[id] = result instanceof EmailGenerationError ? 'error' : 'ok'
      },
    })
    expect(outcomes).toEqual({ a: 'ok', b: 'error', c: 'ok' })
  })
})
