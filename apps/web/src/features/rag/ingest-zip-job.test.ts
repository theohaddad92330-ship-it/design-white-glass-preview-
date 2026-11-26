import { describe, expect, it, vi } from 'vitest'
import type { RagZipIngestJobStatus } from '@bellum/contracts'
import { followIngestZipJob } from './ingest-zip-job'

const report = { total: 1, outcomes: [{ status: 'ingested' as const, file: 'a.txt', id: 'd1', partial: false }] }
const seq = (...statuses: RagZipIngestJobStatus[]) => {
  const queue = [...statuses]
  return vi.fn(async () => queue.shift() as RagZipIngestJobStatus)
}
const wait = vi.fn(async () => undefined)

// #3623.11
describe('followIngestZipJob', () => {
  it('suit en attente → en cours → terminée, relaie chaque statut, rend le rapport', async () => {
    const onStatus = vi.fn()
    const fetchStatus = seq(
      { jobId: 'j', status: 'pending' },
      { jobId: 'j', status: 'running', progress: { processed: 1, total: 2 } },
      { jobId: 'j', status: 'completed', report },
    )
    await expect(followIngestZipJob(fetchStatus, { onStatus, wait })).resolves.toBe(report)
    expect(onStatus.mock.calls.map(([s]) => s.status)).toEqual(['pending', 'running', 'completed'])
  })

  it('partielle : rend quand même le rapport par entrée', async () => {
    await expect(followIngestZipJob(seq({ jobId: 'j', status: 'partial', report }), { wait })).resolves.toBe(report)
  })

  it('interrompue : lève avec la raison nommée du serveur', async () => {
    await expect(
      followIngestZipJob(seq({ jobId: 'j', status: 'interrupted', reason: 'Archive trop lourde' }), { wait }),
    ).rejects.toThrow('Archive trop lourde')
  })

  it('inconnue : jamais deviné en succès', async () => {
    await expect(followIngestZipJob(seq({ jobId: 'j', status: 'unknown' }), { wait })).rejects.toThrow(/plus suivie/)
  })

  it('terminée sans rapport : refus, pas un succès vide', async () => {
    await expect(followIngestZipJob(seq({ jobId: 'j', status: 'completed' }), { wait })).rejects.toThrow()
  })

  it('suivi borné : expire sans prétendre à un échec de l’archive', async () => {
    const fetchStatus = vi.fn(async () => ({ jobId: 'j', status: 'running' as const }))
    await expect(followIngestZipJob(fetchStatus, { wait, maxPolls: 3 })).rejects.toThrow(/expiré/)
    expect(fetchStatus).toHaveBeenCalledTimes(3)
  })
})
