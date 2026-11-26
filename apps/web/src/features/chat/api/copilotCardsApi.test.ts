import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { copilotCardsApi } from './copilotCardsApi'

/**
 * #1998 — les six gestes d'une carte de Laura passent par les routes DÉJÀ
 * servies par l'API (`POST action-os/cards/:runId/<geste>`), et chacune rend la
 * carte RELUE : c'est le serveur qui dit l'état suivant, jamais l'écran qui le
 * devine.
 */
describe('copilotCardsApi', () => {
  beforeEach(() => {
    vi.mocked(apiFetch).mockReset()
    vi.mocked(apiFetch).mockResolvedValue({ card: { id: 'run-1', state: 'executed' } })
  })

  it('confirmer poste un corps VIDE et rend la carte relue', async () => {
    await expect(copilotCardsApi.confirm('run-1')).resolves.toMatchObject({ id: 'run-1', state: 'executed' })
    expect(apiFetch).toHaveBeenCalledWith({ path: '/action-os/cards/run-1/confirm', method: 'POST', body: {} })
  })

  it('refuser porte la raison quand il y en a une, et ne l’invente pas sinon', async () => {
    await copilotCardsApi.reject('run-1', 'pas le bon contact')
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/action-os/cards/run-1/reject',
      method: 'POST',
      body: { reason: 'pas le bon contact' },
    })

    await copilotCardsApi.reject('run-1')
    expect(apiFetch).toHaveBeenLastCalledWith({
      path: '/action-os/cards/run-1/reject',
      method: 'POST',
      body: {},
    })
  })

  it('reporter laisse le serveur choisir la date quand personne ne l’a donnée', async () => {
    await copilotCardsApi.snooze('run-1')
    expect(apiFetch).toHaveBeenCalledWith({ path: '/action-os/cards/run-1/snooze', method: 'POST', body: {} })
  })

  it('réessayer et annuler tapent leur propre route', async () => {
    await copilotCardsApi.retry('run-1')
    expect(apiFetch).toHaveBeenLastCalledWith({ path: '/action-os/cards/run-1/retry', method: 'POST', body: {} })

    await copilotCardsApi.cancel('run-1')
    expect(apiFetch).toHaveBeenLastCalledWith({ path: '/action-os/cards/run-1/cancel', method: 'POST', body: {} })
  })

  it('l’identifiant est encodé — jamais concaténé tel quel dans le chemin', async () => {
    await copilotCardsApi.confirm('run 1/../2')
    expect(apiFetch).toHaveBeenCalledWith({
      path: '/action-os/cards/run%201%2F..%2F2/confirm',
      method: 'POST',
      body: {},
    })
  })
})
