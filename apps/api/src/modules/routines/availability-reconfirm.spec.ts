import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { AccountEntity } from '../../database/entities/account.entity'
import { RoutineRunEntity } from '../../database/entities/routine-run.entity'
import { RoutineSubscriptionEntity } from '../../database/entities/routine-subscription.entity'
import { AgendaService } from '../agenda/agenda.service'
import { AtsService } from '../ats/ats.service'
import { CrmService } from '../crm/crm.service'
import { MailboxService } from '../mailbox/mailbox.service'
import { NotificationsService } from '../notifications/notifications.service'
import { WorkspaceContextService } from '../workspace/workspace-context.service'
import { AVAILABILITY_REVALIDATION_DAYS } from '../consultants/matching/pushable'
import { ROUTINE_CATALOG, findRoutine } from './routine-catalog'
import { RoutineExecutors } from './routine-executors'
import { RoutinesService } from './routines.service'
import { TalentRoutinesService } from './talent-routines.service'

/**
 * « Disponibilité saisie → rappel de confirmation programmé à 60 jours »
 * (PDF-02 §3.3, l. 245).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CES TESTS DÉFENDENT
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défaut n°1 de ce dépôt est du code juste que personne n'appelle. Une
 * routine inscrite au catalogue et jamais atteinte en est la forme exacte, et
 * elle s'est déjà produite ici : `connector_health` a tourné tous les matins
 * pendant des semaines sans envoyer une seule notification, parce que sa cadence
 * ne correspondait pas à la forme de sa sortie.
 *
 * Les trois niveaux sont donc vérifiés, du plus profond au plus visible :
 *
 *  1. **la LECTURE** — la requête exclut ce qu'elle doit exclure, et le seuil
 *     n'y est pas recopié ;
 *  2. **l'EXÉCUTEUR** — la clé atteint bien la méthode, et le message nomme
 *     quelqu'un ;
 *  3. **le DÉPART** — sur un jeu qui la déclenche, un message proactif part
 *     réellement du moteur ; sur un jeu qui ne la déclenche pas, rien ne part.
 */

/** Le seul argument de constructeur qui compte ici. Les autres services ne sont
 *  pas touchés par cette routine ; les passer nuls rend la fragilité VISIBLE au
 *  lieu de la cacher derrière un module de test complet.
 *
 * `rows` modélise le cas SAIN (`measured: true`) — c'est la forme que
 * `TalentRoutinesService.availabilityToReconfirm` rend depuis D733/GA-199
 * (voir `talent-routines-read-failures.spec.ts` pour le cas `measured: false`,
 * et la description ci-dessous pour le test dédié qui le vérifie au niveau de
 * l'exécuteur). */
function executorsWith(rows: unknown[]): {
  executors: RoutineExecutors
  availabilityToReconfirm: jest.Mock
} {
  const availabilityToReconfirm = jest.fn().mockResolvedValue({ measured: true, rows })
  const talentRoutines = { availabilityToReconfirm } as unknown as TalentRoutinesService
  const executors = new RoutineExecutors(
    null as never, // briefing
    null as never, // mailbox
    null as never, // agenda
    null as never, // ats
    null as never, // crm
    null as never, // delivery
    null as never, // crmRoutines
    talentRoutines,
    null as never, // territories
    null as never, // territorySnapshots
  )
  return { executors, availabilityToReconfirm }
}

