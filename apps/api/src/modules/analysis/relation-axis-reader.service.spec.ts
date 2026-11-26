import { RelationAxisReaderService } from './relation-axis-reader.service'
import type { MissionEntity } from '../../database/entities/mission.entity'
import type { ActivityEntity } from '../../database/entities/activity.entity'
import type { AccountEntity } from '../../database/entities/account.entity'
import type { AccountPartnerEntity } from '../../database/entities/account-partner.entity'
import type { PartnerRelationEntity } from '../../database/entities/partner-relation.entity'

type MissionRepoMock = { count: jest.Mock<Promise<number>, [unknown]> }
type ActivityRepoMock = { manager: { query: jest.Mock<Promise<unknown>, [string, unknown[]]> } }
type AccountRepoMock = { findOne: jest.Mock<Promise<unknown>, [unknown]> }

// #3278.1 — `[]` (comportement par défaut) : aucun signal déclaré, clé absente.
function accountsMock(declaredSignalsCount = 0): AccountRepoMock {
  return {
    findOne: jest.fn().mockResolvedValue({ declared_signals: Array.from({ length: declaredSignalsCount }) }),
  }
}

function build(
  missionsCount: number,
  activityRows: Array<{ kind: string; last_occurred_at: Date }>,
  runningCount = 0,
  declaredSignalsCount = 0,
) {
  // 1er appel : missions signées ; 2e : missions EN COURS (#3278.1).
  const missions: MissionRepoMock = {
    count: jest.fn().mockResolvedValueOnce(missionsCount).mockResolvedValueOnce(runningCount),
  }
  const activities: ActivityRepoMock = { manager: { query: jest.fn().mockResolvedValue(activityRows) } }
  const accounts = accountsMock(declaredSignalsCount)
  const service = new RelationAxisReaderService(
    missions as unknown as import('typeorm').Repository<MissionEntity>,
    activities as unknown as import('typeorm').Repository<ActivityEntity>,
    accounts as unknown as import('typeorm').Repository<AccountEntity>,
  )
  return { service, missions, activities, accounts }
}

/**
 * #2298.4 (décision Louis 19/09/2026) — les DEUX sources factuelles de l'axe
 * RELATION que ce service lit en base (missions signées, activités agenda /
 * e-mail), NOMMÉES par `AnalysisService.resolveRelationAxis` qui les reçoit.
 */
