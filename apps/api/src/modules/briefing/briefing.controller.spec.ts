import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import type { DailyBriefing } from '@bellum/contracts'
import { AccountEntity } from '../../database/entities/account.entity'
import { ContactsService } from '../contacts/contacts.service'
import { MarketMemoryService } from '../market-memory/market-memory.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { DiscoverAlertEventService } from '../notifications/discover-alerts/discover-alert-event.service'
import { BriefingController } from './briefing.controller'
import { BriefingService } from './briefing.service'
import { DailyBriefMarkerService } from './daily-brief-marker.service'

/**
 * #1637 — LE DÉPARTAGE PAR LA MÉMOIRE MARCHÉ, AU NIVEAU DU CONTRÔLEUR.
 *
 * ⚠️ Le réordonnancement vit ICI (`BriefingController`) et non dans
 * `BriefingService` : GA-07 n'a plus qu'un slot, et l'orchestration d'un
 * service voisin passe par le contrôleur — voir `module-boundaries.spec.ts`.
 * Ces tests défendent donc le COMPORTEMENT DE BOUT EN BOUT de la route
 * `GET /briefing/today`, pas seulement la fonction pure (déjà couverte par
 * `accounts-to-watch-market-rank.spec.ts`).
 */
function baseBriefing(accountsToWatch: DailyBriefing['accountsToWatch']): DailyBriefing {
  return {
    date: '2026-09-09',
    timeZone: 'Europe/Paris',
    firstName: 'Théo',
    protectedTime: null,
    agendaPreferences: {},
    agenda: {
      state: 'ready',
      reason: null,
      readAt: '2026-09-09T08:00:00.000Z',
      events: [],
      conflicts: [],
      needsPreparation: [],
    },
    mail: {
      state: 'ready',
      reason: null,
      readAt: '2026-09-09T08:00:00.000Z',
      awaitingReply: [],
      unread: [],
      positiveReplies: [],
    },
    tasks: {
      state: 'ready',
      reason: null,
      readAt: '2026-09-09T08:00:00.000Z',
      tasks: [],
      overdueCount: 0,
      todayCount: 0,
    },
    accountsToWatch,
    // #2151.23 — posées par le contrôleur, pas par le service : le brief de
    // base les rend vides, et c'est ce que ce témoin doit refléter.
    discoverAlerts: [],
    discoverAlertsLastEventAt: null,
    chainBlockers: [],
    criticalRisks: [],
    runningJobs: [],
    actions: [],
    generatedAt: '2026-09-09T07:00:00.000Z',
  }
}

