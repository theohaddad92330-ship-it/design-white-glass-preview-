import type { Job } from 'bullmq'
import { failure, success } from '@bellum/utils'
import type { AnalysisOnDemandService } from './analysis-ondemand.service'
import type { OrgRebuildJobData } from './org-rebuild.queue'
import { OrgRebuildWorker } from './org-rebuild.worker'

/**
 * Le worker ne porte AUCUNE logique métier : il rejoue le chemin du bouton
 * « Enrichir l'organigramme ». Ce que ces tests verrouillent, c'est la frontière
 * entre un refus MÉTIER (une réponse) et une panne (un incident) — les confondre
 * ferait soit du bruit dans les métriques, soit un silence sur une vraie panne.
 */
function job(data: OrgRebuildJobData): Job<OrgRebuildJobData> {
  return { data } as unknown as Job<OrgRebuildJobData>
}

describe('OrgRebuildWorker', () => {
  it('rejoue exactement le chemin « Enrichir l’organigramme »', async () => {
    const onDemand = {
      enrichOrganigram: jest.fn().mockResolvedValue(success({ matched: 7, total: 9 })),
    } as unknown as AnalysisOnDemandService
    const worker = new OrgRebuildWorker(onDemand)

    const result = await worker.process(job({ accountId: 'acc-1', userId: 'u-1' }))

    expect(onDemand.enrichOrganigram).toHaveBeenCalledWith('acc-1', 'u-1')
    expect(result).toEqual({ ok: true, matched: 7, total: 9 })
  })

  it('rend un refus métier en VALEUR, sans faire échouer le job', async () => {
    // Un compte sans contact à classer n'est pas un incident : lever ferait de
    // BullMQ le juge d'un refus métier et ferait perdre sa raison.
    const onDemand = {
      enrichOrganigram: jest
        .fn()
        .mockResolvedValue(failure({ code: 'not_found', message: 'Aucun contact à enrichir.' })),
    } as unknown as AnalysisOnDemandService
    const worker = new OrgRebuildWorker(onDemand)

    await expect(worker.process(job({ accountId: 'acc-1', userId: 'u-1' }))).resolves.toEqual({
      ok: false,
      reason: 'Aucun contact à enrichir.',
    })
  })

  it('laisse remonter une panne — elle doit se voir', async () => {
    const onDemand = {
      enrichOrganigram: jest.fn().mockRejectedValue(new Error('IA injoignable')),
    } as unknown as AnalysisOnDemandService
    const worker = new OrgRebuildWorker(onDemand)

    await expect(worker.process(job({ accountId: 'acc-1', userId: 'u-1' }))).rejects.toThrow('IA injoignable')
  })
})
