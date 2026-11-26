import { beforeEach, describe, expect, it, vi } from 'vitest'
import { apiFetch } from '@/lib/api'
import { contactsApi, type EnrichContactResponse } from './api'

/**
 * `contactsApi.enrich` attend toujours le résultat côté appelant, mais ne tient
 * plus la cascade fournisseur (30-85 s) dans UNE requête HTTP ouverte : le POST
 * met en file, puis on suit le job. Ce qui est vérifié ici est la promesse faite
 * aux deux appelants (fiche contact + carte du copilote) : même valeur de retour,
 * même chemin d'erreur.
 */
const mockedFetch = vi.mocked(apiFetch)

const DONE_PAYLOAD = { id: 'c1', email: 'owen@dirigo.fr', credits_remaining: 390 } as unknown as EnrichContactResponse

const BODY = { first_name: 'Owen', last_name: 'Renard', organization_name: 'Dirigo' }

beforeEach(() => {
  vi.useFakeTimers()
  mockedFetch.mockReset()
})

/** Laisse tourner les `setTimeout` du polling sans attendre en temps réel. */
async function runPolling<T>(promise: Promise<T>): Promise<T> {
  const settled = promise.then(
    value => ({ ok: true as const, value }),
    error => ({ ok: false as const, error }),
  )
  await vi.runAllTimersAsync()
  const outcome = await settled
  if (!outcome.ok) throw outcome.error
  return outcome.value
}

describe('contactsApi.enrich — mise en file puis suivi', () => {
  it('poste, suit le job, et rend la charge utile de `done`', async () => {
    mockedFetch
      .mockResolvedValueOnce({ job_id: 'enrich:c1', state: 'queued' })
      .mockResolvedValueOnce({ state: 'queued', job_id: 'enrich:c1' })
      .mockResolvedValueOnce({ state: 'running', job_id: 'enrich:c1' })
      .mockResolvedValueOnce({ state: 'done', job_id: 'enrich:c1', result: DONE_PAYLOAD })

    const result = await runPolling(contactsApi.enrich('c1', BODY))

    expect(result).toEqual(DONE_PAYLOAD)
    // 1er appel = le POST qui met en file (202), les suivants = le suivi.
    expect(mockedFetch).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ path: '/contacts/c1/enrich', method: 'POST', body: BODY }),
    )
    expect(mockedFetch).toHaveBeenNthCalledWith(2, expect.objectContaining({ path: '/contacts/c1/enrichment' }))
    expect(mockedFetch).toHaveBeenCalledTimes(4)
  })

  it("propage l'échec du POST tel quel — un refus immédiat (crédits, cooldown) n'est pas mis en file", async () => {
    const refusal = new Error('Crédits épuisés')
    mockedFetch.mockRejectedValueOnce(refusal)

    await expect(runPolling(contactsApi.enrich('c1', BODY))).rejects.toThrow('Crédits épuisés')
    // Aucun suivi lancé : il n'y a pas de job.
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })

  it('propage l’échec rejoué par le suivi (le client garde ses messages localisés par code)', async () => {
    mockedFetch
      .mockResolvedValueOnce({ job_id: 'enrich:c1', state: 'queued' })
      .mockRejectedValueOnce(new Error('fournisseur indisponible'))

    await expect(runPolling(contactsApi.enrich('c1', BODY))).rejects.toThrow('fournisseur indisponible')
  })

  it('un job dont la trace a disparu échoue vite, sans jamais prétendre « rien trouvé »', async () => {
    mockedFetch
      .mockResolvedValueOnce({ job_id: 'enrich:c1', state: 'queued' })
      .mockResolvedValueOnce({ state: 'unknown', job_id: 'enrich:c1' })

    await expect(runPolling(contactsApi.enrich('c1', BODY))).rejects.toThrow(/enrichissement|enrichment/i)
    expect(mockedFetch).toHaveBeenCalledTimes(2)
  })

  it('un état illisible ne fait pas tourner le suivi en boucle', async () => {
    mockedFetch.mockResolvedValueOnce({ job_id: 'enrich:c1', state: 'queued' }).mockResolvedValue({})

    await expect(runPolling(contactsApi.enrich('c1', BODY))).rejects.toThrow()
    expect(mockedFetch).toHaveBeenCalledTimes(2)
  })
})