describe('BriefingController — GET /briefing/today', () => {
  const briefingService = { build: jest.fn(), sinceLastVisit: jest.fn() }
  const marketMemory = { pathsFor: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  // #2151.23 — le registre des événements de Découvrir, doublé : la route le
  // lit à chaque passage, y compris quand il n'y a rien.
  const discoverAlerts = { forToday: jest.fn(), lastOccurredAt: jest.fn() }
  const dailyBriefMarker = { consumeFirstOpenToday: jest.fn() }
  const accounts = { find: jest.fn() }
  // #2107.42 — le classement des contacts, MÊME lecture que l'onglet Contacts.
  // Vide par défaut : un compte sans classement lu vaut `accessPath: null`,
  // jamais un accès deviné.
  const contacts = { topAccessPaths: jest.fn() }

  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()
    accounts.find.mockResolvedValue([])
    contacts.topAccessPaths.mockResolvedValue(new Map())
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1' })
    discoverAlerts.forToday.mockResolvedValue([])
    discoverAlerts.lastOccurredAt.mockResolvedValue(null)

    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: DailyBriefMarkerService, useValue: dailyBriefMarker },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: DiscoverAlertEventService, useValue: discoverAlerts },
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile()

    controller = moduleRef.get(BriefingController)
  })

  it('réordonne `accountsToWatch` selon la mémoire marché — le compte couvert remonte, à exactitude égale', async () => {
    const uncovered = {
      accountId: 'a-uncovered',
      companyName: 'Uncovered SAS',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/a-uncovered',
      detectedAt: '2026-09-07T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    const covered = {
      accountId: 'b-covered',
      companyName: 'Covered SAS',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/b-covered',
      detectedAt: '2026-09-05T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    briefingService.build.mockResolvedValue(baseBriefing([uncovered, covered]))
    accounts.find.mockResolvedValue([
      { id: 'a-uncovered', website: null, registry_country: null },
      { id: 'b-covered', website: 'covered.example', registry_country: 'FR' },
    ])
    marketMemory.pathsFor.mockResolvedValue({
      status: 'ok',
      paths: new Map([
        ['a-uncovered', null],
        ['b-covered', 40],
      ]),
    })

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    expect(result.accountsToWatch.map(entry => entry.accountId)).toEqual(['b-covered', 'a-uncovered'])
  })

  it('#2107.40 — porte le NOMBRE de parcours de marché sur la carte, la même lecture que le tri', async () => {
    const uncovered = {
      accountId: 'a-uncovered',
      companyName: 'Uncovered SAS',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/a-uncovered',
      detectedAt: '2026-09-07T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    const covered = {
      accountId: 'b-covered',
      companyName: 'Covered SAS',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/b-covered',
      detectedAt: '2026-09-05T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    briefingService.build.mockResolvedValue(baseBriefing([uncovered, covered]))
    accounts.find.mockResolvedValue([
      { id: 'a-uncovered', website: null, registry_country: null },
      { id: 'b-covered', website: 'covered.example', registry_country: 'FR' },
    ])
    marketMemory.pathsFor.mockResolvedValue({
      status: 'ok',
      paths: new Map([
        ['a-uncovered', null],
        ['b-covered', 40],
      ]),
    })

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    const byId = new Map(result.accountsToWatch.map(entry => [entry.accountId, entry.structuralPotentialPaths]))
    expect(byId.get('b-covered')).toBe(40)
    expect(byId.get('a-uncovered')).toBeNull()
  })

  /**
   * #2107.42 — « accès réel » : la voie d'accès du contact le mieux classé,
   * MÊME lecture que l'onglet Contacts (`ContactsService.rankForAccount`).
   */
  it('#2107.42 — porte la voie d’accès du contact le mieux classé, un par compte', async () => {
    const a = {
      accountId: 'a',
      companyName: 'A',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/a',
      detectedAt: '2026-09-07T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    const b = { ...a, accountId: 'b', companyName: 'B', href: '/accounts/b' }
    briefingService.build.mockResolvedValue(baseBriefing([a, b]))
    contacts.topAccessPaths.mockResolvedValue(
      new Map([
        ['a', { kind: 'verified_email', missing_reason: null }],
        ['b', { kind: null, missing_reason: 'searched_nothing_found' }],
      ]),
    )

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    // Perf 29/09 : UNE lecture pour tous les comptes, jamais une par compte.
    expect(contacts.topAccessPaths).toHaveBeenCalledTimes(1)
    expect(contacts.topAccessPaths).toHaveBeenCalledWith(['a', 'b'], 'u1')
    const byId = new Map(result.accountsToWatch.map(entry => [entry.accountId, entry.accessPath]))
    expect(byId.get('a')).toEqual({ kind: 'verified_email', missing_reason: null })
    expect(byId.get('b')).toEqual({ kind: null, missing_reason: 'searched_nothing_found' })
  })

  it('#2107.42 — `null` quand le compte n’a aucun contact classable, jamais une voie d’accès devinée', async () => {
    const a = {
      accountId: 'a',
      companyName: 'A',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/a',
      detectedAt: '2026-09-07T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    briefingService.build.mockResolvedValue(baseBriefing([a]))
    contacts.topAccessPaths.mockResolvedValue(new Map([['a', null]]))

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    expect(result.accountsToWatch[0]?.accessPath).toBeNull()
  })

  // GARDE PERF (29/09/2026, `GET /briefing/today` 8,5 s) : le nombre de lectures
  // ne dépend pas du nombre de comptes à surveiller.
  it.each([3, 30])('%i comptes à surveiller : UNE lecture des voies d’accès et UNE de la mémoire marché', async n => {
    const entries = Array.from({ length: n }, (_, i) => ({
      accountId: `acc-${i}`,
      companyName: `Compte ${i}`,
      reasonKey: 'briefing.account.freshSignal',
      href: `/accounts/acc-${i}`,
      detectedAt: '2026-09-07T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }))
    briefingService.build.mockResolvedValue(baseBriefing(entries))
    accounts.find.mockResolvedValue(entries.map(entry => ({ id: entry.accountId, workspace_id: 'w1' })))
    marketMemory.pathsFor.mockResolvedValue({ status: 'ok', paths: new Map() })

    await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    expect(contacts.topAccessPaths).toHaveBeenCalledTimes(1)
    expect(marketMemory.pathsFor).toHaveBeenCalledTimes(1)
    // 1 lecture des comptes du marché + 0 pour les alertes (aucun événement).
    expect(accounts.find).toHaveBeenCalledTimes(1)
  })

  it('#3414 — `readAs` valide est transmis au service ; un rôle inconnu est ignoré, jamais une erreur', async () => {
    briefingService.build.mockResolvedValue(baseBriefing([]))
    const user = { userId: 'u1', email: 'u1@test.fr' } as never

    await controller.today(user, 'Europe/Paris', 'recruiter')
    expect(briefingService.build).toHaveBeenLastCalledWith('u1', undefined, 'Europe/Paris', 'recruiter')

    await controller.today(user, 'Europe/Paris', 'pirate')
    expect(briefingService.build).toHaveBeenLastCalledWith('u1', undefined, 'Europe/Paris', undefined)
  })

  it('la lecture des voies d’accès qui casse en bloc ne fait pas tomber le brief', async () => {
    const a = {
      accountId: 'a',
      companyName: 'A',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/a',
      detectedAt: '2026-09-07T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    briefingService.build.mockResolvedValue(baseBriefing([a]))
    contacts.topAccessPaths.mockRejectedValue(new Error('base indisponible'))

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    expect(result.accountsToWatch[0]?.accessPath).toBeNull()
  })

  it('#2107.42 — un classement qui CASSE sur un compte n’empêche pas les autres, et ne fait jamais tomber le brief', async () => {
    const a = {
      accountId: 'a',
      companyName: 'A',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/a',
      detectedAt: '2026-09-07T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    const b = { ...a, accountId: 'b', companyName: 'B', href: '/accounts/b' }
    briefingService.build.mockResolvedValue(baseBriefing([a, b]))
    // Un compte dont le classement casse est `null` DANS la carte (le service
    // le garantit compte par compte) : il n'empêche pas les autres.
    contacts.topAccessPaths.mockResolvedValue(
      new Map([
        ['a', null],
        ['b', { kind: 'phone', missing_reason: null }],
      ]),
    )

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    const byId = new Map(result.accountsToWatch.map(entry => [entry.accountId, entry.accessPath]))
    expect(byId.get('a')).toBeNull()
    expect(byId.get('b')).toEqual({ kind: 'phone', missing_reason: null })
  })

  it('ne remonte JAMAIS un compte backfill au-dessus d’un compte à détection exacte, même massivement couvert', async () => {
    const exact = {
      accountId: 'a-exact',
      companyName: 'Exact SAS',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/a-exact',
      detectedAt: '2026-09-08T08:00:00.000Z',
      detectionExact: true,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    const tracked = {
      accountId: 'b-tracked',
      companyName: 'Tracked SAS',
      reasonKey: 'briefing.account.freshSignal',
      href: '/accounts/b-tracked',
      detectedAt: '2026-09-08T08:00:00.000Z',
      detectionExact: false,
      signalLabel: null,
      esnReason: null,
      signalSourceUrl: null,
      signalSourceKind: null,
      structuralPotentialPaths: null,
      accessPath: null,
      history: [],
      logoUrl: null,
      website: null,
    }
    briefingService.build.mockResolvedValue(baseBriefing([tracked, exact]))
    accounts.find.mockResolvedValue([
      { id: 'a-exact', website: null, registry_country: null },
      { id: 'b-tracked', website: null, registry_country: null },
    ])
    marketMemory.pathsFor.mockResolvedValue({
      status: 'ok',
      paths: new Map([
        ['a-exact', null],
        ['b-tracked', 900],
      ]),
    })

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    expect(result.accountsToWatch.map(entry => entry.accountId)).toEqual(['a-exact', 'b-tracked'])
  })

  it('laisse `accountsToWatch` INTACT quand la mémoire marché est indisponible — pas de « 0 » silencieux', async () => {
    const entries = [
      {
        accountId: 'a',
        companyName: 'A',
        reasonKey: 'briefing.account.freshSignal',
        href: '/accounts/a',
        detectedAt: '2026-09-01T08:00:00.000Z',
        detectionExact: true,
        signalLabel: null,
        esnReason: null,
        signalSourceUrl: null,
        signalSourceKind: null,
        structuralPotentialPaths: null,
        accessPath: null,
        history: [],
        logoUrl: null,
        website: null,
      },
      {
        accountId: 'b',
        companyName: 'B',
        reasonKey: 'briefing.account.freshSignal',
        href: '/accounts/b',
        detectedAt: '2026-09-08T08:00:00.000Z',
        detectionExact: true,
        signalLabel: null,
        esnReason: null,
        signalSourceUrl: null,
        signalSourceKind: null,
        structuralPotentialPaths: null,
        accessPath: null,
        history: [],
        logoUrl: null,
        website: null,
      },
    ]
    briefingService.build.mockResolvedValue(baseBriefing(entries))
    marketMemory.pathsFor.mockResolvedValue({ status: 'unavailable', reason: 'read_failed' })

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    // Sans mémoire disponible, seul le signal décide — b (plus récent) reste devant.
    expect(result.accountsToWatch.map(entry => entry.accountId)).toEqual(['b', 'a'])
    // #2107.40 — indisponible n'écrit jamais un volume deviné : `null` partout.
    expect(result.accountsToWatch.every(entry => entry.structuralPotentialPaths === null)).toBe(true)
  })

  it('ne casse pas le brief quand la lecture de la mémoire marché lève', async () => {
    briefingService.build.mockResolvedValue(
      baseBriefing([
        {
          accountId: 'a',
          companyName: 'A',
          reasonKey: 'briefing.account.freshSignal',
          href: '/accounts/a',
          detectedAt: '2026-09-01T08:00:00.000Z',
          detectionExact: true,
          signalLabel: null,
          esnReason: null,
          signalSourceUrl: null,
          signalSourceKind: null,
          structuralPotentialPaths: null,
          accessPath: null,
          history: [],
          logoUrl: null,
          website: null,
        },
      ]),
    )
    marketMemory.pathsFor.mockRejectedValue(new Error('boom'))

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    expect(result.accountsToWatch).toHaveLength(1)
  })

  it('ne touche à rien quand `accountsToWatch` est vide — pas de lecture de la mémoire marché', async () => {
    briefingService.build.mockResolvedValue(baseBriefing([]))

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    expect(result.accountsToWatch).toEqual([])
    expect(marketMemory.pathsFor).not.toHaveBeenCalled()
    expect(contacts.topAccessPaths).not.toHaveBeenCalled()
  })

  /**
   * #2097.21 (correctif) — « Alertes de Découvrir » mesurée en prod le 25/09 :
   * aucune carte n'affichait d'image. Seul `new_signal` porte un sujet dont on
   * SAIT que c'est un compte (`hrefForDiscoverAlert` route les cinq autres
   * genres ailleurs, ou pas du tout) : le contrôleur doit résoudre son logo et
   * son site, sans jamais deviner un logo pour un sujet qui n'est pas un compte.
   */
  it('résout le logo et le site du compte pour une alerte `new_signal`', async () => {
    briefingService.build.mockResolvedValue(baseBriefing([]))
    discoverAlerts.forToday.mockResolvedValue([
      {
        id: 'evt-1',
        kind: 'new_signal',
        subject_id: 'acc-1',
        subject_label: 'Thales',
        saved_view_id: null,
        occurred_at: new Date('2026-09-09T06:00:00.000Z'),
      },
    ])
    accounts.find.mockResolvedValue([{ id: 'acc-1', logo_url: null, website: 'https://www.thalesgroup.com' }])

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    expect(accounts.find).toHaveBeenCalledWith(expect.objectContaining({ where: { id: expect.anything() } }))
    expect(result.discoverAlerts).toEqual([
      expect.objectContaining({ id: 'evt-1', logoUrl: null, website: 'https://www.thalesgroup.com' }),
    ])
  })

  it('ne devine jamais un logo pour un sujet qui n’est pas un compte (`mission_ended`)', async () => {
    briefingService.build.mockResolvedValue(baseBriefing([]))
    discoverAlerts.forToday.mockResolvedValue([
      {
        id: 'evt-2',
        kind: 'mission_ended',
        subject_id: 'mission-1',
        subject_label: 'Support N2',
        saved_view_id: null,
        occurred_at: new Date('2026-09-09T06:00:00.000Z'),
      },
    ])

    const result = await controller.today({ userId: 'u1', email: 'u1@test.fr' } as never)

    expect(result.discoverAlerts).toEqual([expect.objectContaining({ id: 'evt-2', logoUrl: null, website: null })])
  })
})

/**
 * #1936, lot 7A — LE SIGNAL « PREMIÈRE OUVERTURE DU JOUR ».
 *
 * Ces tests défendent le COMPORTEMENT DE LA ROUTE, pas le calcul lui-même
 * (couvert par `daily-brief-marker.service.spec.ts`) : la démo court-circuite
 * AVANT toute écriture, un fuseau illisible ne fait jamais échouer l'appel, et
 * le résultat du service traverse tel quel.
 */
describe('BriefingController — POST /briefing/first-open-today', () => {
  const briefingService = { build: jest.fn(), sinceLastVisit: jest.fn() }
  const marketMemory = { pathsFor: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  // #2151.23 — le registre des événements de Découvrir, doublé : la route le
  // lit à chaque passage, y compris quand il n'y a rien.
  const discoverAlerts = { forToday: jest.fn(), lastOccurredAt: jest.fn() }
  const dailyBriefMarker = { consumeFirstOpenToday: jest.fn() }
  const accounts = { find: jest.fn() }
  const contacts = { topAccessPaths: jest.fn() }

  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'w1' })
    discoverAlerts.forToday.mockResolvedValue([])
    discoverAlerts.lastOccurredAt.mockResolvedValue(null)
    dailyBriefMarker.consumeFirstOpenToday.mockResolvedValue(true)

    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: DailyBriefMarkerService, useValue: dailyBriefMarker },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: DiscoverAlertEventService, useValue: discoverAlerts },
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile()

    controller = moduleRef.get(BriefingController)
  })

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  it('délègue au marqueur avec le fuseau reçu, hors démo', async () => {
    const result = await controller.firstOpenToday(user, { timeZone: 'America/New_York' })

    expect(dailyBriefMarker.consumeFirstOpenToday).toHaveBeenCalledWith('u1', 'America/New_York')
    expect(result).toEqual({ isFirstOpenToday: true })
  })

  it('en espace démo, rend toujours `true` SANS toucher le marqueur', async () => {
    workspaceContext.isDemoWorkspace.mockResolvedValue(true)

    const result = await controller.firstOpenToday(user, { timeZone: 'Europe/Paris' })

    expect(result).toEqual({ isFirstOpenToday: true })
    expect(dailyBriefMarker.consumeFirstOpenToday).not.toHaveBeenCalled()
  })

  it('un corps sans fuseau délègue avec `undefined` — pas d’échec', async () => {
    const result = await controller.firstOpenToday(user, {})

    expect(dailyBriefMarker.consumeFirstOpenToday).toHaveBeenCalledWith('u1', undefined)
    expect(result).toEqual({ isFirstOpenToday: true })
  })

  it('un corps illisible (fuseau vide, type invalide) ne fait JAMAIS échouer la route', async () => {
    const result = await controller.firstOpenToday(user, { timeZone: '' })

    expect(dailyBriefMarker.consumeFirstOpenToday).toHaveBeenCalledWith('u1', undefined)
    expect(result).toEqual({ isFirstOpenToday: true })
  })

  it('un corps absent (`undefined`) ne fait pas non plus échouer la route', async () => {
    const result = await controller.firstOpenToday(user, undefined)

    expect(dailyBriefMarker.consumeFirstOpenToday).toHaveBeenCalledWith('u1', undefined)
    expect(result).toEqual({ isFirstOpenToday: true })
  })

  it('rend `false` quand le marqueur le rend — deuxième appel du jour', async () => {
    dailyBriefMarker.consumeFirstOpenToday.mockResolvedValue(false)

    const result = await controller.firstOpenToday(user, {})

    expect(result).toEqual({ isFirstOpenToday: false })
  })
})

/**
 * #2107 (Centre d'actions) — `GET /briefing/actions` délègue à
 * `BriefingService.allActions`, jamais plafonné : ce test défend le
 * COMPORTEMENT DE LA ROUTE (délégation + forme de la réponse), la dérivation
 * elle-même est couverte par `briefing.service.spec.ts`.
 */
describe('BriefingController — GET /briefing/actions', () => {
  const briefingService = { build: jest.fn(), sinceLastVisit: jest.fn(), allActions: jest.fn() }
  const marketMemory = { pathsFor: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  const discoverAlerts = { forToday: jest.fn(), lastOccurredAt: jest.fn() }
  const dailyBriefMarker = { consumeFirstOpenToday: jest.fn() }
  const accounts = { find: jest.fn() }
  const contacts = { topAccessPaths: jest.fn() }

  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()

    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: DailyBriefMarkerService, useValue: dailyBriefMarker },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: DiscoverAlertEventService, useValue: discoverAlerts },
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile()

    controller = moduleRef.get(BriefingController)
  })

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  it('délègue à `allActions` et rend la liste ENTIÈRE, sans la tronquer', async () => {
    const actions = Array.from({ length: 11 }, (_, i) => ({ id: `a${i}`, kind: 'follow_up' })) as never
    briefingService.allActions.mockResolvedValue(actions)

    const result = await controller.allActions(user)

    expect(briefingService.allActions).toHaveBeenCalledWith('u1')
    expect(result).toEqual({ actions })
    expect(result.actions).toHaveLength(11)
  })
})

