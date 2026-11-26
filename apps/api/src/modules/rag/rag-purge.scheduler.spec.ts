import { RagPurgeScheduler, ragPurgeDisabled } from './rag-purge.scheduler'

/**
 * La purge est le geste le plus destructeur du magasin de connaissance. Ce qui
 * est testé ici n'est pas qu'elle efface — c'est qu'elle sait NE PAS le faire.
 */
describe('le balayage mensuel du magasin (tome 7, M3)', () => {
  const make = (ia: { ragPurge: jest.Mock }) => new RagPurgeScheduler(ia as never)

  afterEach(() => {
    delete process.env['RAG_PURGE_DISABLED']
  })

  it('n’appelle RIEN quand le coupe-circuit est posé', async () => {
    process.env['RAG_PURGE_DISABLED'] = 'true'
    const ia = { ragPurge: jest.fn() }
    await make(ia).runPurge()
    expect(ia.ragPurge).not.toHaveBeenCalled()
    expect(ragPurgeDisabled()).toBe(true)
  })

  it('délègue au service qui possède la table', async () => {
    const ia = { ragPurge: jest.fn().mockResolvedValue({ data: { examined: 12, purged: 3 } }) }
    await make(ia).runPurge()
    expect(ia.ragPurge).toHaveBeenCalledWith({})
  })

  it('ne relance PAS et ne remonte pas quand la purge échoue', async () => {
    // Un geste destructeur qui échoue ne fait rien : le mois suivant repassera
    // sur les mêmes documents, qui n'auront pas rajeuni. Relancer ici doublerait
    // le risque pour aucun gain.
    const ia = { ragPurge: jest.fn().mockRejectedValue(new Error('IA muette')) }
    await expect(make(ia).runPurge()).resolves.toBeUndefined()
    expect(ia.ragPurge).toHaveBeenCalledTimes(1)
  })

  it('rend compte même quand il n’y a rien à effacer', async () => {
    // Un silence ne doit pas se lire comme une panne du balayage.
    const ia = { ragPurge: jest.fn().mockResolvedValue({ data: { examined: 0, purged: 0 } }) }
    const scheduler = make(ia)
    const logged: string[] = []
    jest.spyOn(scheduler['logger'], 'log').mockImplementation(message => logged.push(String(message)))
    await scheduler.runPurge()
    expect(logged.join(' ')).toContain('0 document(s) effacé(s)')
  })
})
