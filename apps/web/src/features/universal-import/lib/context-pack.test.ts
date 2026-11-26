import { beforeEach, describe, expect, it, vi } from 'vitest'

const apiFetch = vi.fn()
vi.mock('@/lib/api', () => ({ apiFetch: (...args: unknown[]) => apiFetch(...args) }))
vi.mock('@/lib/query-client', () => ({ queryClient: { invalidateQueries: vi.fn() } }))
vi.mock('@/features/consultants/lib/fileToBase64', () => ({ fileToBase64: async () => 'QUJD' }))

import { CONTEXT_PACK_ORIGINAL_MAX_BYTES } from '@bellum/contracts'
import { importContextFile } from './context-pack'

// #4422.1 — chaque import de l'assistant écrit sa ligne d'historique avec son bilan (comptes exceptés : déjà un job).
describe('importContextFile — historique (#4422.1)', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  it('séquences : l’import réussi écrit sa ligne avec le bilan tel que rendu (scripts compris)', async () => {
    apiFetch.mockImplementation(async (request?: { path: string }) =>
      request?.path === '/outreach/sequence-templates/import'
        ? { templates: 9, steps: 36, scripts: 54, skipped: [{ line: 20, reason: 'no_body', campaign: '3' }] }
        : undefined,
    )
    const outcome = await importContextFile(new File(['x'], 'Campagnes.xlsx'), 'sequences')
    expect(outcome).toMatchObject({ status: 'imported', count: 9, scripts: 54, mails: 36, skipped: 1 })
    expect(apiFetch).toHaveBeenCalledWith(
      expect.objectContaining({
        path: '/import/context-pack/history',
        method: 'POST',
        body: {
          fileName: 'Campagnes.xlsx',
          destination: 'sequences',
          status: 'done',
          imported: 9,
          skipped: 1,
          scripts: 54,
          message: null,
          // #4573 — l'original déposé voyage avec le bilan, au moment du dépôt.
          fileB64: 'QUJD',
        },
      }),
    )
  })

  it('un échec s’écrit aussi, avec son message ; un échec d’écriture de l’historique ne casse pas l’import', async () => {
    apiFetch.mockImplementation((request?: { path: string }) =>
      Promise.reject(new Error(request?.path === '/import/context-pack/history' ? 'réseau' : 'Fichier illisible.')),
    )
    const outcome = await importContextFile(new File(['x'], 'Postes.csv'), 'target_personas')
    expect(outcome).toMatchObject({ status: 'failed', message: 'Fichier illisible.' })
  })
})

// #4573 — l'original part AU DÉPÔT avec la ligne d'historique : jamais reconstruit après coup.
describe('importContextFile — l’original du dépôt (#4573)', () => {
  beforeEach(() => {
    apiFetch.mockReset()
  })

  const historyBody = () =>
    apiFetch.mock.calls
      .map(call => call[0] as { path: string; body?: Record<string, unknown> })
      .find(r => r.path === '/import/context-pack/history')?.body

  it('un import réussi envoie l’original en base64', async () => {
    apiFetch.mockResolvedValue(undefined)
    await importContextFile(new File(['%PDF'], 'Playbook.pdf'), 'knowledge')
    expect(historyBody()).toMatchObject({ status: 'done', fileB64: 'QUJD' })
  })

  it('un import échoué n’envoie AUCUN original — il n’a rien créé', async () => {
    apiFetch.mockImplementation((request?: { path: string }) =>
      request?.path === '/import/context-pack/history'
        ? Promise.resolve()
        : Promise.reject(new Error('Fichier illisible.')),
    )
    await importContextFile(new File(['x'], 'Postes.csv'), 'target_personas')
    expect(historyBody()).toMatchObject({ status: 'failed' })
    expect(historyBody()).not.toHaveProperty('fileB64')
  })

  it('au-delà du plafond, l’original ne voyage pas et la ligne le dira', async () => {
    apiFetch.mockResolvedValue(undefined)
    const big = new File([new Uint8Array(CONTEXT_PACK_ORIGINAL_MAX_BYTES + 1)], 'Gros.pdf')
    await importContextFile(big, 'knowledge')
    expect(historyBody()).toMatchObject({ status: 'done', originalTooBig: true })
    expect(historyBody()).not.toHaveProperty('fileB64')
  })
})