/**
 * #2397.7 — le geste « ceci correspond à mon rôle », posé sur un GENRE de
 * carte. Corps validé STRICT (`briefingRoleFitFeedbackRequestSchema`) : un
 * genre hors énumération ou un `engaged` non booléen est un 400, jamais deviné.
 */
describe('BriefingController — POST /briefing/role-fit', () => {
  const briefingService = { build: jest.fn(), sinceLastVisit: jest.fn(), setRoleFit: jest.fn() }
  const marketMemory = { pathsFor: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  const discoverAlerts = { forToday: jest.fn(), lastOccurredAt: jest.fn() }
  const dailyBriefMarker = { consumeFirstOpenToday: jest.fn() }
  const accounts = { find: jest.fn() }
  const contacts = { topAccessPaths: jest.fn() }

  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()
    briefingService.setRoleFit.mockResolvedValue(undefined)

    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: DailyBriefMarkerService, useValue: dailyBriefMarker },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: DiscoverAlertEventService, useValue: discoverAlerts },
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile()

    controller = moduleRef.get(BriefingController)
  })

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  it('délègue au service avec le genre et le booléen reçus', async () => {
    const result = await controller.setRoleFit(user, { kind: 'follow_up', engaged: true })

    expect(briefingService.setRoleFit).toHaveBeenCalledWith('u1', 'follow_up', true)
    expect(result).toEqual({ engaged: true })
  })

  it('refuse (400) un genre hors de BRIEFING_ACTION_KINDS — jamais deviné', async () => {
    await expect(controller.setRoleFit(user, { kind: 'invente', engaged: true })).rejects.toThrow()
    expect(briefingService.setRoleFit).not.toHaveBeenCalled()
  })

  it('refuse (400) un corps sans `engaged` booléen', async () => {
    await expect(controller.setRoleFit(user, { kind: 'follow_up' })).rejects.toThrow()
    expect(briefingService.setRoleFit).not.toHaveBeenCalled()
  })

  it('refuse (400) un corps absent', async () => {
    await expect(controller.setRoleFit(user, undefined)).rejects.toThrow()
  })
})