describe('TalentRoutinesService — ce que la lecture écarte', () => {
  async function reconfirmSql(): Promise<{ sql: string; params: unknown[] }> {
    const query = jest.fn().mockResolvedValue([])
    const service = new TalentRoutinesService({ manager: { query } } as never)
    await service.availabilityToReconfirm('ws-1')
    const calls = query.mock.calls as [string, unknown[]][]
    // La garde LIT : sans cette assertion, tout ce qui suit passerait sur du vide.
    expect(calls).toHaveLength(1)
    const sql = calls[0]?.[0] as string
    expect(sql).toContain('FROM consultants')
    return { sql, params: calls[0]?.[1] as unknown[] }
  }

  it('n’invente pas son seuil — il vient du moteur de matching', async () => {
    const { params } = await reconfirmSql()
    expect(AVAILABILITY_REVALIDATION_DAYS).toBe(60)
    expect(params).toEqual(['ws-1', AVAILABILITY_REVALIDATION_DAYS])
  })

  it('écarte une disponibilité JAMAIS saisie — il n’y a rien à confirmer', async () => {
    // `null` veut dire « jamais saisie », pas « saisie il y a longtemps ». Sans
    // cette clause, le premier balayage remonterait tout le vivier.
    const { sql } = await reconfirmSql()
    expect(sql).toContain('availability_checked_at IS NOT NULL')
  })

  it('écarte « inconnu » — on ne demande pas de confirmer qu’on ne sait pas', async () => {
    const { sql } = await reconfirmSql()
    expect(sql).toContain("c.availability <> 'inconnu'")
  })

  it('écarte une fiche archivée — elle est sortie du vivier actif', async () => {
    const { sql } = await reconfirmSql()
    expect(sql).toContain('archived_at IS NULL')
  })

  it('garde « indisponible » DEDANS — c’est le cas qui rapporte le plus', async () => {
    // Quelqu'un déclaré indisponible il y a deux mois s'est peut-être libéré.
    // L'exclure ferait de la routine un rappel de ce qu'on sait déjà.
    const { sql } = await reconfirmSql()
    expect(sql).not.toContain("'indisponible'")
  })

  it('est bornée et ordonnée — la plus ancienne d’abord', async () => {
    const { sql } = await reconfirmSql()
    expect(sql).toContain('ORDER BY c.availability_checked_at ASC')
    expect(sql).toContain('LIMIT 20')
  })

  it('sait dire NON — une lecture en échec ne tombe pas, et le dit : `measured: false`, pas `[]` muet (D733/GA-199)', async () => {
    const query = jest.fn().mockRejectedValue(new Error('relation "consultants" does not exist'))
    const service = new TalentRoutinesService({ manager: { query } } as never)
    jest.spyOn(service['logger'], 'error').mockImplementation(() => undefined)
    await expect(service.availabilityToReconfirm('ws-1')).resolves.toEqual({ measured: false, rows: [] })
  })
})

describe('l’exécuteur de la confirmation de disponibilité', () => {
  it('est ATTEINT par sa clé — une routine que le `switch` ne route pas est morte', async () => {
    const { executors, availabilityToReconfirm } = executorsWith([])
    await executors.run('availability_reconfirm', 'u1', new Date('2026-08-28T07:00:00Z'), 'ws-1')
    expect(availabilityToReconfirm).toHaveBeenCalledWith('ws-1')
  })

  it('NOMME le plus ancien — un compteur nu ne dit pas par où commencer', async () => {
    const { executors } = executorsWith([
      { id: 'c-1', full_name: 'Nadia Berrada', availability: 'immediate', days: 74 },
      { id: 'c-2', full_name: 'Paul Renaud', availability: 'indisponible', days: 61 },
    ])
    const outcome = await executors.run('availability_reconfirm', 'u1', new Date('2026-08-28T07:00:00Z'), 'ws-1')

    expect(outcome.notified).toBe(true)
    expect(outcome.notification?.title).toBe('2 disponibilités à reconfirmer')
    expect(outcome.notification?.body).toContain('Nadia Berrada')
    expect(outcome.notification?.body).toContain('74')
    expect(outcome.notification?.link).toBe('/consultants')
  })

  it('accorde le singulier — « 1 disponibilités » se lit comme un bogue', async () => {
    const { executors } = executorsWith([
      { id: 'c-1', full_name: 'Nadia Berrada', availability: 'immediate', days: 61 },
    ])
    const outcome = await executors.run('availability_reconfirm', 'u1', new Date('2026-08-28T07:00:00Z'), 'ws-1')
    expect(outcome.notification?.title).toBe('1 disponibilité à reconfirmer')
  })

  it('se TAIT quand il n’y a rien — et le dit dans la trace', async () => {
    const { executors } = executorsWith([])
    const outcome = await executors.run('availability_reconfirm', 'u1', new Date('2026-08-28T07:00:00Z'), 'ws-1')
    expect(outcome.notified).toBe(false)
    expect(outcome.notification).toBeUndefined()
    expect(outcome.outcome).toBe('Aucune disponibilité à reconfirmer.')
  })

  it('lecture cassée : elle NE dit PAS « aucune disponibilité à reconfirmer » (D733/GA-199)', async () => {
    const availabilityToReconfirm = jest.fn().mockResolvedValue({ measured: false, rows: [] })
    const talentRoutines = { availabilityToReconfirm } as unknown as TalentRoutinesService
    const executors = new RoutineExecutors(
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      null as never,
      talentRoutines,
      null as never,
      null as never,
    )
    const outcome = await executors.run('availability_reconfirm', 'u1', new Date('2026-08-28T07:00:00Z'), 'ws-1')
    // Une lecture cassée n'est pas « aucune disponibilité » : c'est « je n'ai
    // pas pu vérifier ». Les confondre transforme une panne SQL en rapport
    // rassurant — exactement le défaut que ce lot corrige.
    expect(outcome.notified).toBe(false)
    expect(outcome.outcome).not.toContain('Aucune disponibilité à reconfirmer')
    expect(outcome.outcome).toContain('pas pu')
  })
})

