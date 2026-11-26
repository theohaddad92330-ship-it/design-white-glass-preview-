import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { RAG_CHUNK_BACKFILL_BATCH, RagChunkBackfillScheduler } from './rag-chunk-backfill.scheduler'

/**
 * #3750.4 — le rattrapage des morceaux des documents DÉJÀ en base. Ce qui est
 * tenu ici : un petit lot par nuit (jamais tout le parc), délégué au service IA
 * qui possède la table, sans geste au déploiement, et muet en échec.
 */
describe('le rattrapage nocturne des morceaux RAG (#3750.4)', () => {
  const make = (ia: { ragChunkBackfill: jest.Mock }) => new RagChunkBackfillScheduler(ia as never)

  it('demande UN petit lot au service IA', async () => {
    const ia = { ragChunkBackfill: jest.fn().mockResolvedValue({ success: true, data: { documents: 3 } }) }
    await make(ia).runBackfill()
    expect(ia.ragChunkBackfill).toHaveBeenCalledTimes(1)
    expect(ia.ragChunkBackfill).toHaveBeenCalledWith({ batchSize: RAG_CHUNK_BACKFILL_BATCH })
    expect(RAG_CHUNK_BACKFILL_BATCH).toBeLessThanOrEqual(50)
  })

  it('ne remonte pas et ne relance pas quand le service IA échoue', async () => {
    const ia = { ragChunkBackfill: jest.fn().mockRejectedValue(new Error('IA muette')) }
    await expect(make(ia).runBackfill()).resolves.toBeUndefined()
    expect(ia.ragChunkBackfill).toHaveBeenCalledTimes(1)
  })

  it('rend compte même quand il n’y a rien à rattraper', async () => {
    const ia = { ragChunkBackfill: jest.fn().mockResolvedValue({ success: true, data: { documents: 0, failed: 0 } }) }
    const scheduler = make(ia)
    const logged: string[] = []
    jest.spyOn(scheduler['logger'], 'log').mockImplementation(message => logged.push(String(message)))
    await scheduler.runBackfill()
    expect(logged.join(' ')).toContain('0 document(s) découpé(s)')
  })

  it('tourne sur un cron nocturne, jamais au démarrage du service', () => {
    const source = readFileSync(join(__dirname, 'rag-chunk-backfill.scheduler.ts'), 'utf8')
    expect(source).toContain("@Cron('")
    expect(source).not.toMatch(/onModuleInit|onApplicationBootstrap/)
  })
})