/**
 * #2099.17-.32 (épopée #2767) — Reporter / Pas pertinent / Déjà traité. Un
 * refus sans motif, un report sans date : 400, jamais un défaut deviné.
 */
describe('BriefingController — POST /briefing/card-disposition', () => {
  const briefingService = { setCardDisposition: jest.fn() }
  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()
    briefingService.setCardDisposition.mockResolvedValue(undefined)
    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: {} },
        { provide: WorkspaceContextService, useValue: {} },
        { provide: DailyBriefMarkerService, useValue: {} },
        { provide: getRepositoryToken(AccountEntity), useValue: {} },
        { provide: DiscoverAlertEventService, useValue: {} },
        { provide: ContactsService, useValue: {} },
      ],
    }).compile()
    controller = moduleRef.get(BriefingController)
  })

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  it('enregistre un refus motivé pour le lecteur', async () => {
    const result = await controller.setCardDisposition(user, {
      actionId: 'payment:i1',
      disposition: 'dismissed',
      reason: 'wrong_data',
    })
    expect(briefingService.setCardDisposition).toHaveBeenCalledWith('u1', {
      actionId: 'payment:i1',
      disposition: 'dismissed',
      reason: 'wrong_data',
      factObservedAt: null,
    })
    expect(result).toEqual({ recorded: true })
  })

  it('enregistre un report daté', async () => {
    await controller.setCardDisposition(user, {
      actionId: 'meeting:e1',
      disposition: 'postponed',
      until: '2026-09-29T07:00:00.000Z',
    })
    expect(briefingService.setCardDisposition).toHaveBeenCalledWith(
      'u1',
      expect.objectContaining({ disposition: 'postponed', until: '2026-09-29T07:00:00.000Z' }),
    )
  })

  it('refuse (400) un refus sans motif et un report sans date', async () => {
    await expect(controller.setCardDisposition(user, { actionId: 'a', disposition: 'dismissed' })).rejects.toThrow()
    await expect(controller.setCardDisposition(user, { actionId: 'a', disposition: 'postponed' })).rejects.toThrow()
    await expect(controller.setCardDisposition(user, undefined)).rejects.toThrow()
    expect(briefingService.setCardDisposition).not.toHaveBeenCalled()
  })
})

