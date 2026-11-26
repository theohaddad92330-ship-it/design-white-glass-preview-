import { getCorrelationContext, getCorrelationId } from './correlation-id.store'
import { Correlated, runInBackgroundCorrelation } from './background-correlation'

describe('runInBackgroundCorrelation', () => {
  it('ouvre un contexte là où il n’y en avait aucun', async () => {
    expect(getCorrelationId()).toBeUndefined()

    const seen = await runInBackgroundCorrelation('worker:test', async () => getCorrelationId())

    expect(seen).toEqual(expect.any(String))
    expect(seen).toHaveLength(36) // uuid v4
    // Le contexte meurt avec la tâche : un job ne doit pas teinter le suivant.
    expect(getCorrelationId()).toBeUndefined()
  })

  // C'est ce qui permet de suivre une action de bout en bout : le clic, la
  // requête HTTP, puis le job qu'elle a mis en file.
  it('hérite de l’identifiant transporté par le job', async () => {
    const seen = await runInBackgroundCorrelation('worker:test', async () => getCorrelationId(), 'cid-du-clic')
    expect(seen).toBe('cid-du-clic')
  })

  it('en génère un quand celui du job est vide ou blanc', async () => {
    const a = await runInBackgroundCorrelation('worker:test', async () => getCorrelationId(), '   ')
    const b = await runInBackgroundCorrelation('worker:test', async () => getCorrelationId(), null)
    expect(a).toEqual(expect.any(String))
    expect(b).toEqual(expect.any(String))
    expect(a).not.toBe(b)
  })

  it('nomme la tâche — un identifiant sans savoir de quoi il parle ne sert à rien', async () => {
    const context = await runInBackgroundCorrelation('cron:privacy-retention.sweep', async () =>
      getCorrelationContext(),
    )
    expect(context).toMatchObject({ requestPath: 'cron:privacy-retention.sweep', requestMethod: 'JOB' })
  })

  it('laisse passer l’erreur telle quelle', async () => {
    const boom = new Error('la tâche a échoué')
    await expect(
      runInBackgroundCorrelation('worker:test', async () => {
        throw boom
      }),
    ).rejects.toBe(boom)
  })
})

describe('@Correlated', () => {
  class Tache {
    lastArgs: unknown[] = []

    @Correlated('cron:test.balayage')
    async balayage(...args: unknown[]): Promise<{ cid: string | undefined; label?: string }> {
      this.lastArgs = args
      return { cid: getCorrelationId(), label: getCorrelationContext()?.requestPath }
    }
  }

  it('ouvre le contexte pour toute la durée de l’appel', async () => {
    const result = await new Tache().balayage()
    expect(result.cid).toEqual(expect.any(String))
    expect(result.label).toBe('cron:test.balayage')
  })

  it('ne change ni les arguments, ni `this`, ni la valeur de retour', async () => {
    const tache = new Tache()
    const result = await tache.balayage('a', 42)
    // `this` préservé : sans ça, une tâche perdrait ses dépendances injectées.
    expect(tache.lastArgs).toEqual(['a', 42])
    expect(result).toHaveProperty('cid')
  })
})