describe('RelationAxisReaderService', () => {
  it('compte les missions signées et date le dernier rendez-vous ET les derniers échanges e-mail', async () => {
    const { service, missions, activities } = build(2, [
      { kind: 'meeting', last_occurred_at: new Date('2026-06-01T10:00:00Z') },
      { kind: 'email', last_occurred_at: new Date('2026-05-12T08:00:00Z') },
    ])

    const signals = await service.relationSignalsFor('acc-1')

    expect(signals).toEqual({
      missionsCount: 2,
      consultantHistory: 'former',
      lastMeetingAt: '2026-06-01',
      lastEmailAt: '2026-05-12',
    })
    expect(missions.count).toHaveBeenCalledWith({ where: { account_id: 'acc-1', status: expect.anything() } })
    expect(activities.manager.query).toHaveBeenCalledWith(expect.stringContaining('kind IN'), ['acc-1'])
  })

  describe('#3278.1 — consultant déjà présent / ancien consultant (missions du compte)', () => {
    it('une mission en cours : `present`', async () => {
      const { service } = build(2, [], 1)
      expect(await service.relationSignalsFor('acc-1')).toEqual({ missionsCount: 2, consultantHistory: 'present' })
    })

    it('des missions seulement terminées : `former`', async () => {
      const { service } = build(1, [], 0)
      expect(await service.relationSignalsFor('acc-1')).toEqual({ missionsCount: 1, consultantHistory: 'former' })
    })

    it('aucune mission : la clé est absente, jamais un « former » deviné', async () => {
      const { service } = build(0, [], 0)
      expect((await service.relationSignalsFor('acc-1')).consultantHistory).toBeUndefined()
    })
  })

  it('aucune mission, aucune activité : rend `{}` — jamais un compte à zéro qui se lirait comme une mesure', async () => {
    const { service } = build(0, [])

    expect(await service.relationSignalsFor('acc-1')).toEqual({})
  })

  it('une seule des deux natures présente : ne nomme que celle-là', async () => {
    const { service } = build(0, [{ kind: 'meeting', last_occurred_at: new Date('2026-06-01T10:00:00Z') }])

    expect(await service.relationSignalsFor('acc-1')).toEqual({ lastMeetingAt: '2026-06-01' })
  })

  it("la requête d'activités ne sélectionne jamais `subject` ni `body` — doctrine « le corps ne sort jamais »", async () => {
    const { service, activities } = build(0, [])

    await service.relationSignalsFor('acc-1')

    const [sql] = activities.manager.query.mock.calls[0] as [string, unknown[]]
    expect(sql).not.toMatch(/\bsubject\b/i)
    expect(sql).not.toMatch(/\bbody\b/i)
  })

  describe('#3278.1 — signal d’achat DÉCLARÉ sur le compte (route « signal entrant »)', () => {
    it('au moins un signal déclaré : `declaredSignalPresent: true`', async () => {
      const { service, accounts } = build(0, [], 0, 2)
      expect(await service.relationSignalsFor('acc-1')).toEqual({ declaredSignalPresent: true })
      expect(accounts.findOne).toHaveBeenCalledWith({
        where: { id: 'acc-1' },
        select: expect.objectContaining({ id: true, declared_signals: true, siren: true, workspace_id: true }),
      })
    })

    it('aucun signal déclaré : la clé est absente, jamais un `false` deviné', async () => {
      const { service } = build(0, [], 0, 0)
      expect((await service.relationSignalsFor('acc-1')).declaredSignalPresent).toBeUndefined()
    })
  })

  describe('#2273.9-.21 — partenaires déclarés en place (route « partenaire »)', () => {
    function withPartners(rows: Array<{ name: string }>) {
      const partners = { find: jest.fn().mockResolvedValue(rows) }
      const missions = { count: jest.fn().mockResolvedValue(0) }
      const activities = { manager: { query: jest.fn().mockResolvedValue([]) } }
      const accounts = accountsMock()
      const service = new RelationAxisReaderService(
        missions as unknown as import('typeorm').Repository<MissionEntity>,
        activities as unknown as import('typeorm').Repository<ActivityEntity>,
        accounts as unknown as import('typeorm').Repository<AccountEntity>,
        partners as unknown as import('typeorm').Repository<AccountPartnerEntity>,
      )
      return { service, partners }
    }

    it('rend les noms des partenaires DÉCLARÉS et non écartés, jamais ceux détectés puis ignorés', async () => {
      const { service, partners } = withPartners([{ name: 'Alten' }, { name: ' Alten ' }, { name: 'Sopra' }])

      const signals = await service.relationSignalsFor('acc-1')

      expect(signals).toEqual({ declaredPartners: ['Alten', 'Sopra'] })
      const [arg] = partners.find.mock.calls[0] as [{ where: Record<string, unknown> }]
      expect(arg.where).toMatchObject({ account_id: 'acc-1', relationship: 'partner', source: 'declared' })
      expect(arg.where.dismissed_at).toBeDefined()
    })

    it('aucun partenaire : la clé est absente, jamais une liste vide qui se lirait comme une mesure', async () => {
      const { service } = withPartners([])
      expect(await service.relationSignalsFor('acc-1')).toEqual({})
    })

    it('sans dépôt (specs à constructeur nu) : rien de plus', async () => {
      const { service } = build(0, [])
      expect(await service.relationSignalsFor('acc-1')).toEqual({})
    })
  })
})

/**
 * #2371.4 (#2887, lot M09) — le 10e stade « partenaire actif » : la piste
 * `accounts.siren ↔ partner_relations.siren`, `placements_active > 0`, DANS le
 * même espace (le coût d'accès et les partenaires ne s'agrègent jamais entre
 * espaces — ce sont des concurrents).
 */
