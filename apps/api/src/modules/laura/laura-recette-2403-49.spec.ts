import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { computeWorkspaceHealth, type HealthInput } from '@bellum/contracts'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProvenanceService } from '../crm-core/provenance.service'
import { LauraService } from './laura.service'

/**
 * #2403.49 — LA RECETTE DU §5.3, POINT PAR POINT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER EST
 * ─────────────────────────────────────────────────────────────────────────────
 * Le §5.3 liste huit scénarios de recette : dix triggers éligibles à la fois,
 * saisie en cours, utilisateur absent, intervention refusée, notification
 * désactivée, mobile, manager, rien d'utile. Aucun fichier ne les regroupait :
 * chacun était prouvé (ou pas) dans un coin différent du dépôt, sans qu'on
 * puisse répondre d'un coup d'œil « la recette du §5.3 est-elle couverte ? ».
 *
 * Ce fichier répond à CETTE question, un scénario à la fois — soit en
 * EXÉCUTANT le chemin réel (`LauraService.plan`), soit en CITANT le test qui
 * le prouve déjà ailleurs (GA-26 : pas de second calcul, pas de second test
 * pour la même preuve), soit en NOMMANT pourquoi il reste hors d'atteinte.
 */

const NOW = new Date('2026-09-25T14:00:00.000Z')
const HOUR = 60 * 60 * 1000
const DAY = 24 * HOUR

const NOTHING_MEASURED: HealthInput = {
  activation: null,
  connectors: null,
  dataDensity: null,
  teamAdoption: null,
  depth: null,
  consumption: null,
  quality: null,
  actionability: null,
  value: null,
}
const HEALTH = computeWorkspaceHealth({ ...NOTHING_MEASURED, activation: 1, connectors: 1, dataDensity: 1 })

type Trace = Partial<LauraInterventionEntity>

/** #2319.118 — voir la doc de la même fonction dans `laura.service.spec.ts`. */
function fakeQueryBuilder(rows: { key: string; count: string }[] = []) {
  const builder = {
    select: jest.fn(() => builder),
    addSelect: jest.fn(() => builder),
    where: jest.fn(() => builder),
    andWhere: jest.fn(() => builder),
    groupBy: jest.fn(() => builder),
    getRawMany: jest.fn().mockResolvedValue(rows),
  }
  return builder
}

function makeService(traces: Trace[], preference: Partial<NotificationPreferenceEntity> = {}) {
  const prefs: Partial<NotificationPreferenceEntity> = {
    user_id: 'u1',
    proactivity_cap: 3,
    laura_enabled: true,
    laura_retreat_until: null,
    laura_throttle_until: null,
    ...preference,
  }
  const interventions = {
    find: jest.fn().mockResolvedValue(traces),
    findOne: jest.fn(),
    create: jest.fn().mockImplementation((data: Trace) => data),
    createQueryBuilder: jest.fn(() => fakeQueryBuilder()),
    save: jest.fn().mockImplementation((data: Trace) => Promise.resolve({ id: 'trace-1', ...data })),
  }
  const preferences = {
    findOne: jest.fn().mockResolvedValue(prefs),
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
  }
  const provenance = { lastHumanCorrectionAt: jest.fn().mockResolvedValue(null) }
  const userActions = { count: jest.fn().mockResolvedValue(0) }
  return { interventions, preferences, provenance, userActions }
}

async function build(traces: Trace[] = [], preference: Partial<NotificationPreferenceEntity> = {}) {
  const mocks = makeService(traces, preference)
  const moduleRef = await Test.createTestingModule({
    providers: [
      LauraService,
      { provide: getRepositoryToken(LauraInterventionEntity), useValue: mocks.interventions },
      { provide: getRepositoryToken(NotificationPreferenceEntity), useValue: mocks.preferences },
      { provide: getRepositoryToken(UserActionEntity), useValue: mocks.userActions },
      { provide: ProvenanceService, useValue: mocks.provenance },
    ],
  }).compile()
  return moduleRef.get(LauraService)
}

