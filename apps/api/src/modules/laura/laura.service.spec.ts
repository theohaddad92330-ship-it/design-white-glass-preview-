import { Test } from '@nestjs/testing'
import { getRepositoryToken } from '@nestjs/typeorm'
import { computeWorkspaceHealth, type HealthInput } from '@bellum/contracts'
import { NotificationPreferenceEntity } from '../../database/entities/notification-preference.entity'
import { LauraInterventionEntity } from '../../database/entities/laura-intervention.entity'
import { UserActionEntity } from '../../database/entities/user-action.entity'
import { ProvenanceService } from '../crm-core/provenance.service'
import { LauraService } from './laura.service'

const NOW = new Date('2026-08-22T14:00:00.000Z')
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

const AT_RISK = computeWorkspaceHealth({ ...NOTHING_MEASURED, activation: 0.2, connectors: 0.3, dataDensity: 0.4 })
const HEALTHY = computeWorkspaceHealth({ ...NOTHING_MEASURED, activation: 1, connectors: 1, dataDensity: 1 })

type Trace = Partial<LauraInterventionEntity>

/**
 * #2319.118 — un bâtisseur de requête chaînable minimal : `workspaceRefusalCountByKey`
 * n'utilise que `select`/`addSelect`/`where`/`andWhere`/`groupBy`/`getRawMany`.
 */
function fakeQueryBuilder(rows: { key: string; count: string }[]) {
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

function makeService(
  traces: Trace[],
  preference: Partial<NotificationPreferenceEntity> = {},
  // #2403.38 — `null` par défaut : « aucune correction humaine connue »,
  // l'état de l'immense majorité des tests qui ne concernent pas ce point.
  lastHumanCorrectionAt: Date | null = null,
  // #2403.33 — `0` par défaut : « aucune action déjà journalisée sur cet
  // objet », l'état de l'immense majorité des tests qui ne concernent pas ce
  // point.
  userActionsCount = 0,
  // #2319.118 — `[]` par défaut : « aucun refus agrégé à l'échelle de
  // l'espace », l'état de l'immense majorité des tests qui ne concernent pas
  // ce point.
  workspaceRefusalRows: { key: string; count: string }[] = [],
) {
  const saved: Trace[] = []
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
    findOne: jest.fn().mockImplementation(({ where }: { where: { id: string } }) => {
      return Promise.resolve(traces.find(trace => trace.id === where.id) ?? null)
    }),
    create: jest.fn().mockImplementation((data: Trace) => data),
    createQueryBuilder: jest.fn(() => fakeQueryBuilder(workspaceRefusalRows)),
    save: jest.fn().mockImplementation((data: Trace) => {
      saved.push(data)
      return Promise.resolve({ id: data.id ?? 'trace-1', ...data })
    }),
  }
  const preferences = {
    findOne: jest.fn().mockResolvedValue(prefs),
    create: jest.fn().mockImplementation((data: unknown) => data),
    save: jest.fn().mockImplementation((data: unknown) => Promise.resolve(data)),
  }
  const provenance = { lastHumanCorrectionAt: jest.fn().mockResolvedValue(lastHumanCorrectionAt) }
  const userActions = { count: jest.fn().mockResolvedValue(userActionsCount) }
  return { interventions, preferences, prefs, saved, provenance, userActions }
}