describe('le rappel PART vraiment — le moteur, de bout en bout', () => {
  const subscriptions = { find: jest.fn(), findOne: jest.fn(), insert: jest.fn(), save: jest.fn(), create: jest.fn() }
  const runs = { find: jest.fn(), findOne: jest.fn(), insert: jest.fn(), update: jest.fn() }
  const notifications = { createNotification: jest.fn(), createProactiveBatch: jest.fn() }
  const mailbox = { status: jest.fn() }
  const agenda = { status: jest.fn() }
  const ats = { status: jest.fn() }
  const crm = { isConnected: jest.fn() }
  const workspaceContext = { isDemoWorkspace: jest.fn(), resolveActiveWorkspace: jest.fn() }

  let service: RoutinesService
  let availabilityToReconfirm: jest.Mock

  /** Toutes les routines éteintes SAUF celle-ci : le test doit porter sur elle,
   *  et un balayage complet ferait passer des notifications d'ailleurs. */
  function onlyThisRoutineEnabled() {
    return ROUTINE_CATALOG.map(definition => ({
      routine_key: definition.key,
      enabled: definition.key === 'availability_reconfirm',
      hour: definition.defaultHour,
      weekday: definition.defaultWeekday,
      channel: 'in_app',
      time_zone: 'Europe/Paris',
    }))
  }

  async function build(rows: unknown[]) {
    jest.resetAllMocks()
    const built = executorsWith(rows)
    availabilityToReconfirm = built.availabilityToReconfirm

    subscriptions.find.mockResolvedValue(onlyThisRoutineEnabled())
    subscriptions.findOne.mockResolvedValue(null)
    subscriptions.insert.mockResolvedValue(undefined)
    subscriptions.create.mockImplementation((value: unknown) => value)
    subscriptions.save.mockResolvedValue(undefined)
    runs.findOne.mockResolvedValue(null)
    runs.insert.mockResolvedValue(undefined)
    runs.update.mockResolvedValue(undefined)
    workspaceContext.isDemoWorkspace.mockResolvedValue(false)
    workspaceContext.resolveActiveWorkspace.mockResolvedValue({ workspaceId: 'ws-1' })
    mailbox.status.mockResolvedValue({ connected: false })
    agenda.status.mockResolvedValue({ connected: false })
    ats.status.mockResolvedValue({ connected: false })
    crm.isConnected.mockResolvedValue(false)

    const moduleRef = await Test.createTestingModule({
      providers: [
        RoutinesService,
        { provide: getRepositoryToken(RoutineSubscriptionEntity), useValue: subscriptions },
        { provide: getRepositoryToken(RoutineRunEntity), useValue: runs },
        { provide: getRepositoryToken(AccountEntity), useValue: { count: jest.fn().mockResolvedValue(1) } },
        { provide: NotificationsService, useValue: notifications },
        { provide: RoutineExecutors, useValue: built.executors },
        { provide: MailboxService, useValue: mailbox },
        { provide: AgendaService, useValue: agenda },
        { provide: AtsService, useValue: ats },
        { provide: CrmService, useValue: crm },
        { provide: WorkspaceContextService, useValue: workspaceContext },
      ],
    }).compile()
    service = moduleRef.get(RoutinesService)
  }

  /** Lundi 9 h, heure de Paris — la fenêtre de la routine hebdomadaire. */
  const MONDAY_9H_PARIS = new Date('2026-08-31T07:05:00Z')

  it('part sur un jeu qui le DÉCLENCHE', async () => {
    await build([{ id: 'c-1', full_name: 'Nadia Berrada', availability: 'immediate', days: 74 }])

    const executed = await service.runDueFor('u1', MONDAY_9H_PARIS)

    expect(executed).toBe(1)
    // L'espace est bien celui de l'utilisateur : une routine d'espace lue avec
    // une chaîne vide remonterait zéro ligne et se lirait comme « rien à dire ».
    expect(availabilityToReconfirm).toHaveBeenCalledWith('ws-1')
    expect(notifications.createProactiveBatch).toHaveBeenCalledTimes(1)
    const [, candidates] = notifications.createProactiveBatch.mock.calls[0] as [
      string,
      { key: string; title: string; body?: string }[],
    ]
    expect(candidates).toHaveLength(1)
    expect(candidates[0]?.key).toBe('availability_reconfirm')
    expect(candidates[0]?.title).toBe('1 disponibilité à reconfirmer')
    expect(candidates[0]?.body).toContain('Nadia Berrada')
  })

  it('ne part PAS quand il n’y a rien à reconfirmer — mais la trace dit qu’il a tourné', async () => {
    await build([])

    const executed = await service.runDueFor('u1', MONDAY_9H_PARIS)

    // Elle a bien tourné : « elle a tourné, il n'y avait rien » n'est pas
    // « elle n'a pas tourné ». C'est la distinction que le moteur porte.
    expect(executed).toBe(1)
    expect(notifications.createProactiveBatch).toHaveBeenCalledWith('u1', [])
    expect(runs.update).toHaveBeenCalledWith(
      expect.objectContaining({ run_key: 'u1:availability_reconfirm:2026-08-31' }),
      expect.objectContaining({ notified: false, outcome: 'Aucune disponibilité à reconfirmer.' }),
    )
  })

  it('ne part PAS un mardi — c’est une routine hebdomadaire, pas un rappel quotidien', async () => {
    // Le plafond de proactivité tient trois messages par jour. Une routine qui
    // redirait la même chose chaque matin jusqu'au geste le remplirait à elle
    // seule, au détriment de ce qui bouge.
    await build([{ id: 'c-1', full_name: 'Nadia Berrada', availability: 'immediate', days: 74 }])

    const executed = await service.runDueFor('u1', new Date('2026-09-01T07:05:00Z'))

    expect(executed).toBe(0)
    expect(availabilityToReconfirm).not.toHaveBeenCalled()
    expect(notifications.createProactiveBatch).toHaveBeenCalledWith('u1', [])
  })

  it('ne part PAS dans une salle de démonstration', async () => {
    await build([{ id: 'c-1', full_name: 'Nadia Berrada', availability: 'immediate', days: 74 }])
    workspaceContext.isDemoWorkspace.mockResolvedValue(true)

    expect(await service.runDueFor('u1', MONDAY_9H_PARIS)).toBe(0)
    expect(availabilityToReconfirm).not.toHaveBeenCalled()
  })
})

describe('la routine est DÉCLARÉE de façon cohérente avec sa sortie', () => {
  it('rend une `notification` et non des `items` — donc sa cadence ne doit pas être continue', () => {
    // Le piège déjà payé : `connector_health` était déclarée `daily` et rendait
    // des `items[]`, lus par le seul chemin `continuous`. Elle a tourné des
    // semaines sans envoyer une notification.
    const definition = findRoutine('availability_reconfirm')
    expect(definition).toBeDefined()
    expect(definition?.cadence).toBe('weekly')
    expect(definition?.requires).toEqual([])
    expect(definition?.defaultEnabled).toBe(true)
    expect(definition?.automationLevel).toBe('n1_prepare')
  })

  it('dit ce qu’elle ne fait PAS — une disponibilité jamais saisie ne remonte pas', () => {
    const definition = findRoutine('availability_reconfirm')
    expect(definition?.fallback.fr).toContain('jamais saisie')
    expect(definition?.fallback.en).toContain('never entered')
  })
})