describe('#2403.49 — la recette du §5.3', () => {
  it('1. dix triggers éligibles à la fois : un SEUL retenu', async () => {
    const laura = await build()
    const tenCandidates = [
      'accounts_without_next_action',
      'crm_not_connected',
      'no_connection_7_days',
      'weekly_digest',
      'stalled_deal',
      'first_login',
      'connector_error_48h',
      'empty_talent_pool',
      'no_connector',
      'credits_expiring',
    ]
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/dashboard',
      busy: false,
      candidateKeys: tenCandidates,
      health: HEALTH,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    // Preuve directe : `laura.service.spec.ts` — « n'en pose qu'une par écran »
    // et le tri par priorité de `eligible()` garantissent qu'un seul candidat
    // devient `intervention`, quel que soit le nombre de clés éligibles.
  })

  it('2. saisie en cours : Laura se tait — voir `useLauraBusy.ts` / `useLauraBusy.test.ts` côté écran, `busy` ici côté serveur', async () => {
    const laura = await build()
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/dashboard',
      busy: true,
      candidateKeys: ['accounts_without_next_action'],
      health: HEALTH,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'busy' })
    // #2403.15 / #2403.16 — depuis ce lot, `busy` porte AUSSI le mode vocal
    // actif et une action critique en ligne (`lauraDeclaredBusyStore.ts`,
    // `useDeclareLauraBusy`), pas seulement la saisie.
  })

  it('3. utilisateur absent : le retour d’absence est un moment d’or — voir « un retour d’absence fait passer le brief de reprise » (laura.service.spec.ts)', async () => {
    const laura = await build(
      // Plafond déjà atteint : sans la dérogation, ceci se tairait.
      Array.from({ length: 3 }, (_, i) => ({
        id: `t${i}`,
        screen: `/s${i}`,
        created_at: new Date(NOW.getTime() - (i + 1) * HOUR),
        reaction: null,
      })),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/dashboard',
      busy: false,
      candidateKeys: ['no_connection_7_days'],
      goldenMoment: 'return_from_absence',
      health: HEALTH,
      now: NOW,
    })
    expect(plan).toMatchObject({ speaks: true, goldenMoment: 'return_from_absence' })
  })

  it('4. intervention refusée : silencieuse trente jours, SAUF changement matériel — #2403.34', async () => {
    const laura = await build([
      {
        id: 't0',
        intervention_key: 'crm_not_connected',
        screen: '/settings/integrations',
        created_at: new Date(NOW.getTime() - 10 * DAY),
        reaction: 'refused',
        priority: 1000,
      },
    ])
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: HEALTH,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'nothing_to_say' })
    // Preuve de la DÉROGATION : `laura.service.spec.ts` — describe
    // « #2403.34 — la dérogation "changement matériel" ».
  })

  it('5. notification désactivée : le canal notifications respecte le MÊME arbitre — voir `proactivity-wired.spec.ts`', async () => {
    const laura = await build([], { laura_enabled: false })
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/dashboard',
      busy: false,
      candidateKeys: ['accounts_without_next_action'],
      health: HEALTH,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'disabled' })
  })

  it.skip('6. mobile — hors du périmètre de cet arbitre : bornes GA-28/GA-29/GA-30 (dvh, 768px, quatre onglets), pas une règle de silence de Laura', () => {
    // Rien à construire ICI : « mobile » n'est pas un CONTEXTE qui tait Laura
    // au sens du §5.3 (comme l'était l'appel ou la réunion), c'est une
    // CONTRAINTE d'affichage déjà tenue par les gardes mobiles du dépôt.
  })

  it.skip('7. manager — hors du périmètre de cet arbitre : le rôle change l’ORDRE, jamais le CONTENU (c76_role_reordonne_jamais_ne_filtre), pas une règle de silence de Laura', () => {
    // Un manager ne fait pas taire Laura différemment d'un commercial ; la
    // doctrine interdit même qu'un rôle FILTRE ce qui s'affiche. Rien à
    // construire dans l'arbitre d'interruption pour ce scénario.
  })

  it('8. rien d’utile : Laura dit « rien à dire », jamais un message inventé', async () => {
    const laura = await build()
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/dashboard',
      busy: false,
      candidateKeys: [],
      health: HEALTH,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it.skip('AUCUNE intervention pendant un appel (#2403.12) — reste BLOQUÉ : aucune source de « appel en cours » en temps réel n’existe (la télépho­nie du dépôt est un journal, pas un état live)', () => {
    // Construire ce scénario sans donnée réelle inventerait le déclencheur —
    // exactement ce que la doctrine interdit. Suit une intégration temps réel
    // (webhook Aircall/Ringover) qui n'existe pas encore dans ce dépôt.
  })

  // #2403.13 — LIVRÉ, variante conforme (27/09/2026, épopée #2995).
  //
  // `agent_docs/doctrine.md:19` (« JAMAIS de donnée fictive ») bloquait ce
  // point tel qu'écrit (« aucune intervention pendant une réunion EN COURS ») :
  // aucun état LIVE de réunion n'existe. La variante conforme lit l'agenda
  // déjà SYNCHRONISÉ au lieu d'inventer un signal — `hasMeetingInProgress`
  // (`@bellum/contracts/agenda.ts`) compare `now` au début/fin d'un rendez-vous
  // CONFIRMÉ, et `LauraController.plan` (`meetingInProgress`) l'OR-combine avec
  // `busy`. Preuve : `laura.controller.spec.ts` (GA-26 — pas de second test
  // pour la même preuve, `LauraService.plan` ici ne reçoit qu'un `busy`
  // booléen, il n'a pas d'agenda à lire).
})