/**
 * #2770 (#2101.14) — GET /briefing/slot-proposal-priority-accounts, le
 * classement par priorité pour choisir à qui proposer un créneau en premier.
 */
describe('BriefingController — GET /briefing/slot-proposal-priority-accounts', () => {
  const briefingService = { build: jest.fn(), sinceLastVisit: jest.fn(), topAccountsForSlotProposal: jest.fn() }
  const marketMemory = { pathsFor: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  const discoverAlerts = { forToday: jest.fn(), lastOccurredAt: jest.fn() }
  const dailyBriefMarker = { consumeFirstOpenToday: jest.fn() }
  const accounts = { find: jest.fn() }
  const contacts = { topAccessPaths: jest.fn() }

  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()

    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: DailyBriefMarkerService, useValue: dailyBriefMarker },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: DiscoverAlertEventService, useValue: discoverAlerts },
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile()

    controller = moduleRef.get(BriefingController)
  })

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  it('délègue au service, tel quel', async () => {
    const ranked = [{ accountId: 'acc-1', companyName: 'ACME', priorityScore: 88 }]
    briefingService.topAccountsForSlotProposal.mockResolvedValue(ranked)

    const result = await controller.slotProposalPriorityAccounts(user)

    expect(briefingService.topAccountsForSlotProposal).toHaveBeenCalledWith('u1')
    expect(result).toEqual(ranked)
  })
})