describe('RelationAxisReaderService — #2371.4 partenaire actif', () => {
  function buildWithPartners(account: Record<string, unknown> | null, rows: Array<{ placementsActive: number }>) {
    const missions: MissionRepoMock = { count: jest.fn().mockResolvedValue(0) }
    const activities: ActivityRepoMock = { manager: { query: jest.fn().mockResolvedValue([]) } }
    const accounts: AccountRepoMock = { findOne: jest.fn().mockResolvedValue(account) }
    const partnerRelations = { find: jest.fn().mockResolvedValue(rows) }
    const service = new RelationAxisReaderService(
      missions as unknown as import('typeorm').Repository<MissionEntity>,
      activities as unknown as import('typeorm').Repository<ActivityEntity>,
      accounts as unknown as import('typeorm').Repository<AccountEntity>,
      undefined,
      partnerRelations as unknown as import('typeorm').Repository<PartnerRelationEntity>,
    )
    return { service, partnerRelations }
  }

  it('additionne les placements EN COURS du partenaire au même SIREN, dans le même espace', async () => {
    const { service, partnerRelations } = buildWithPartners(
      { declared_signals: [], siren: '552 100 554', workspace_id: 'ws-1' },
      [{ placementsActive: 2 }, { placementsActive: 1 }],
    )
    expect(await service.relationSignalsFor('acc-1')).toEqual({ partnerPlacementsActive: 3 })
    expect(partnerRelations.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ workspaceId: 'ws-1', siren: '552100554' }),
      }),
    )
  })

  it('un partenaire sans placement en cours ne fait AUCUNE clé (jamais un « 0 »)', async () => {
    const { service } = buildWithPartners({ declared_signals: [], siren: '552100554', workspace_id: 'ws-1' }, [
      { placementsActive: 0 },
    ])
    expect(await service.relationSignalsFor('acc-1')).toEqual({})
  })

  it('sans SIREN ou sans espace, aucune lecture — on ne rapproche jamais par le nom', async () => {
    const { service, partnerRelations } = buildWithPartners(
      { declared_signals: [], siren: null, workspace_id: 'ws-1' },
      [{ placementsActive: 4 }],
    )
    expect(await service.relationSignalsFor('acc-1')).toEqual({})
    expect(partnerRelations.find).not.toHaveBeenCalled()
  })
})

// #3278.1 (#3278 — le plan asynchrone) — les quatre signaux de route que le pont `/chat` lisait déjà
// (veille seule, depuis un talent, événement/communauté, inbound/contenu) voyagent aussi vers la phase plan.
describe('RelationAxisReaderService — #3278.1 signaux de route pour le plan asynchrone', () => {
  function buildWith(account: Record<string, unknown>, experienceNames: string[] = []) {
    const missions = { count: jest.fn().mockResolvedValue(0) }
    const manager = {
      query: jest.fn().mockImplementation(async (sql: string) => {
        if (sql.includes('consultant_experiences')) return experienceNames.map(name => ({ name }))
        return []
      }),
    }
    const activities = { manager }
    const accounts = { manager, findOne: jest.fn().mockResolvedValue({ declared_signals: [], ...account }) }
    const service = new RelationAxisReaderService(
      missions as unknown as import('typeorm').Repository<MissionEntity>,
      activities as unknown as import('typeorm').Repository<ActivityEntity>,
      accounts as unknown as import('typeorm').Repository<AccountEntity>,
    )
    return { service, activities }
  }

  it('niveau d’effort « veille » : `watch_only`', async () => {
    const { service } = buildWith({ sprint: 'watch' })
    expect((await service.relationSignalsFor('acc-1')).routeSignals).toEqual({ watch_only: true })
  })

  it('un talent du vivier au nom exact du compte : `talent_from_account`', async () => {
    const { service } = buildWith({ company_name: 'Société Générale', workspace_id: 'ws-1' }, ['societe generale'])
    expect((await service.relationSignalsFor('acc-1')).routeSignals).toEqual({ talent_from_account: true })
  })

  it('faits déclarés événement / inbound : leurs deux signaux', async () => {
    const { service } = buildWith({ declared_route_event: 'Salon Big Data', declared_route_inbound: ' livre blanc ' })
    expect((await service.relationSignalsFor('acc-1')).routeSignals).toEqual({
      event_community: true,
      inbound_content: true,
    })
  })

  it('rien de tout cela : la clé est absente (jamais un objet vide ni un `false`)', async () => {
    const { service, activities } = buildWith({ sprint: 'active', company_name: 'Acme', workspace_id: 'ws-1' })
    const signals = await service.relationSignalsFor('acc-1')
    expect(signals).not.toHaveProperty('routeSignals')
    expect(activities.manager.query).toHaveBeenCalledWith(expect.stringContaining('consultant_experiences'), ['ws-1'])
  })
})

