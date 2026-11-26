import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { canReplayAutomatically, isTransientStatus, withTransientRetry } from './transient-retry'

/**
 * #2519 / #2520 — la relance AUTOMATIQUE bornée, pour les pannes de TRANSPORT seules.
 *
 * Trois choses doivent rester vraies, et chacune a son témoin :
 *  - une panne de redéploiement (connexion coupée, 502/503/504) se rejoue ;
 *  - la relance s'ARRÊTE à sa borne et rend la dernière réponse telle quelle ;
 *  - une réponse du SERVEUR (400, 409, 429, 500…) n'est jamais rejouée — elle
 *    dit quelque chose, la répéter ne changerait rien.
 */
const ok = () => new Response('{"ok":true}', { status: 200 })
const status = (code: number) => new Response('{}', { status: code })

describe('withTransientRetry — une panne de redéploiement se rejoue, deux fois au plus', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('réussit à la 2e tentative après un 503', async () => {
    const send = vi.fn().mockResolvedValueOnce(status(503)).mockResolvedValueOnce(ok())
    const pending = withTransientRetry(send)
    await vi.runAllTimersAsync()
    const res = await pending
    expect(res.status).toBe(200)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('réussit à la 2e tentative après une connexion coupée (TypeError)', async () => {
    const send = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(ok())
    const pending = withTransientRetry(send)
    await vi.runAllTimersAsync()
    await expect(pending).resolves.toMatchObject({ status: 200 })
    expect(send).toHaveBeenCalledTimes(2)
  })

  it.each([502, 503, 504])('abandonne après la borne sur %i et rend la dernière réponse', async code => {
    const send = vi.fn().mockImplementation(async () => status(code))
    const pending = withTransientRetry(send)
    await vi.runAllTimersAsync()
    const res = await pending
    expect(res.status).toBe(code)
    // 1 envoi + 2 relances, jamais plus.
    expect(send).toHaveBeenCalledTimes(3)
  })

  it('abandonne après la borne sur une connexion coupée et rejette avec l’erreur d’origine', async () => {
    const failure = new TypeError('Failed to fetch')
    const send = vi.fn().mockRejectedValue(failure)
    const pending = withTransientRetry(send)
    const assertion = expect(pending).rejects.toBe(failure)
    await vi.runAllTimersAsync()
    await assertion
    expect(send).toHaveBeenCalledTimes(3)
  })

  it.each([400, 401, 404, 409, 429, 500])('NON — une réponse %i du serveur ne se rejoue jamais', async code => {
    const send = vi.fn().mockImplementation(async () => status(code))
    const res = await withTransientRetry(send)
    expect(res.status).toBe(code)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('NON — un arrêt volontaire (AbortError) ne se rejoue pas', async () => {
    const abort = new DOMException('aborted', 'AbortError')
    const send = vi.fn().mockRejectedValue(abort)
    await expect(withTransientRetry(send)).rejects.toBe(abort)
    expect(send).toHaveBeenCalledTimes(1)
  })

  it('un arrêt pendant l’attente coupe la relance', async () => {
    const controller = new AbortController()
    const send = vi.fn().mockImplementation(async () => status(503))
    const pending = withTransientRetry(send, { signal: controller.signal })
    const assertion = expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(10)
    controller.abort()
    await vi.runAllTimersAsync()
    await assertion
    expect(send).toHaveBeenCalledTimes(1)
  })
})

describe('canReplayAutomatically — JAMAIS une écriture, sauf démarrage déclaré idempotent', () => {
  it.each(['GET', 'HEAD'])('%s se rejoue', method => {
    expect(canReplayAutomatically(method, false)).toBe(true)
  })

  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('NON — %s ne se rejoue pas par défaut', method => {
    expect(canReplayAutomatically(method, false)).toBe(false)
  })

  it('un POST déclaré idempotent par son appelant se rejoue', () => {
    expect(canReplayAutomatically('POST', true)).toBe(true)
  })
})

describe('isTransientStatus', () => {
  it('ne reconnaît que les statuts d’une passerelle sans amont', () => {
    expect([200, 400, 429, 500, 501, 502, 503, 504, 505].filter(isTransientStatus)).toEqual([502, 503, 504])
  })
})