describe('BriefingController — GET /briefing/bellum-created-event-ids (#2770, #2101.19/.21/.22/.37)', () => {
  const briefingService = {
    build: jest.fn(),
    sinceLastVisit: jest.fn(),
    topAccountsForSlotProposal: jest.fn(),
    listBellumCreatedEventIds: jest.fn(),
  }
  const marketMemory = { pathsFor: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  const discoverAlerts = { forToday: jest.fn(), lastOccurredAt: jest.fn() }
  const dailyBriefMarker = { consumeFirstOpenToday: jest.fn() }
  const accounts = { find: jest.fn() }
  const contacts = { topAccessPaths: jest.fn() }

  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()

    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: DailyBriefMarkerService, useValue: dailyBriefMarker },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: DiscoverAlertEventService, useValue: discoverAlerts },
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile()

    controller = moduleRef.get(BriefingController)
  })

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  it('délègue au service et enveloppe la réponse dans `eventIds`', async () => {
    briefingService.listBellumCreatedEventIds.mockResolvedValue(['evt-1', 'evt-2'])

    const result = await controller.bellumCreatedEventIds(user)

    expect(briefingService.listBellumCreatedEventIds).toHaveBeenCalledWith('u1')
    expect(result).toEqual({ eventIds: ['evt-1', 'evt-2'] })
  })
})

