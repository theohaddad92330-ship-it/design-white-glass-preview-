import { findRoutine } from '../routines/routine-catalog'
import { ManagerService } from './manager.service'

/**
 * #2399.8 (axe WORKSPACE) — vue manager des routines d'équipe, LECTURE SEULE.
 *
 * Testé sur la méthode privée `teamRoutines`, comme `manager-pipeline-value-
 * stages.spec.ts` le fait déjà pour `pipelineValue` : `getTeamStats` a déjà sa
 * propre couverture d'intégration dans `manager.service.spec.ts`, et cette
 * garde vise le PÉRIMÈTRE (« on n'affiche pas ce qu'on n'a pas ») plutôt que de
 * recâbler tout le cockpit pour un seul bloc.
 */
describe('ManagerService — teamRoutines (#2399.8)', () => {
  const definition = findRoutine('no_reply_follow_up')
  if (!definition) throw new Error('routine de test introuvable dans le catalogue')

  const members = [
    { userId: 'u1', role: 'member' as const, firstName: 'Ana', lastName: null, email: 'ana@ex.com' },
    { userId: 'u2', role: 'member' as const, firstName: 'Bo', lastName: null, email: 'bo@ex.com' },
  ]

  function wireQuery(subscriptions: unknown[], runs: unknown[]) {
    return jest.fn(async (sql: string) => {
      if (sql.includes('FROM routine_subscriptions')) return subscriptions
      if (sql.includes('FROM routine_runs')) return runs
      return []
    })
  }

  it("n'affiche que les abonnements RÉELLEMENT matérialisés — un membre sans ligne n'apparaît pas", async () => {
    const query = wireQuery(
      [
        {
          userId: 'u1',
          routineKey: definition.key,
          status: 'active',
          channel: 'in_app',
          hour: 8,
          weekday: null,
          timeZone: 'Europe/Paris',
        },
      ],
      [],
    )
    const service = new ManagerService({ query } as never, {} as never)
    const overview = await service['teamRoutines'](members)

    expect(overview.members).toHaveLength(1)
    expect(overview.members[0]?.user_id).toBe('u1')
    expect(overview.members[0]?.routines).toHaveLength(1)
    expect(overview.members[0]?.routines[0]?.key).toBe(definition.key)
    // u2 n'a aucune ligne matérialisée : absent, jamais un tableau vide affiché
    // à côté d'un membre qui, lui, a réellement tout désactivé.
    expect(overview.members.find(m => m.user_id === 'u2')).toBeUndefined()
  })

  it('dérive lastFailed de la même convention `Échec : ` que le service personnel, jamais devinée', async () => {
    const query = wireQuery(
      [
        {
          userId: 'u1',
          routineKey: definition.key,
          status: 'active',
          channel: 'in_app',
          hour: 8,
          weekday: null,
          timeZone: 'Europe/Paris',
        },
      ],
      [
        {
          userId: 'u1',
          routineKey: definition.key,
          createdAt: '2026-09-20T08:00:00.000Z',
          outcome: 'Échec : mailbox indisponible',
        },
      ],
    )
    const service = new ManagerService({ query } as never, {} as never)
    const overview = await service['teamRoutines'](members)

    const entry = overview.members[0]?.routines[0]
    expect(entry?.lastFailed).toBe(true)
    expect(entry?.lastRunAt).toBe('2026-09-20T08:00:00.000Z')
  })

  it('jamais exécutée : lastRunAt est null et lastFailed reste `undefined`, jamais `false` deviné', async () => {
    const query = wireQuery(
      [
        {
          userId: 'u1',
          routineKey: definition.key,
          status: 'paused',
          channel: 'in_app',
          hour: 8,
          weekday: null,
          timeZone: 'Europe/Paris',
        },
      ],
      [],
    )
    const service = new ManagerService({ query } as never, {} as never)
    const overview = await service['teamRoutines'](members)

    const entry = overview.members[0]?.routines[0]
    expect(entry?.lastRunAt).toBeNull()
    expect(entry?.lastFailed).toBeUndefined()
    // Statut `paused` : aucun prochain déclenchement à nommer.
    expect(entry?.nextTriggerAt).toBeNull()
  })

  it('ignore une ligne orpheline (clé retirée du catalogue) sans inventer de nom', async () => {
    const query = wireQuery(
      [
        {
          userId: 'u1',
          routineKey: 'routine_disparue_du_catalogue',
          status: 'active',
          channel: 'in_app',
          hour: 8,
          weekday: null,
          timeZone: 'Europe/Paris',
        },
      ],
      [],
    )
    const service = new ManagerService({ query } as never, {} as never)
    const overview = await service['teamRoutines'](members)

    expect(overview.members).toHaveLength(0)
  })

  it('sans membre, ne query rien et rend une liste vide', async () => {
    const query = jest.fn().mockResolvedValue([])
    const service = new ManagerService({ query } as never, {} as never)
    const overview = await service['teamRoutines']([])

    expect(overview).toEqual({ members: [] })
    expect(query).not.toHaveBeenCalled()
  })
})