async function build(mocks: ReturnType<typeof makeService>) {
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

describe('LauraService — ce qui décide de parler', () => {
  it('parle quand rien ne s’y oppose, et pose une trace', async () => {
    const mocks = makeService([])
    const laura = await build(mocks)
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: false,
      candidateKeys: ['accounts_without_next_action'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (plan.speaks) expect(plan.intervention.key).toBe('accounts_without_next_action')
    expect(mocks.interventions.save).toHaveBeenCalled()
  })

  it('#3398 — sur /chat, le rôle change QUI parle en premier, pas l’ensemble des candidates', async () => {
    const keys = ['accounts_without_next_action', 'margin_not_measured', 'consultant_free_soon']
    const spoken = async (chatReading: 'executive' | 'recruiter') => {
      const mocks = makeService([])
      const laura = await build(mocks)
      const plan = await laura.plan('u1', {
        workspaceId: 'w1',
        screen: '/chat',
        busy: false,
        candidateKeys: keys,
        health: AT_RISK,
        chatReading,
        now: NOW,
      })
      return plan.speaks ? plan.intervention.key : null
    }
    expect(await spoken('executive')).toBe('margin_not_measured')
    expect(await spoken('recruiter')).toBe('consultant_free_soon')
  })

  it('#3398 (X13) — sur /chat, le recruteur ouvre sur la disponibilité périmée, le commercial sur la relance due', async () => {
    const keys = ['margin_not_measured', 'follow_up_overdue', 'availability_stale']
    const spoken = async (chatReading: 'sales' | 'recruiter') => {
      const laura = await build(makeService([]))
      const plan = await laura.plan('u1', {
        workspaceId: 'w1',
        screen: '/chat',
        busy: false,
        candidateKeys: keys,
        health: AT_RISK,
        chatReading,
        now: NOW,
      })
      return plan.speaks ? plan.intervention.key : null
    }
    expect(await spoken('sales')).toBe('follow_up_overdue')
    expect(await spoken('recruiter')).toBe('availability_stale')
  })

  it('#3398 (X24) — sur /briefing, la relance due devient une bulle (« 1 tâche en retard » ne reste plus muette)', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/briefing',
      busy: false,
      candidateKeys: ['follow_up_overdue'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks && plan.intervention.key).toBe('follow_up_overdue')
  })

  it('X37 / #3398 — salle de démonstration : l’historique des visites précédentes ne rend jamais Laura muette', async () => {
    const used = [
      {
        id: 't0',
        screen: '/briefing',
        intervention_key: 'follow_up_overdue',
        created_at: new Date(NOW.getTime() - 2 * HOUR),
        reaction: null,
      },
      { id: 't1', screen: '/chat', created_at: new Date(NOW.getTime() - 3 * HOUR), reaction: null },
      { id: 't2', screen: '/actions', created_at: new Date(NOW.getTime() - 4 * HOUR), reaction: null },
    ]
    const ask = (demo: boolean) =>
      build(makeService(used)).then(laura =>
        laura.plan('u1', {
          workspaceId: 'w1',
          screen: '/briefing',
          busy: false,
          candidateKeys: ['follow_up_overdue'],
          health: AT_RISK,
          demo,
          now: NOW,
        }),
      )
    // Le test qui dit NON : un espace réel garde son budget.
    expect(await ask(false)).toMatchObject({ speaks: false })
    const plan = await ask(true)
    expect(plan.speaks && plan.intervention.key).toBe('follow_up_overdue')
  })

  it('#2403.32 — garde les candidats ÉVINCÉS sur la trace, jamais celui retenu', async () => {
    const mocks = makeService([])
    const laura = await build(mocks)
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: false,
      candidateKeys: ['accounts_without_next_action', 'crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    const saved = mocks.saved[0] as Trace
    expect(saved.suppressed_candidates).toHaveLength(1)
    expect(saved.suppressed_candidates).not.toContain(plan.intervention.key)
    expect(['accounts_without_next_action', 'crm_not_connected']).toContain(saved.suppressed_candidates?.[0])
  })

  it('#2403.32 — un seul candidat n’évince personne : la liste reste vide', async () => {
    const mocks = makeService([])
    const laura = await build(mocks)
    await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: false,
      candidateKeys: ['accounts_without_next_action'],
      health: AT_RISK,
      now: NOW,
    })
    const saved = mocks.saved[0] as Trace
    expect(saved.suppressed_candidates).toEqual([])
  })

  it('se tait quand l’utilisateur l’a coupée — et le DIT (D49)', async () => {
    const mocks = makeService([], { laura_enabled: false })
    const laura = await build(mocks)
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: false,
      candidateKeys: ['accounts_without_next_action'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'disabled' })
    // Rien n'est écrit quand elle se tait : une trace sans message ferait
    // compter une intervention qui n'a jamais existé.
    expect(mocks.interventions.save).not.toHaveBeenCalled()
  })

  it('ne parle jamais pendant que la personne travaille', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: true,
      candidateKeys: ['accounts_without_next_action'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'busy' })
  })

  it('n’en pose qu’une par écran', async () => {
    const laura = await build(
      makeService([{ id: 't0', screen: '/accounts', created_at: new Date(NOW.getTime() - 3 * HOUR), reaction: null }]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: false,
      candidateKeys: ['accounts_without_next_action'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'screen_already_served' })
  })

  it('respecte les vingt minutes entre deux', async () => {
    const laura = await build(
      makeService([
        { id: 't0', screen: '/missions', created_at: new Date(NOW.getTime() - 5 * 60_000), reaction: null },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: false,
      candidateKeys: ['accounts_without_next_action'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan).toMatchObject({ speaks: false, reason: 'too_soon' })
  })

  it('dit « rien à dire » plutôt que d’inventer un message', async () => {
    // Le §5.3 : « rien à dire ⇒ rien envoyé. Jamais de "tout va bien
    // aujourd'hui". » La raison est nommée pour que l'écran sache que le
    // silence est normal, et pas une panne.
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: false,
      candidateKeys: [],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it('ignore une clé qui n’est pas au catalogue', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: false,
      candidateKeys: ['inexistante'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })
})

describe('le budget d’adoption du §5.6', () => {
  it('ne pousse AUCUNE adoption sur un espace sain', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: HEALTHY,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it('laisse toujours passer un risque, même sur un espace sain', async () => {
    // Un connecteur en panne est un FAIT, pas une invitation à explorer.
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['connector_error_48h'],
      health: HEALTHY,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
  })

  it('choisit la priorité la plus haute quand plusieurs sont possibles', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/dashboard',
      busy: false,
      candidateKeys: ['week_one_recap', 'trial_ending'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (plan.speaks) expect(plan.intervention.key).toBe('trial_ending')
  })
})

describe('le refus, et ce qu’il vaut', () => {
  it('ne repropose pas une intervention refusée il y a dix jours', async () => {
    const laura = await build(
      makeService([
        {
          id: 't0',
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - 10 * DAY),
          reaction: 'refused',
        },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it('la repropose après trente jours', async () => {
    const laura = await build(
      makeService([
        {
          id: 't0',
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - 40 * DAY),
          reaction: 'refused',
        },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
  })

  /**
   * Mesuré en production le 10/09/2026 : « Confronter son profil aux besoins
   * ouverts. » proposée neuf fois en dix jours sur `/settings/memory`, alors
   * que ce fichier promet trente. Les deux tests ci-dessus prouvent que le
   * CALCUL sait ignorer un refus de moins de trente jours et en reproposer un
   * de plus de trente — mais leur mock rend TOUJOURS les traces qu'on lui
   * donne, quels que soient les arguments de la requête. Ils ne peuvent donc
   * pas voir une fenêtre de LECTURE trop étroite : celle-ci vérifie la
   * requête elle-même.
   */
  it('interroge une fenêtre d’AU MOINS trente jours glissants, pas un compte de lignes fixe', async () => {
    const mocks = makeService([])
    const laura = await build(mocks)
    await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(mocks.interventions.find).toHaveBeenCalledTimes(1)
    const query = mocks.interventions.find.mock.calls[0]?.[0] as {
      where: { user_id: string; created_at: { value: Date } }
    }
    expect(query.where.user_id).toBe('u1')
    const since = query.where.created_at.value
    const daysCovered = (NOW.getTime() - since.getTime()) / DAY
    expect(daysCovered).toBeGreaterThanOrEqual(30)
  })
})

describe('#2403.34 — la dérogation « changement matériel »', () => {
  it('un refus RÉCENT tient, même trente jours, quand rien n’a matériellement changé', async () => {
    const laura = await build(
      makeService([
        {
          id: 't0',
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - 10 * DAY),
          reaction: 'refused',
          // Priorité impossible à dépasser (le calcul plafonne à 100) : la
          // situation ne peut par construction pas s'être « aggravée » par
          // rapport à ce refus.
          priority: 1000,
        },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it('la dérogation lève le refus quand la situation s’est matériellement aggravée depuis', async () => {
    const laura = await build(
      makeService([
        {
          id: 't0',
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - 10 * DAY),
          reaction: 'refused',
          // Priorité minimale possible pour une candidate (elle doit être
          // strictement positive pour être candidate) : la priorité
          // RECALCULÉE aujourd'hui la dépasse forcément.
          priority: 0,
        },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
  })
})

describe('#2403.24 — PRÉFÉRENCE : le classement baisse après des refus réels, sans jamais silencer', () => {
  it('aucun refus historique ⇒ priorité identique au calcul brut du catalogue (comportement inchangé)', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    // impact 7 × urgency 4 × actionability 9 = 252, ramené à 25.
    expect(plan.priority).toBe(25)
  })

  it('deux refus réels de la MÊME clé réduisent son classement, sans jamais la silencer', async () => {
    const laura = await build(
      makeService([
        {
          id: 't0',
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - 20 * DAY),
          reaction: 'refused',
          priority: 0,
        },
        {
          id: 't1',
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - 10 * DAY),
          reaction: 'refused',
          priority: 0,
        },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    // Priorité brute 25, multiplicateur max(0.25, 1 - 2×0.15) = 0.7 → 18.
    expect(plan.priority).toBe(18)
    expect(plan.priority).toBeLessThan(25)
    expect(plan.priority).toBeGreaterThan(0)
  })

  it('une clé DIFFÉRENTE, jamais refusée, ne subit AUCUN effet du refus d’une autre clé', async () => {
    const laura = await build(
      makeService(
        Array.from({ length: 3 }, (_, index) => ({
          id: `t${index}`,
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - (10 + index) * DAY),
          reaction: 'refused' as const,
          priority: 0,
        })),
      ),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/consultants',
      busy: false,
      candidateKeys: ['empty_talent_pool'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    expect(plan.intervention.key).toBe('empty_talent_pool')
    // impact 8 × urgency 5 × actionability 8 = 320, ramené à 32 — IDENTIQUE à
    // un appel sans aucun historique : le refus de `crm_not_connected` (une
    // AUTRE clé) n'a strictement rien changé ici.
    expect(plan.priority).toBe(32)
  })
})

describe('#2319.118 — PRÉFÉRENCE ESPACE : le classement baisse avec les refus agrégés de TOUT L’ESPACE', () => {
  it('aucun refus d’espace ⇒ priorité identique au calcul brut (comportement inchangé)', async () => {
    const laura = await build(makeService([], {}, null, 0, []))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    expect(plan.priority).toBe(25)
  })

  it('deux refus agrégés de l’espace (même sans refus PERSONNEL) réduisent le classement, sans jamais silencer', async () => {
    const laura = await build(makeService([], {}, null, 0, [{ key: 'crm_not_connected', count: '2' }]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    // Priorité brute 25, multiplicateur max(0.6, 1 - 2×0.05) = 0.9 → 23.
    expect(plan.priority).toBe(23)
    expect(plan.priority).toBeLessThan(25)
  })

  it('un grand nombre de refus d’espace ne silence jamais — le plancher tient', async () => {
    const laura = await build(makeService([], {}, null, 0, [{ key: 'crm_not_connected', count: '20' }]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    expect(plan.priority).toBe(15)
    expect(plan.priority).toBeGreaterThan(0)
  })

  it('une clé DIFFÉRENTE, jamais refusée par l’espace, ne subit AUCUN effet', async () => {
    const laura = await build(makeService([], {}, null, 0, [{ key: 'crm_not_connected', count: '5' }]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/consultants',
      busy: false,
      candidateKeys: ['empty_talent_pool'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    expect(plan.intervention.key).toBe('empty_talent_pool')
    expect(plan.priority).toBe(32)
  })

  it('GA-43 — la requête d’agrégation est bornée au workspace APPELANT, jamais un autre', async () => {
    const mocks = makeService([], {}, null, 0, [{ key: 'crm_not_connected', count: '2' }])
    const laura = await build(mocks)
    await laura.plan('u1', {
      workspaceId: 'w-appelant',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    const builder = mocks.interventions.createQueryBuilder.mock.results[0]?.value
    expect(builder.where).toHaveBeenCalledWith('trace.workspace_id = :workspaceId', { workspaceId: 'w-appelant' })
  })

  it('un `workspaceId` absent (`null`) rend une carte vide plutôt que d’agréger sur `IS NULL`', async () => {
    const mocks = makeService([], {}, null, 0, [{ key: 'crm_not_connected', count: '99' }])
    const laura = await build(mocks)
    const plan = await laura.plan('u1', {
      workspaceId: null,
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    expect(plan.priority).toBe(25)
    expect(mocks.interventions.createQueryBuilder).not.toHaveBeenCalled()
  })

  it('#2403.24 personnelle ET #2319.118 espace se cumulent, chacune sur son propre compte', async () => {
    const laura = await build(
      makeService(
        [
          {
            id: 't0',
            intervention_key: 'crm_not_connected',
            screen: '/settings/integrations',
            created_at: new Date(NOW.getTime() - 20 * DAY),
            reaction: 'refused',
            priority: 0,
          },
        ],
        {},
        null,
        0,
        [{ key: 'crm_not_connected', count: '2' }],
      ),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    // 25 × PRÉFÉRENCE(1 refus perso, 0.85) = 21 (round(21.25)), puis × ESPACE
    // (2 refus, 0.9) = round(21 × 0.9) = 19 — les deux réductions s'empilent :
    // strictement moins que l'effet espace seul (23, testé ci-dessus).
    expect(plan.priority).toBe(19)
    expect(plan.priority).toBeLessThan(23)
  })
})

describe('#2403.22 — FRÉQUENCE : le classement baisse après des offres répétées, sans jamais silencer', () => {
  it('aucune offre récente ⇒ priorité identique au calcul brut du catalogue (comportement inchangé)', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    // impact 7 × urgency 4 × actionability 9 = 252, ramené à 25.
    expect(plan.priority).toBe(25)
  })

  it('deux offres réelles de la MÊME clé, ni refusées ni dans le cooldown de vingt-quatre heures, réduisent son classement', async () => {
    const laura = await build(
      makeService([
        {
          id: 't0',
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - 5 * DAY),
          reaction: 'acted',
          priority: 0,
        },
        {
          id: 't1',
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - 3 * DAY),
          reaction: 'acted',
          priority: 0,
        },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    // Priorité brute 25, multiplicateur max(0.5, 1 - 2×0.05) = 0.9 → 23 (arrondi).
    expect(plan.priority).toBe(23)
    expect(plan.priority).toBeLessThan(25)
    expect(plan.priority).toBeGreaterThan(0)
  })

  it('une offre VIEILLE de plus de sept jours sort de la fenêtre — aucun effet', async () => {
    const laura = await build(
      makeService([
        {
          id: 't0',
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - 9 * DAY),
          reaction: 'acted',
          priority: 0,
        },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    expect(plan.priority).toBe(25)
  })

  it('une clé DIFFÉRENTE, jamais offerte, ne subit AUCUN effet de la fréquence d’une autre clé', async () => {
    const laura = await build(
      makeService(
        Array.from({ length: 3 }, (_, index) => ({
          id: `t${index}`,
          intervention_key: 'crm_not_connected',
          screen: '/settings/integrations',
          created_at: new Date(NOW.getTime() - (2 + index) * DAY),
          reaction: 'acted' as const,
          priority: 0,
        })),
      ),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/consultants',
      busy: false,
      candidateKeys: ['empty_talent_pool'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    expect(plan.intervention.key).toBe('empty_talent_pool')
    // impact 8 × urgency 5 × actionability 8 = 320, ramené à 32 — IDENTIQUE à
    // un appel sans aucun historique : la fréquence de `crm_not_connected`
    // (une AUTRE clé) n'a strictement rien changé ici.
    expect(plan.priority).toBe(32)
  })
})

describe('#2403.37 — le cooldown PAR CLÉ, distinct du délai global de vingt minutes', () => {
  it('ne repropose pas la MÊME clé sur un AUTRE écran moins de vingt-quatre heures après, même sans refus', async () => {
    const laura = await build(
      makeService([
        {
          id: 't0',
          intervention_key: 'accounts_without_next_action',
          screen: '/accounts',
          created_at: new Date(NOW.getTime() - 3 * HOUR),
          reaction: null,
        },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      // Écran DIFFÉRENT de celui de la trace : `screen_already_served` et le
      // délai global (`MIN_GAP_MINUTES`) ne peuvent pas expliquer un refus ici.
      screen: '/missions',
      busy: false,
      candidateKeys: ['accounts_without_next_action'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it('la repropose après vingt-quatre heures', async () => {
    const laura = await build(
      makeService([
        {
          id: 't0',
          intervention_key: 'accounts_without_next_action',
          screen: '/accounts',
          created_at: new Date(NOW.getTime() - 25 * HOUR),
          reaction: null,
        },
      ]),
    )
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/missions',
      busy: false,
      candidateKeys: ['accounts_without_next_action'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
  })
})

describe('enregistrer une réaction', () => {
  it('n’écrase jamais une réaction déjà donnée', async () => {
    // Rejouer un clic ne doit pas faire descendre deux fois le plafond.
    const mocks = makeService([{ id: 't0', user_id: 'u1', reaction: 'acted', created_at: NOW }])
    const laura = await build(mocks)
    await laura.react('u1', 't0', 'closed_unread', NOW)
    expect(mocks.interventions.save).not.toHaveBeenCalled()
  })

  it('ignore une trace inconnue sans lever', async () => {
    // Elle vient d'un onglet resté ouvert, ou d'un espace remis à neuf.
    const mocks = makeService([])
    const laura = await build(mocks)
    await expect(laura.react('u1', 'inconnue', 'acted', NOW)).resolves.toEqual({
      stale: false,
      handledElsewhere: false,
    })
  })

  it('met Laura en retrait après trois fermetures sans lecture', async () => {
    const closed = [0, 1, 2].map(index => ({
      id: `t${index}`,
      user_id: 'u1',
      intervention_key: 'week_one_recap',
      screen: '/dashboard',
      reaction: 'closed_unread',
      created_at: new Date(NOW.getTime() - (index + 1) * HOUR),
    }))
    const mocks = makeService([{ id: 'live', user_id: 'u1', reaction: null, created_at: NOW }, ...closed])
    const laura = await build(mocks)
    await laura.react('u1', 'live', 'closed_unread', NOW)
    const persisted = mocks.preferences.save.mock.calls.at(-1)?.[0] as NotificationPreferenceEntity
    expect(persisted.laura_retreat_until).toBeInstanceOf(Date)
  })
})

describe('#2403.38 — invalidation sur correction humaine', () => {
  // Fonction, pas une constante partagée : `react()` MUTE l'objet trouvé
  // (`trace.reaction = …`), et une constante partagée aurait fait fuir la
  // mutation d'un test vers le suivant.
  const accountTrace = (): Trace => ({
    id: 't0',
    user_id: 'u1',
    workspace_id: 'w1',
    intervention_key: 'account_hiring_signal',
    entity_type: 'account',
    entity_id: 'acc-1',
    reaction: null,
    created_at: NOW,
  })

  it('aucune correction humaine connue ⇒ jamais périmée (comportement le plus courant)', async () => {
    const mocks = makeService([accountTrace()], {}, null)
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'acted', NOW)).resolves.toEqual({ stale: false, handledElsewhere: false })
  })

  it('une correction humaine APRÈS la trace ⇒ le geste est enregistré ET nommé périmé', async () => {
    const mocks = makeService([accountTrace()], {}, new Date(NOW.getTime() + HOUR))
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'acted', NOW)).resolves.toEqual({ stale: true, handledElsewhere: false })
    // D48 — Laura ne bloque jamais un geste à sa place : le geste EST enregistré.
    expect(mocks.interventions.save).toHaveBeenCalled()
  })

  it('une correction humaine AVANT la trace ⇒ déjà reflétée, jamais périmée', async () => {
    const mocks = makeService([accountTrace()], {}, new Date(NOW.getTime() - HOUR))
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'acted', NOW)).resolves.toEqual({ stale: false, handledElsewhere: false })
  })

  it('une réaction qui n’est ni `acted` ni `refused` (ex. fermé sans lire) ne consulte même pas la provenance', async () => {
    const mocks = makeService([accountTrace()], {}, new Date(NOW.getTime() + HOUR))
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'closed_unread', NOW)).resolves.toEqual({
      stale: false,
      handledElsewhere: false,
    })
    expect(mocks.provenance.lastHumanCorrectionAt).not.toHaveBeenCalled()
  })

  it('une clé SANS entité (les ~29 autres du catalogue) reste byte-identique : jamais périmée, jamais consultée', async () => {
    const mocks = makeService(
      [{ id: 't0', user_id: 'u1', workspace_id: 'w1', reaction: null, created_at: NOW }],
      {},
      new Date(NOW.getTime() + HOUR),
    )
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'acted', NOW)).resolves.toEqual({ stale: false, handledElsewhere: false })
    expect(mocks.provenance.lastHumanCorrectionAt).not.toHaveBeenCalled()
  })
})

describe('#2403.33 — un refus sur une entité périmée s’écrit `refused_stale_data`', () => {
  const accountTrace = (): Trace => ({
    id: 't0',
    user_id: 'u1',
    workspace_id: 'w1',
    intervention_key: 'account_hiring_signal',
    entity_type: 'account',
    entity_id: 'acc-1',
    reaction: null,
    created_at: NOW,
  })

  it('un refus SANS correction humaine connue reste `refused` ordinaire (comportement inchangé)', async () => {
    const mocks = makeService([accountTrace()], {}, null)
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'refused', NOW)).resolves.toEqual({ stale: false, handledElsewhere: false })
    expect(mocks.saved.at(-1)?.reaction).toBe('refused')
  })

  it('un refus sur une entité corrigée par un humain DEPUIS la trace s’écrit `refused_stale_data`', async () => {
    const mocks = makeService([accountTrace()], {}, new Date(NOW.getTime() + HOUR))
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'refused', NOW)).resolves.toEqual({ stale: true, handledElsewhere: false })
    expect(mocks.saved.at(-1)?.reaction).toBe('refused_stale_data')
  })

  it('`refused_stale_data` compte comme un refus pour PRÉFÉRENCE (#2403.24), exactement comme `refused`', async () => {
    // Deux refus de la MÊME clé, l'un ordinaire, l'autre « mauvaise donnée » —
    // isRefusal() doit compter les DEUX pour que PRÉFÉRENCE réduise le
    // classement comme si c'étaient deux refus ordinaires.
    const traces: Trace[] = [
      {
        id: 't1',
        intervention_key: 'crm_not_connected',
        screen: '/settings/integrations',
        created_at: new Date(NOW.getTime() - 20 * DAY),
        reaction: 'refused',
        priority: 0,
      },
      {
        id: 't2',
        intervention_key: 'crm_not_connected',
        screen: '/settings/integrations',
        created_at: new Date(NOW.getTime() - 10 * DAY),
        reaction: 'refused_stale_data',
        priority: 0,
      },
    ]
    const laura = await build(makeService(traces))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    // Même calcul que le test #2403.24 « deux refus réels » : 25 × 0.7 = 18 (arrondi).
    expect(plan.priority).toBe(18)
  })
})

describe('#2403.33 — un refus sur un objet DÉJÀ TRAITÉ AILLEURS s’écrit `refused_handled_elsewhere`', () => {
  const accountTrace = (): Trace => ({
    id: 't0',
    user_id: 'u1',
    workspace_id: 'w1',
    intervention_key: 'account_hiring_signal',
    entity_type: 'account',
    entity_id: 'acc-1',
    reaction: null,
    created_at: NOW,
  })

  it('aucune action journalisée depuis la trace ⇒ `refused` ordinaire (comportement inchangé)', async () => {
    const mocks = makeService([accountTrace()], {}, null, 0)
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'refused', NOW)).resolves.toEqual({ stale: false, handledElsewhere: false })
    expect(mocks.saved.at(-1)?.reaction).toBe('refused')
  })

  it('une action journalisée sur le MÊME objet depuis la trace ⇒ `refused_handled_elsewhere`', async () => {
    const mocks = makeService([accountTrace()], {}, null, 1)
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'refused', NOW)).resolves.toEqual({ stale: false, handledElsewhere: true })
    expect(mocks.saved.at(-1)?.reaction).toBe('refused_handled_elsewhere')
    expect(mocks.userActions.count).toHaveBeenCalledWith({
      where: { workspace_id: 'w1', account_id: 'acc-1', created_at: expect.anything() },
    })
  })

  it('`refused_stale_data` prime : une entité à la fois périmée ET déjà traitée ailleurs s’écrit `refused_stale_data`', async () => {
    const mocks = makeService([accountTrace()], {}, new Date(NOW.getTime() + HOUR), 1)
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'refused', NOW)).resolves.toEqual({ stale: true, handledElsewhere: false })
    expect(mocks.saved.at(-1)?.reaction).toBe('refused_stale_data')
    // « c'était faux » trouvé en premier : pas de lecture pour rien sur `user_actions`.
    expect(mocks.userActions.count).not.toHaveBeenCalled()
  })

  it('un geste `acted` ne consulte jamais `user_actions` — le signal ne s’applique qu’à un refus', async () => {
    const mocks = makeService([accountTrace()], {}, null, 1)
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'acted', NOW)).resolves.toEqual({ stale: false, handledElsewhere: false })
    expect(mocks.userActions.count).not.toHaveBeenCalled()
  })

  it('une clé SANS entité (les ~29 autres du catalogue) ne consulte jamais `user_actions`', async () => {
    const mocks = makeService(
      [{ id: 't0', user_id: 'u1', workspace_id: 'w1', reaction: null, created_at: NOW }],
      {},
      null,
      1,
    )
    const laura = await build(mocks)
    await expect(laura.react('u1', 't0', 'refused', NOW)).resolves.toEqual({ stale: false, handledElsewhere: false })
    expect(mocks.userActions.count).not.toHaveBeenCalled()
  })

  it('`refused_handled_elsewhere` compte comme un refus pour PRÉFÉRENCE (#2403.24), exactement comme `refused`', async () => {
    const traces: Trace[] = [
      {
        id: 't1',
        intervention_key: 'crm_not_connected',
        screen: '/settings/integrations',
        created_at: new Date(NOW.getTime() - 20 * DAY),
        reaction: 'refused',
        priority: 0,
      },
      {
        id: 't2',
        intervention_key: 'crm_not_connected',
        screen: '/settings/integrations',
        created_at: new Date(NOW.getTime() - 10 * DAY),
        reaction: 'refused_handled_elsewhere',
        priority: 0,
      },
    ]
    const laura = await build(makeService(traces))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/settings/integrations',
      busy: false,
      candidateKeys: ['crm_not_connected'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
    if (!plan.speaks) throw new Error('unreachable')
    // Même calcul que le test #2403.24 « deux refus réels » : 25 × 0.7 = 18 (arrondi).
    expect(plan.priority).toBe(18)
  })
})

describe('le score de santé', () => {
  it('ne sort d’AUCUNE réponse côté application', async () => {
    // Le §5.6 le pose comme interne : personne n'a envie d'apprendre que son
    // espace vaut 38 sur 100.
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/accounts',
      busy: false,
      candidateKeys: ['accounts_without_next_action'],
      health: AT_RISK,
      now: NOW,
    })
    expect(JSON.stringify(plan)).not.toMatch(/score|reading|health/i)
  })

  it('n’alerte l’équipe que sous 25, et jamais sans score (D50)', async () => {
    const laura = await build(makeService([]))
    expect(laura.alertsTeam(computeWorkspaceHealth(NOTHING_MEASURED))).toBe(false)
    expect(laura.alertsTeam(HEALTHY)).toBe(false)
    expect(
      laura.alertsTeam(computeWorkspaceHealth({ ...NOTHING_MEASURED, activation: 0, connectors: 0, depth: 0.1 })),
    ).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/*  §13.2 — le budget adaptatif, BRANCHÉ                               */
/* ------------------------------------------------------------------ */

/** Le début de la journée d'hier, dans le fuseau du process — comme le service. */
function yesterdayAt(hour: number): Date {
  const day = new Date(NOW)
  day.setHours(hour, 0, 0, 0)
  day.setDate(day.getDate() - 1)
  return day
}

/** Trois interventions d'hier, dont `accepted` ont été suivies d'un geste. */
function yesterdaysTraces(accepted: number): Trace[] {
  return [0, 1, 2].map(index => ({
    id: `y${index}`,
    user_id: 'u1',
    intervention_key: 'accounts_without_next_action',
    screen: '/accounts',
    reaction: index < accepted ? 'acted' : 'ignored',
    created_at: yesterdayAt(9 + index),
  }))
}

async function planWith(traces: Trace[], options: Record<string, unknown> = {}) {
  const laura = await build(makeService(traces))
  return laura.plan('u1', {
    workspaceId: 'w1',
    screen: '/accounts',
    busy: false,
    candidateKeys: ['accounts_without_next_action'],
    health: AT_RISK,
    now: NOW,
    ...options,
  })
}

describe('le budget adaptatif est LU par le chemin d’envoi', () => {
  it('« hier : 3 envoyées, 1 acceptée » ferme la troisième d’aujourd’hui', async () => {
    // Le plafond réglé est 3. Après une journée à 1 acceptée sur 3, il vaut 2 :
    // deux interventions envoyées aujourd'hui suffisent à faire taire Laura.
    const twoToday: Trace[] = [
      { id: 'a', user_id: 'u1', screen: '/missions', reaction: null, created_at: new Date(NOW.getTime() - 3 * HOUR) },
      { id: 'b', user_id: 'u1', screen: '/needs', reaction: null, created_at: new Date(NOW.getTime() - 2 * HOUR) },
    ]
    expect(await planWith([...twoToday, ...yesterdaysTraces(1)])).toEqual({ speaks: false, reason: 'cap_reached' })
    // Le même état, mais hier tout a été accepté : le plafond reste 3, donc la
    // troisième passe. C'est le témoin qui prouve que la baisse a bien MORDU.
    expect((await planWith([...twoToday, ...yesterdaysTraces(3)])).speaks).toBe(true)
  })

  it('plus de cinq questions posées hier ouvrent une QUATRIÈME intervention', async () => {
    const threeToday: Trace[] = [0, 1, 2].map(index => ({
      id: `t${index}`,
      user_id: 'u1',
      screen: `/s${index}`,
      reaction: 'acted',
      created_at: new Date(NOW.getTime() - (index + 2) * HOUR),
    }))
    expect(await planWith(threeToday)).toEqual({ speaks: false, reason: 'cap_reached' })
    expect((await planWith(threeToday, { spontaneousQueriesYesterday: 6 })).speaks).toBe(true)
    // CINQ pile ne suffit pas — le tome écrit « > 5 ».
    expect(await planWith(threeToday, { spontaneousQueriesYesterday: 5 })).toEqual({
      speaks: false,
      reason: 'cap_reached',
    })
  })

  it('des questions NON MESURÉES ne valent pas « zéro » et ne changent rien', async () => {
    expect(await planWith(yesterdaysTraces(1), { spontaneousQueriesYesterday: null })).toMatchObject({ speaks: true })
  })
})

describe('#2406.35 — une intervention n’envoie jamais vers un écran verrouillé par le palier', () => {
  it('sans paliers connus (chargement, clé API sans lecture), le doute n’interdit pas', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/consultants',
      busy: false,
      candidateKeys: ['empty_talent_pool'],
      health: AT_RISK,
      now: NOW,
    })
    expect(plan.speaks).toBe(true)
  })

  it('un palier qui n’ouvre PAS /consultants (talent_pool) écarte empty_talent_pool', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/consultants',
      busy: false,
      candidateKeys: ['empty_talent_pool'],
      health: AT_RISK,
      now: NOW,
      planFeatures: ['discover'],
    })
    expect(plan).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it('un palier qui OUVRE /consultants (talent_pool) laisse passer empty_talent_pool', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/consultants',
      busy: false,
      candidateKeys: ['empty_talent_pool'],
      health: AT_RISK,
      now: NOW,
      planFeatures: ['talent_pool'],
    })
    expect(plan.speaks).toBe(true)
  })

  it('une intervention sans route verrouillée (route: null) n’est jamais filtrée par le palier', async () => {
    const laura = await build(makeService([]))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: '/actions',
      busy: false,
      candidateKeys: ['first_action_validated'],
      health: AT_RISK,
      now: NOW,
      planFeatures: ['discover'],
    })
    expect(plan.speaks).toBe(true)
  })
})

/* ------------------------------------------------------------------ */
/*  §13.3 — les moments d'or, BRANCHÉS                                 */
/* ------------------------------------------------------------------ */

describe('les moments d’or lèvent le plafond, et rien d’autre', () => {
  /** Trois interventions aujourd'hui, sur trois écrans : le plafond est atteint. */
  const capReached: Trace[] = [0, 1, 2].map(index => ({
    id: `c${index}`,
    user_id: 'u1',
    screen: `/other-${index}`,
    reaction: 'acted',
    created_at: new Date(NOW.getTime() - (index + 2) * HOUR),
  }))

  it('un blocage réel fait passer l’intervention QUI LE CONCERNE', async () => {
    expect(await planWith(capReached, { candidateKeys: ['connector_error_48h'] })).toEqual({
      speaks: false,
      reason: 'cap_reached',
    })
    const plan = await planWith(capReached, {
      candidateKeys: ['connector_error_48h'],
      goldenMoment: 'real_blocker',
      screen: '/dashboard',
    })
    expect(plan).toMatchObject({ speaks: true, goldenMoment: 'real_blocker' })
  })

  it('et RIEN d’autre : la dérogation ne devient pas un budget illimité', async () => {
    // Un jeton de connecteur expiré ne donne pas le droit de parler du cockpit.
    expect(
      await planWith(capReached, { candidateKeys: ['accounts_without_next_action'], goldenMoment: 'real_blocker' }),
    ).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it('un retour d’absence fait passer le brief de reprise', async () => {
    const plan = await planWith(capReached, {
      candidateKeys: ['no_connection_7_days'],
      goldenMoment: 'return_from_absence',
      screen: '/dashboard',
    })
    expect(plan).toMatchObject({ speaks: true, goldenMoment: 'return_from_absence' })
  })

  it('« fin d’action longue » est honorée et ne trouve rien à dire — Laura se tait', async () => {
    // Le catalogue n'a aucune intervention « ton analyse est prête ». Le moment
    // est détecté, la porte l'honore, et le silence est le bon comportement.
    expect(
      await planWith(capReached, {
        candidateKeys: ['accounts_without_next_action'],
        goldenMoment: 'long_action_finished',
      }),
    ).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it('ne contourne NI l’interrupteur, NI le retrait', async () => {
    const laura = await build(makeService(capReached, { laura_enabled: false }))
    expect(
      await laura.plan('u1', {
        workspaceId: 'w1',
        screen: '/dashboard',
        busy: false,
        candidateKeys: ['connector_error_48h'],
        health: AT_RISK,
        goldenMoment: 'real_blocker',
        now: NOW,
      }),
    ).toEqual({ speaks: false, reason: 'disabled' })

    const inRetreat = await build(makeService(capReached, { laura_retreat_until: new Date(NOW.getTime() + 3 * DAY) }))
    expect(
      await inRetreat.plan('u1', {
        workspaceId: 'w1',
        screen: '/dashboard',
        busy: false,
        candidateKeys: ['connector_error_48h'],
        health: AT_RISK,
        goldenMoment: 'real_blocker',
        now: NOW,
      }),
    ).toEqual({ speaks: false, reason: 'retreat' })
  })

  it('ne dit « moment d’or » que quand l’exception a SERVI', async () => {
    // Sous le plafond, l'intervention passait de toute façon.
    const plan = await planWith([], { candidateKeys: ['connector_error_48h'], goldenMoment: 'real_blocker' })
    expect(plan).toMatchObject({ speaks: true })
    expect(plan).not.toHaveProperty('goldenMoment')
  })
})

/**
 * LE COÛT DE L'INTERCONTRAT DANS LE MESSAGE DE `long_bench` — trois cas qui ne
 * se confondent JAMAIS, à la sortie de `plan()` : c'est ce que reçoit
 * réellement `/laura/plan`, pas seulement ce que calcule `computeBenchCost`
 * en isolation (`bench-cost.spec.ts`).
 *
 * ⚠️ Le service rend le RÉSULTAT structuré (`BenchCostResult` — centimes ou
 * raison NOMMÉE), jamais une phrase déjà composée : une chaîne française sur
 * `plan.detail` s'affichait telle quelle sur un écran bilingue. `benchCost`
 * voyage tel que `computeBenchCost` le rend ; c'est à l'écran de le lire dans
 * SA langue (voir `LauraCard.test.tsx`).
 */
/**
 * #3398.4a (recette salle démo 03/10) — la bulle de `follow_up_overdue` ne
 * nommait pas la relance due. Le RÉSULTAT (titre, compte, jours, autres)
 * voyage sur `overdueFollowUp`, réservé à cette clé — même règle que `benchCost`.
 */
describe('LauraService — la relance en retard NOMMÉE atteint `follow_up_overdue`', () => {
  const followUp = {
    title: 'Relancer sur les deux profils conformité',
    accountName: 'Société Générale',
    daysOverdue: 2,
    others: 0,
  }

  it('la relance la plus en retard voyage telle quelle, sur sa seule clé', async () => {
    const plan = await planWith([], { candidateKeys: ['follow_up_overdue'], overdueFollowUp: followUp })
    expect(plan).toMatchObject({ speaks: true, overdueFollowUp: followUp })
  })

  it('une autre intervention ne reçoit JAMAIS de relance nommée', async () => {
    const plan = await planWith([], { candidateKeys: ['long_bench'], overdueFollowUp: followUp })
    expect(plan).toMatchObject({ speaks: true })
    if (plan.speaks) expect(plan).not.toHaveProperty('overdueFollowUp')
  })

  it('rien de lisible : AUCUNE relance inventée, la phrase du catalogue reste seule', async () => {
    const plan = await planWith([], { candidateKeys: ['follow_up_overdue'], overdueFollowUp: null })
    expect(plan).toMatchObject({ speaks: true })
    if (plan.speaks) expect(plan).not.toHaveProperty('overdueFollowUp')
  })
})

describe('LauraService — le coût de l’intercontrat atteint `long_bench` sous forme structurée', () => {
  it('TJM et durée connus : le montant, en CENTIMES, apparaît dans `benchCost`', async () => {
    const plan = await planWith([], {
      candidateKeys: ['long_bench'],
      longBenchCost: { measurable: true, amountCents: 1_350_000 },
    })
    expect(plan).toMatchObject({ speaks: true, benchCost: { measurable: true, amountCents: 1_350_000 } })
  })

  it('TJM inconnu : la raison NOMMÉE voyage — jamais un montant, jamais un texte', async () => {
    const plan = await planWith([], {
      candidateKeys: ['long_bench'],
      longBenchCost: { measurable: false, reason: 'tjm_missing' },
    })
    expect(plan).toMatchObject({
      speaks: true,
      benchCost: { measurable: false, reason: 'tjm_missing' },
    })
    // Le zéro qui ment : pas de montant DU TOUT sur un coût non mesurable —
    // pas même un `amountCents: 0` qui prétendrait avoir calculé quelque chose.
    if (plan.speaks) expect(plan.benchCost).not.toHaveProperty('amountCents')
  })

  it('durée inconnue : « non mesurable », NOMMÉ, même avec un TJM connu', async () => {
    const plan = await planWith([], {
      candidateKeys: ['long_bench'],
      longBenchCost: { measurable: false, reason: 'duration_unknown' },
    })
    expect(plan).toMatchObject({
      speaks: true,
      benchCost: { measurable: false, reason: 'duration_unknown' },
    })
  })

  it('rien à chiffrer (coût illisible ou non demandé) : AUCUN `benchCost` inventé — la phrase du catalogue reste seule', async () => {
    const plan = await planWith([], { candidateKeys: ['long_bench'], longBenchCost: null })
    expect(plan).toMatchObject({ speaks: true })
    if (plan.speaks) expect(plan).not.toHaveProperty('benchCost')
  })

  it('une autre intervention que `long_bench` ne reçoit JAMAIS de `benchCost` — le reste du catalogue reste sa phrase statique', async () => {
    const plan = await planWith([], {
      candidateKeys: ['accounts_without_next_action'],
      longBenchCost: { measurable: true, amountCents: 1_350_000 },
    })
    expect(plan).toMatchObject({ speaks: true, intervention: { key: 'accounts_without_next_action' } })
    if (plan.speaks) expect(plan).not.toHaveProperty('benchCost')
  })
})

/**
 * LA BULLE DU DOSSIER PASSE PAR LE BUDGET — elle ne le contourne pas.
 *
 * C'est la moitié qui compte de la surface contextuelle. « Laura se tait quand
 * tu travailles » et « Laura parle autant que tu l'écoutes » sont des
 * comportements LIVRÉS ; une bulle qui apparaîtrait à chaque ouverture de
 * dossier les déferait tous les deux, et personne ne s'en apercevrait avant de
 * l'avoir vue quinze fois dans la même matinée.
 *
 * Chaque cas ci-dessous rejoue une borne EXISTANTE avec la clé du dossier, sur
 * le MÊME `plan()` que les trente-cinq autres interventions. Aucun chemin
 * parallèle : s'il en existait un, ces tests seraient verts pour rien.
 */
describe('la suggestion du dossier passe par le budget d’interruption', () => {
  const DOSSIER = '/accounts/8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b'
  const SUGGESTION = {
    accountId: '8f5c2a11-4d6e-4b2a-9f10-2c3d4e5f6a7b',
    facts: [
      {
        kind: 'hiring_signal' as const,
        statement: 'Deux postes Méthodes ouverts sur le site de Toulouse',
        source: 'Site carrières du groupe',
        observedOn: '2026-07-21',
        count: null,
      },
    ],
    resource: { state: 'measured' as const, availableNow: 1, undeclared: 0 },
  }

  const onDossier = (traces: Trace[], options: Record<string, unknown> = {}) =>
    planWith(traces, {
      screen: DOSSIER,
      candidateKeys: ['account_hiring_with_available_bench'],
      accountSuggestion: SUGGESTION,
      ...options,
    })

  it('parle, pose une trace, et rapporte les faits qui l’ont produite', async () => {
    const mocks = makeService([])
    const laura = await build(mocks)
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: DOSSIER,
      busy: false,
      candidateKeys: ['account_hiring_with_available_bench'],
      health: AT_RISK,
      accountSuggestion: SUGGESTION,
      now: NOW,
    })
    expect(plan).toMatchObject({ speaks: true, accountSuggestion: SUGGESTION })
    // La trace est ce qui CONSOMME le budget du jour : sans elle, la bulle
    // serait gratuite et le plafond ne verrait jamais rien passer.
    expect(mocks.interventions.save).toHaveBeenCalled()
    // #2403.38 — la trace porte l'ENTITÉ concernée, prête pour l'invalidation
    // sur correction humaine.
    const saved = mocks.saved.at(-1) as Trace
    expect(saved.entity_type).toBe('account')
    expect(saved.entity_id).toBe(SUGGESTION.accountId)
    expect(mocks.saved[0]).toMatchObject({ screen: DOSSIER, format: 'panel' })
  })

  it('SE TAIT quand la personne travaille — la bulle n’a aucun passe-droit', async () => {
    expect(await onDossier([], { busy: true })).toEqual({ speaks: false, reason: 'busy' })
  })

  it('SE TAIT quand la personne a coupé Laura (D49)', async () => {
    const laura = await build(makeService([], { laura_enabled: false }))
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: DOSSIER,
      busy: false,
      candidateKeys: ['account_hiring_with_available_bench'],
      health: AT_RISK,
      accountSuggestion: SUGGESTION,
      now: NOW,
    })
    expect(plan).toEqual({ speaks: false, reason: 'disabled' })
  })

  it('SE TAIT sur un dossier DÉJÀ servi — jamais deux fois sur le même compte', async () => {
    const served: Trace[] = [
      { id: 't0', screen: DOSSIER, created_at: new Date(NOW.getTime() - 3 * HOUR), reaction: null },
    ]
    expect(await onDossier(served)).toEqual({ speaks: false, reason: 'screen_already_served' })
  })

  it('SE TAIT dans les vingt minutes qui suivent une autre intervention', async () => {
    const justNow: Trace[] = [
      { id: 't0', screen: '/missions', created_at: new Date(NOW.getTime() - 5 * 60 * 1000), reaction: null },
    ]
    expect(await onDossier(justNow)).toMatchObject({ speaks: false, reason: 'too_soon' })
  })

  it('SE TAIT quand le plafond du jour est atteint', async () => {
    // Trois interventions aujourd'hui, plafond réglé à trois, sur des écrans
    // différents et espacées de plus de vingt minutes : seul le plafond refuse.
    const threeToday: Trace[] = [
      { id: 'a', screen: '/missions', reaction: null, created_at: new Date(NOW.getTime() - 5 * HOUR) },
      { id: 'b', screen: '/needs', reaction: null, created_at: new Date(NOW.getTime() - 4 * HOUR) },
      { id: 'c', screen: '/billing', reaction: null, created_at: new Date(NOW.getTime() - 3 * HOUR) },
    ]
    expect(await onDossier(threeToday)).toEqual({ speaks: false, reason: 'cap_reached' })
  })

  it('SE TAIT pendant le retrait, et sans rien écrire', async () => {
    const mocks = makeService([], { laura_retreat_until: new Date(NOW.getTime() + 3 * DAY) })
    const laura = await build(mocks)
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: DOSSIER,
      busy: false,
      candidateKeys: ['account_hiring_with_available_bench'],
      health: AT_RISK,
      accountSuggestion: SUGGESTION,
      now: NOW,
    })
    expect(plan).toMatchObject({ speaks: false, reason: 'retreat' })
    expect(mocks.interventions.save).not.toHaveBeenCalled()
  })

  it('SE TAIT trente jours après un refus — un refus veut dire quelque chose', async () => {
    const refused: Trace[] = [
      {
        id: 'r',
        screen: '/accounts/un-autre-dossier',
        intervention_key: 'account_hiring_with_available_bench',
        reaction: 'refused',
        created_at: new Date(NOW.getTime() - 3 * DAY),
      },
    ]
    expect(await onDossier(refused)).toEqual({ speaks: false, reason: 'nothing_to_say' })
  })

  it('une AUTRE intervention ne reçoit jamais la suggestion du dossier', async () => {
    // Le pendant exact de la règle de `benchCost` : des sources affichées sous
    // une intervention qu'elles n'ont pas produite seraient une explication
    // FAUSSE, ce qui est pire qu'une explication absente.
    const plan = await onDossier([], { candidateKeys: ['accounts_without_next_action'] })
    expect(plan).toMatchObject({ speaks: true, intervention: { key: 'accounts_without_next_action' } })
    if (plan.speaks) expect(plan).not.toHaveProperty('accountSuggestion')
  })

  it('aucune suggestion mesurée : la phrase du catalogue reste seule, rien n’est inventé', async () => {
    const plan = await onDossier([], { accountSuggestion: null })
    expect(plan).toMatchObject({ speaks: true })
    if (plan.speaks) expect(plan).not.toHaveProperty('accountSuggestion')
  })

  // #3939.3 — la douleur sourcée du dossier : même budget, même entité, ses PROPRES faits.
  const PAIN = {
    accountId: SUGGESTION.accountId,
    facts: [
      {
        kind: 'pain_hypothesis' as const,
        statement: 'Arbitrage budgétaire',
        source: null,
        observedOn: null,
        count: null,
      },
      { kind: 'pain_signal' as const, statement: 'Plan annoncé', source: null, observedOn: '2026-07', count: null },
    ],
    resource: null,
  }

  it('#3939.3 la douleur parle avec SES faits et pose l’entité du compte', async () => {
    const mocks = makeService([])
    const laura = await build(mocks)
    const plan = await laura.plan('u1', {
      workspaceId: 'w1',
      screen: DOSSIER,
      busy: false,
      candidateKeys: ['account_pain_with_dated_signal'],
      health: AT_RISK,
      accountSuggestion: SUGGESTION,
      painSuggestion: PAIN,
      now: NOW,
    })
    expect(plan).toMatchObject({
      speaks: true,
      intervention: { key: 'account_pain_with_dated_signal' },
      accountSuggestion: PAIN,
    })
    const saved = mocks.saved.at(-1) as Trace
    expect(saved.entity_type).toBe('account')
    expect(saved.entity_id).toBe(PAIN.accountId)
  })

  it('#3939.3 la douleur n’a aucun passe-droit — dossier déjà servi = silence', async () => {
    const served: Trace[] = [
      { id: 't0', screen: DOSSIER, created_at: new Date(NOW.getTime() - 3 * HOUR), reaction: null },
    ]
    expect(
      await onDossier(served, { candidateKeys: ['account_pain_with_dated_signal'], painSuggestion: PAIN }),
    ).toEqual({ speaks: false, reason: 'screen_already_served' })
  })

  it('#3939.3 le recrutement ne reçoit jamais les faits de la douleur', async () => {
    const plan = await onDossier([], { accountSuggestion: SUGGESTION, painSuggestion: PAIN })
    expect(plan).toMatchObject({ speaks: true, accountSuggestion: SUGGESTION })
  })
})

/**
 * #2409.8 — Laura NOMME d'elle-même ce qui manque avant un démarrage. Tranché
 * sans Louis (décision §12) : le détecteur existant et SA carte, avec les faits
 * de la mission la plus proche — le RÉSULTAT (clés), jamais une phrase.
 */
describe('LauraService — les manques du démarrage atteignent `mission_start_not_ready`', () => {
  const START = {
    missionId: 'm-1',
    label: 'Renfort sécurité',
    startsOn: '2026-10-05',
    verdict: 'blocked' as const,
    missing: ['consultant_agreement' as const],
    reserves: ['site_access' as const],
  }

  it('attache les manques NOMMÉS à l’intervention du démarrage', async () => {
    const plan = await planWith([], { candidateKeys: ['mission_start_not_ready'], missionStart: START })
    expect(plan).toMatchObject({ speaks: true, missionStart: START })
  })

  it('ne les attache JAMAIS à une autre intervention', async () => {
    const plan = await planWith([], { candidateKeys: ['accounts_without_next_action'], missionStart: START })
    expect(plan).toMatchObject({ speaks: true })
    if (plan.speaks) expect(plan).not.toHaveProperty('missionStart')
  })

  it('rien lu : AUCUN fait inventé, la phrase du catalogue reste seule', async () => {
    const plan = await planWith([], { candidateKeys: ['mission_start_not_ready'], missionStart: null })
    expect(plan).toMatchObject({ speaks: true })
    if (plan.speaks) expect(plan).not.toHaveProperty('missionStart')
  })
})

/**
 * #2875 — décision Louis 11/10/2026 (« pas de budget, fais ce que tu veux ») :
 * la bulle « appels récents sans débrief » ne sortait pas, le budget proactif
 * partagé (3/jour) étant épuisé. Les RAPPELS D'HYGIÈNE (`hygiene: true` au
 * catalogue — `calls_without_debrief`, `mission_ended_without_feedback`) ne
 * consomment plus ce budget et n'en sont plus bloqués ; leur garde-fou propre
 * est le cooldown par clé (24 h, `KEY_COOLDOWN_HOURS`) — une fois par jour et
 * par sujet. La volonté de la personne (coupée, en retrait, occupée) les fait
 * taire comme les autres.
 */
describe('#2875 — les rappels d’hygiène sortent du budget d’interruption', () => {
  const threeToday: Trace[] = [0, 1, 2].map(index => ({
    id: `t${index}`,
    user_id: 'u1',
    intervention_key: 'margin_not_measured',
    screen: index === 0 ? '/chat' : `/s${index}`,
    reaction: null,
    created_at: new Date(NOW.getTime() - (5 + index) * 60_000),
  }))
  const onChat = (traces: Trace[], candidateKeys: string[], preference = {}, busy = false) =>
    build(makeService(traces, preference)).then(laura =>
      laura.plan('u1', { workspaceId: 'w1', screen: '/chat', busy, candidateKeys, health: AT_RISK, now: NOW }),
    )

  it('plafond atteint, écran déjà servi, il y a cinq minutes : le débrief manquant sort quand même', async () => {
    const plan = await onChat(threeToday, ['calls_without_debrief'])
    expect(plan.speaks && plan.intervention.key).toBe('calls_without_debrief')
    // Le témoin qui dit NON : une intervention ordinaire reste bloquée.
    expect(await onChat(threeToday, ['accounts_without_next_action'])).toMatchObject({ speaks: false })
  })

  it('le retour d’expérience manquant est un rappel d’hygiène du même type', async () => {
    const plan = await onChat(threeToday, ['mission_ended_without_feedback'])
    expect(plan.speaks && plan.intervention.key).toBe('mission_ended_without_feedback')
  })

  it('bloqué, Laura ne dit QUE le rappel d’hygiène, jamais une candidate ordinaire passée avec lui', async () => {
    const plan = await onChat(threeToday, ['accounts_without_next_action', 'calls_without_debrief'])
    expect(plan.speaks && plan.intervention.key).toBe('calls_without_debrief')
  })

  it('un rappel d’hygiène ne CONSOMME pas le budget : ni plafond, ni écran, ni délai de vingt minutes', async () => {
    const hygieneJustNow: Trace = {
      id: 'h',
      user_id: 'u1',
      intervention_key: 'calls_without_debrief',
      screen: '/accounts',
      reaction: null,
      created_at: new Date(NOW.getTime() - 2 * 60_000),
    }
    const twoToday = threeToday.slice(1).map(trace => ({ ...trace, created_at: new Date(NOW.getTime() - 3 * HOUR) }))
    const plan = await planWith([hygieneJustNow, ...twoToday])
    expect(plan.speaks && plan.intervention.key).toBe('accounts_without_next_action')
  })

  it('garde-fou : une fois par jour et par sujet (cooldown de 24 h par clé)', async () => {
    const debriefEarlier: Trace = {
      id: 'h',
      user_id: 'u1',
      intervention_key: 'calls_without_debrief',
      screen: '/chat',
      reaction: null,
      created_at: new Date(NOW.getTime() - 3 * HOUR),
    }
    expect(await onChat([debriefEarlier], ['calls_without_debrief'])).toEqual({
      speaks: false,
      reason: 'nothing_to_say',
    })
    expect(await onChat([debriefEarlier, ...threeToday], ['calls_without_debrief'])).toMatchObject({ speaks: false })
    const yesterday = { ...debriefEarlier, created_at: new Date(NOW.getTime() - 25 * HOUR) }
    expect((await onChat([yesterday, ...threeToday], ['calls_without_debrief'])).speaks).toBe(true)
  })

  it('la volonté de la personne gagne : coupée, en retrait ou occupée, le rappel d’hygiène se tait aussi', async () => {
    expect(await onChat([], ['calls_without_debrief'], { laura_enabled: false })).toEqual({
      speaks: false,
      reason: 'disabled',
    })
    expect(
      await onChat([], ['calls_without_debrief'], { laura_retreat_until: new Date(NOW.getTime() + DAY) }),
    ).toMatchObject({ speaks: false, reason: 'retreat' })
    expect(await onChat([], ['calls_without_debrief'], {}, true)).toEqual({ speaks: false, reason: 'busy' })
  })

  it('une réaction à un rappel d’hygiène ne touche pas au budget partagé (ni plafond réduit, ni retrait)', async () => {
    const closed = [0, 1].map(index => ({
      id: `c${index}`,
      user_id: 'u1',
      intervention_key: 'week_one_recap',
      screen: '/dashboard',
      reaction: 'closed_unread',
      created_at: new Date(NOW.getTime() - (index + 1) * HOUR),
    }))
    const live = {
      id: 'live',
      user_id: 'u1',
      intervention_key: 'calls_without_debrief',
      reaction: null,
      created_at: NOW,
    }
    const mocks = makeService([live, ...closed])
    const laura = await build(mocks)
    await laura.react('u1', 'live', 'closed_unread', NOW)
    expect(mocks.interventions.save).toHaveBeenCalled()
    expect(mocks.preferences.save).not.toHaveBeenCalled()
  })
})