describe('BriefingController — POST /briefing/focus-plan/confirm-block (#2770.49/.50/.51)', () => {
  const briefingService = {
    build: jest.fn(),
    sinceLastVisit: jest.fn(),
    topAccountsForSlotProposal: jest.fn(),
    confirmFocusPlanBlock: jest.fn(),
  }
  const marketMemory = { pathsFor: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  const discoverAlerts = { forToday: jest.fn(), lastOccurredAt: jest.fn() }
  const dailyBriefMarker = { consumeFirstOpenToday: jest.fn() }
  const accounts = { find: jest.fn() }
  const contacts = { topAccessPaths: jest.fn() }

  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()

    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: DailyBriefMarkerService, useValue: dailyBriefMarker },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: DiscoverAlertEventService, useValue: discoverAlerts },
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile()

    controller = moduleRef.get(BriefingController)
  })

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  it('délègue au service, tel quel', async () => {
    briefingService.confirmFocusPlanBlock.mockResolvedValue({ id: 'evt-1', webUrl: null, conferenceUrl: null })

    const result = await controller.confirmFocusPlanBlock(user, {
      type: 'call_session',
      title: 'Session d’appels',
      start_iso: '2026-09-29T09:00:00.000Z',
      end_iso: '2026-09-29T09:30:00.000Z',
    })

    expect(briefingService.confirmFocusPlanBlock).toHaveBeenCalledWith('u1', {
      title: 'Session d’appels',
      start: '2026-09-29T09:00:00.000Z',
      end: '2026-09-29T09:30:00.000Z',
    })
    expect(result).toEqual({ id: 'evt-1', webUrl: null, conferenceUrl: null })
  })

  it('rejette un corps invalide (end_iso non postérieur à start_iso)', async () => {
    await expect(
      controller.confirmFocusPlanBlock(user, {
        type: 'call_session',
        title: 'Session d’appels',
        start_iso: '2026-09-29T09:00:00.000Z',
        end_iso: '2026-09-29T09:00:00.000Z',
      }),
    ).rejects.toThrow('type, title, start_iso et end_iso sont requis')
    expect(briefingService.confirmFocusPlanBlock).not.toHaveBeenCalled()
  })
})

describe('BriefingController — POST /briefing/focus-plan/cancel-block (#2770.52)', () => {
  const briefingService = {
    build: jest.fn(),
    sinceLastVisit: jest.fn(),
    topAccountsForSlotProposal: jest.fn(),
    cancelFocusPlanBlock: jest.fn(),
  }
  const marketMemory = { pathsFor: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  const discoverAlerts = { forToday: jest.fn(), lastOccurredAt: jest.fn() }
  const dailyBriefMarker = { consumeFirstOpenToday: jest.fn() }
  const accounts = { find: jest.fn() }
  const contacts = { topAccessPaths: jest.fn() }

  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()

    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: DailyBriefMarkerService, useValue: dailyBriefMarker },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: DiscoverAlertEventService, useValue: discoverAlerts },
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile()

    controller = moduleRef.get(BriefingController)
  })

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  it('délègue au service le seul identifiant transmis', async () => {
    briefingService.cancelFocusPlanBlock.mockResolvedValue(undefined)

    const result = await controller.cancelFocusPlanBlock(user, { event_id: 'evt-1' })

    expect(briefingService.cancelFocusPlanBlock).toHaveBeenCalledWith('u1', 'evt-1')
    expect(result).toEqual({ cancelled: true })
  })

  it('rejette un corps sans event_id', async () => {
    await expect(controller.cancelFocusPlanBlock(user, {})).rejects.toThrow('event_id requis')
    expect(briefingService.cancelFocusPlanBlock).not.toHaveBeenCalled()
  })
})

