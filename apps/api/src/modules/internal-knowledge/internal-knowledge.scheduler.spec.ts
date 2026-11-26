import { InternalKnowledgeScheduler } from './internal-knowledge.scheduler'
import type { InternalKnowledgeDigestService } from './internal-knowledge-digest.service'
import type { InternalKnowledgeSyncService } from './internal-knowledge-sync.service'
import type { SyncReport } from './internal-knowledge.types'

function setup(report: SyncReport) {
  const sync = { sync: jest.fn(async () => report) } as unknown as InternalKnowledgeSyncService
  const refreshIfChanged = jest.fn(async () => ({ status: 'unchanged' as const }))
  const digest = { refreshIfChanged } as unknown as InternalKnowledgeDigestService
  const scheduler = new InternalKnowledgeScheduler(sync, digest, async (_name, run) => run())
  return { scheduler, refreshIfChanged }
}

describe('#3586 W2 — le digest se régénère en FIN de synchro', () => {
  it('synchro réussie : le digest est vérifié (et régénéré si le contenu a changé)', async () => {
    const { scheduler, refreshIfChanged } = setup({
      status: 'ok',
      mode: 'incremental',
      indexed: 0,
      ignored: 0,
      errors: 0,
      archived: 0,
      chunksInserted: 0,
    })
    await scheduler.tick()
    expect(refreshIfChanged).toHaveBeenCalledTimes(1)
  })

  it('Drive non configuré ou synchro en échec : aucun digest tenté', async () => {
    const disabled = setup({ status: 'disabled' })
    await disabled.scheduler.tick()
    expect(disabled.refreshIfChanged).not.toHaveBeenCalled()

    const failed = setup({ status: 'error', message: 'quota' })
    await failed.scheduler.tick()
    expect(failed.refreshIfChanged).not.toHaveBeenCalled()
  })
})
