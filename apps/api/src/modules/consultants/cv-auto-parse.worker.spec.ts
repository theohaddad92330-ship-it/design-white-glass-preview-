import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common'
import { RATE_LIMIT_ERROR, type Job, type Queue } from 'bullmq'
import { CV_AUTO_PARSE_IA_DEFAULT_BACKOFF_MS, CV_AUTO_PARSE_MAX_DEFERRALS } from './cv-auto-parse.queue'
import type { CvAutoParseJobData } from './cv-auto-parse.queue'
import type { CvAutoParseService } from './cv-auto-parse.service'
import { CvAutoParseWorker } from './cv-auto-parse.worker'

// #3935 (lot BATCH-CV, 12/10/2026) — un service IA saturé REPORTE la fiche, il ne brûle pas ses tentatives.
function setup(readOne: jest.Mock) {
  const rateLimit = jest.fn().mockResolvedValue(undefined)
  const queue = { rateLimit } as unknown as Queue<CvAutoParseJobData>
  const worker = new CvAutoParseWorker({ readOne } as unknown as CvAutoParseService, queue)
  const updateData = jest.fn().mockResolvedValue(undefined)
  const job = (deferrals?: number) =>
    ({
      data: { workspaceId: 'w', userId: 'u', consultantId: 'c', ...(deferrals ? { deferrals } : {}) },
      updateData,
    }) as unknown as Job<CvAutoParseJobData>
  return { worker, rateLimit, updateData, job }
}

describe('CvAutoParseWorker — saturation du service IA #3935', () => {
  it('rend le résultat de readOne quand tout va bien', async () => {
    const { worker, job, rateLimit } = setup(jest.fn().mockResolvedValue({ written: 3 }))
    await expect(worker.process(job())).resolves.toEqual({ written: 3 })
    expect(rateLimit).not.toHaveBeenCalled()
  })

  it('une indisponibilité IA met la FILE en pause et remet la fiche en attente SANS consommer de tentative', async () => {
    const { worker, job, rateLimit, updateData } = setup(
      jest.fn().mockRejectedValue(new ServiceUnavailableException('saturé')),
    )
    await expect(worker.process(job())).rejects.toMatchObject({ message: RATE_LIMIT_ERROR })
    expect(rateLimit).toHaveBeenCalledWith(CV_AUTO_PARSE_IA_DEFAULT_BACKOFF_MS)
    expect(updateData).toHaveBeenCalledWith(expect.objectContaining({ deferrals: 1 }))
  })

  it('une erreur qui n’est PAS une saturation remonte telle quelle (tentative normale)', async () => {
    const err = new UnprocessableEntityException('rien d’exploitable')
    const { worker, job, rateLimit } = setup(jest.fn().mockRejectedValue(err))
    await expect(worker.process(job())).rejects.toBe(err)
    expect(rateLimit).not.toHaveBeenCalled()
  })

  it('au-delà du plafond de reports, l’indisponibilité redevient un échec qui consomme une tentative — jamais une boucle', async () => {
    const err = new ServiceUnavailableException('toujours saturé')
    const { worker, job, rateLimit } = setup(jest.fn().mockRejectedValue(err))
    await expect(worker.process(job(CV_AUTO_PARSE_MAX_DEFERRALS))).rejects.toBe(err)
    expect(rateLimit).not.toHaveBeenCalled()
  })
})