describe('BriefingController — POST /briefing/focus-plan/block-outcome (#2770.63/.64/.65)', () => {
  const briefingService = {
    build: jest.fn(),
    sinceLastVisit: jest.fn(),
    topAccountsForSlotProposal: jest.fn(),
    setFocusPlanBlockOutcome: jest.fn(),
    listFocusPlanBlockOutcomes: jest.fn(),
  }
  const marketMemory = { pathsFor: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }
  const discoverAlerts = { forToday: jest.fn(), lastOccurredAt: jest.fn() }
  const dailyBriefMarker = { consumeFirstOpenToday: jest.fn() }
  const accounts = { find: jest.fn() }
  const contacts = { topAccessPaths: jest.fn() }

  let controller: BriefingController

  beforeEach(async () => {
    jest.resetAllMocks()

    const moduleRef = await Test.createTestingModule({
      controllers: [BriefingController],
      providers: [
        { provide: BriefingService, useValue: briefingService },
        { provide: MarketMemoryService, useValue: marketMemory },
        { provide: WorkspaceContextService, useValue: workspaceContext },
        { provide: DailyBriefMarkerService, useValue: dailyBriefMarker },
        { provide: getRepositoryToken(AccountEntity), useValue: accounts },
        { provide: DiscoverAlertEventService, useValue: discoverAlerts },
        { provide: ContactsService, useValue: contacts },
      ],
    }).compile()

    controller = moduleRef.get(BriefingController)
  })

  const user = { userId: 'u1', email: 'u1@test.fr' } as never

  it('délègue au service le seul identifiant transmis et l’état déclaré', async () => {
    briefingService.setFocusPlanBlockOutcome.mockResolvedValue(undefined)

    const result = await controller.setFocusPlanBlockOutcome(user, { event_id: 'evt-1', outcome: 'realized' })

    expect(briefingService.setFocusPlanBlockOutcome).toHaveBeenCalledWith('u1', 'evt-1', 'realized', {
      note: undefined,
      actualMinutes: undefined,
    })
    expect(result).toEqual({ ok: true })
  })

  // #2770.66/.67 — le résultat libre et la durée DÉCLARÉE traversent la porte.
  it('transmet le résultat libre et la durée déclarée', async () => {
    briefingService.setFocusPlanBlockOutcome.mockResolvedValue(undefined)
    await controller.setFocusPlanBlockOutcome(user, {
      event_id: 'evt-1',
      outcome: 'realized',
      note: 'Deux rendez-vous obtenus',
      actual_minutes: 25,
    })
    expect(briefingService.setFocusPlanBlockOutcome).toHaveBeenCalledWith('u1', 'evt-1', 'realized', {
      note: 'Deux rendez-vous obtenus',
      actualMinutes: 25,
    })
  })

  it('rejette une durée hors bornes — jamais écrite', async () => {
    await expect(
      controller.setFocusPlanBlockOutcome(user, { event_id: 'evt-1', outcome: 'realized', actual_minutes: 5000 }),
    ).rejects.toThrow()
    expect(briefingService.setFocusPlanBlockOutcome).not.toHaveBeenCalled()
  })

  // #2391.54 / #2391.55 — la LECTURE de ce que la personne a déclaré.
  it('GET block-outcomes rend le résultat et la durée déclarés, bornés aux identifiants demandés', async () => {
    briefingService.listFocusPlanBlockOutcomes.mockResolvedValue([
      {
        eventId: 'evt-1',
        outcome: 'realized',
        note: 'Deux RDV',
        actualMinutes: 25,
        updatedAt: '2026-10-31T10:00:00.000Z',
      },
    ])
    const result = await controller.focusPlanBlockOutcomes(user, 'evt-1, evt-2')
    expect(briefingService.listFocusPlanBlockOutcomes).toHaveBeenCalledWith('u1', ['evt-1', 'evt-2'])
    expect(result).toEqual([
      {
        eventId: 'evt-1',
        outcome: 'realized',
        note: 'Deux RDV',
        actualMinutes: 25,
        updatedAt: '2026-10-31T10:00:00.000Z',
      },
    ])
  })

  it('GET block-outcomes sans identifiant rend une liste vide sans lire — jamais tous les blocs', async () => {
    const result = await controller.focusPlanBlockOutcomes(user, undefined)
    expect(result).toEqual([])
    expect(briefingService.listFocusPlanBlockOutcomes).not.toHaveBeenCalled()
  })

  it('rejette un corps sans event_id', async () => {
    await expect(controller.setFocusPlanBlockOutcome(user, { outcome: 'realized' })).rejects.toThrow(
      'event_id et outcome sont requis',
    )
    expect(briefingService.setFocusPlanBlockOutcome).not.toHaveBeenCalled()
  })

  it('rejette un état hors des trois déclarés — jamais un quatrième deviné', async () => {
    await expect(controller.setFocusPlanBlockOutcome(user, { event_id: 'evt-1', outcome: 'done' })).rejects.toThrow(
      'event_id et outcome sont requis',
    )
    expect(briefingService.setFocusPlanBlockOutcome).not.toHaveBeenCalled()
  })
})