// #3278.a — le plan asynchrone reçoit aussi preuves / historique des canaux (jusqu'ici /chat seul).
describe('RelationAxisReaderService — #3278.a critères accumulés pour le plan', () => {
  function buildWithFind(find: jest.Mock | undefined) {
    const missions = { count: jest.fn().mockResolvedValue(0) }
    const manager = { query: jest.fn().mockResolvedValue([]), ...(find ? { find } : {}) }
    const accounts = {
      manager,
      findOne: jest
        .fn()
        .mockResolvedValue({ declared_signals: [], id: 'acc-1', sector: 'Énergie', workspace_id: 'ws-1' }),
    }
    return new RelationAxisReaderService(
      missions as unknown as import('typeorm').Repository<MissionEntity>,
      { manager } as unknown as import('typeorm').Repository<ActivityEntity>,
      accounts as unknown as import('typeorm').Repository<AccountEntity>,
    )
  }

  it('un historique de canaux lu : porté au plan, sans corps de message', async () => {
    const find = jest.fn(async (entity: { name: string }) => {
      if (entity.name === 'ContactEntity') return [{ id: 'c-1' }]
      if (entity.name === 'OutreachMessageEntity') return [{ channel: 'linkedin' }]
      return []
    })
    const signals = await buildWithFind(find).relationSignalsFor('acc-1')
    expect(signals.accumulatedRouteCriteria).toEqual({
      channel_history: 'linkedin ×1 (messages préparés sur ce compte)',
    })
  })

  it('lecture faite, rien trouvé : `{}` (le plan le DIT) ; lecture impossible : clé absente (rien de dit)', async () => {
    const empty = await buildWithFind(jest.fn().mockResolvedValue([])).relationSignalsFor('acc-1')
    expect(empty.accumulatedRouteCriteria).toEqual({})
    const failed = await buildWithFind(jest.fn().mockRejectedValue(new Error('db down'))).relationSignalsFor('acc-1')
    expect(failed).not.toHaveProperty('accumulatedRouteCriteria')
    const noManager = await buildWithFind(undefined).relationSignalsFor('acc-1')
    expect(noManager).not.toHaveProperty('accumulatedRouteCriteria')
  })
})

// #4680 — la QUATRIÈME source en base : les contacts CONNUS (import / CRM) rattachés au compte.
describe('RelationAxisReaderService — contacts connus (#4680)', () => {
  function buildWithKnown(knownCount: number) {
    const count = jest.fn().mockResolvedValue(knownCount)
    const missions = { count: jest.fn().mockResolvedValue(0) }
    const activities = { manager: { query: jest.fn().mockResolvedValue([]) } }
    const accounts = {
      findOne: jest.fn().mockResolvedValue({ id: 'acc-1', workspace_id: 'ws-1', declared_signals: [] }),
      manager: { query: jest.fn().mockResolvedValue([]) },
    }
    const service = new RelationAxisReaderService(
      missions as unknown as import('typeorm').Repository<MissionEntity>,
      activities as unknown as import('typeorm').Repository<ActivityEntity>,
      accounts as unknown as import('typeorm').Repository<AccountEntity>,
      undefined,
      undefined,
      { count } as unknown as import('typeorm').Repository<
        import('../../database/entities/contact.entity').ContactEntity
      >,
    )
    return { service, count }
  }

  it('rend le NOMBRE de contacts connus du compte, dans l’espace de l’appelant', async () => {
    const { service, count } = buildWithKnown(2)
    const signals = await service.relationSignalsFor('acc-1')
    expect(signals.knownContactsCount).toBe(2)
    const where = count.mock.calls[0]?.[0]?.where
    expect(where).toMatchObject({ account_id: 'acc-1', workspace_id: 'ws-1', hidden: false })
    // Le prédicat vient des contrats : import ET crm, rien d'autre.
    expect(where.source._value).toEqual(['import', 'crm'])
  })

  it('SAIT DIRE NON — aucun contact connu : la clé est absente, jamais un « 0 »', async () => {
    const { service } = buildWithKnown(0)
    expect(await service.relationSignalsFor('acc-1')).not.toHaveProperty('knownContactsCount')
  })
})
