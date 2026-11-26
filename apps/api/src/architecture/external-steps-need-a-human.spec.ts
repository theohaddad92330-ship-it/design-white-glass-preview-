import {
  actionIntentTypeSchema,
  APPROVAL_TTL_MS,
  delegationVerdict,
  AUTOMATION_LEVEL_ORDER,
  DEFAULT_APPROVAL_SETTINGS,
  reachesOutsideProduct,
  writesIntoClientTool,
  type ApprovalSettings,
  type AutomationLevel,
  type WorkflowStep,
} from '@bellum/contracts'
import type { ApprovalRequestEntity } from '../database/entities/approval-request.entity'
import type { WorkflowRunEntity } from '../database/entities/workflow-run.entity'
import type { WorkspaceEntity } from '../database/entities/workspace.entity'
import { createMockRepository } from '../database/test-utils'
import { decideApproval, demandsAHuman, HUMAN_DEMAND_ORDER, levelForStep } from '../modules/action-os/approval-policy'
import { cardDefinitionForKey } from '../modules/action-os/copilot-card-catalog'
import { CopilotCardService } from '../modules/action-os/copilot-card.service'
import { inMemoryRepository } from '../modules/action-os/testing/in-memory-repository'
import { WORKFLOW_CATALOG } from '../modules/action-os/workflow-catalog'
import { WorkflowRunnerService } from '../modules/action-os/workflow-runner.service'
import { ROUTINE_CATALOG } from '../modules/routines/routine-catalog'

/**
 * GA-239 — un pas dont l'effet SORT du produit exige toujours un humain.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI A PRODUIT CETTE GARDE (mesuré le 01/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `atLeast` comparait deux niveaux d'automatisation en lisant
 * `AUTOMATION_LEVEL_ORDER`, l'échelle du contrat — qui va du moins autonome
 * (`n0_advice`) au plus autonome (`n5_extended_auto`). `n4_bounded_auto` y passe
 * donc AU-DESSUS de `n2_user_approval`, si bien que le « plancher »
 * `maxLevel('n2_user_approval', settings.defaultLevel)` rendait `n4` pour un
 * espace configuré en automatique borné. Le planificateur basculait alors le pas
 * dans « exécutable maintenant », et le récapitulatif de rendez-vous
 * (`meeting_follow_up` → `send_recap`, `risk: 'irreversible'`, famille
 * `bulk_send`) partait chez le client sans que personne l'ait vu.
 *
 * Deux choses rendent ce défaut instructif :
 *
 *  1. **Le docbloc disait déjà la vérité.** `levelForStep` était commenté « la
 *     seule ligne du barème qui ne dépend d'aucun réglage ». Le code faisait
 *     l'inverse. C'est pour ça que cette garde vérifie un COMPORTEMENT — elle
 *     appelle les fonctions — et ne lit jamais le texte des fichiers : un
 *     commentaire juste au-dessus d'un code faux est exactement ce qui a permis
 *     le défaut, et une garde textuelle l'aurait recopié.
 *
 *  2. **Un test l'affirmait déjà, et restait vert.** `approval-policy.spec.ts`
 *     concluait « ne redescend JAMAIS sous le seuil » avec
 *     `atLeast(requiredLevel, 'n3_manager_approval')` — mesuré avec l'ordre
 *     FAUTIF, `n5` répondait « oui ». Une garde qui mesure avec l'instrument
 *     qu'elle est censée vérifier ne vérifie rien.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Trois corpus RÉELS, importés (jamais recopiés) : le catalogue de workflows,
 * le catalogue de routines, et l'échelle du contrat. Le premier bloc de tests
 * vérifie qu'aucun n'est vide — une garde qui balaie zéro élément passe pour
 * toujours (six gardes borgnes en deux jours dans ce dépôt).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle juge la PORTÉE d'après `intentType`, donc d'après ce que le pas déclare
 * faire. Un futur intent `internal` qui appellerait un service d'envoi lui
 * échapperait — c'est la table `INTENT_REACH` (`packages/contracts`), exhaustive
 * par construction, qui porte cette garantie-là : un nouveau type d'intent ne
 * compile pas tant que personne n'a répondu à la question.
 */

/** Ce qu'un espace peut porter en base, y compris ce qu'aucun écran ne pose. */
const EVERY_LEVEL: readonly AutomationLevel[] = AUTOMATION_LEVEL_ORDER

/** Tous les pas du catalogue, aplatis, avec le workflow d'où ils viennent. */
const EVERY_STEP: readonly { workflow: string; step: WorkflowStep }[] = WORKFLOW_CATALOG.flatMap(definition =>
  definition.steps.map(step => ({ workflow: definition.key, step })),
)

function settingsAt(defaultLevel: AutomationLevel): ApprovalSettings {
  return { ...DEFAULT_APPROVAL_SETTINGS, defaultLevel }
}

/**
 * Le planificateur, monté à vide.
 *
 * `plan()` est PUR : il ne touche ni base, ni routeur, ni réservation — il
 * appelle la politique et range les pas en trois listes. Le monter sans
 * dépendances est donc exact, et c'est ce qui permet à cette garde de mesurer la
 * seule chose vraiment observable : la liste « exécutable maintenant ».
 */
function planner(): WorkflowRunnerService {
  const missing = null as never
  return new WorkflowRunnerService(missing, missing, missing, missing, missing, missing)
}

describe('GA-239 — les corpus lus ne sont pas vides', () => {
  it('le catalogue de workflows porte des pas', () => {
    expect(WORKFLOW_CATALOG.length).toBeGreaterThanOrEqual(5)
    expect(EVERY_STEP.length).toBeGreaterThanOrEqual(10)
  })

  it('le corpus contient au moins un pas qui SORT du produit', () => {
    // Sans lui, tous les `it.each` ci-dessous seraient vrais par vacuité.
    const external = EVERY_STEP.filter(({ step }) => reachesOutsideProduct(step.intentType))
    expect(external.length).toBeGreaterThanOrEqual(1)
    expect(external.map(e => e.step.key)).toContain('send_recap')
  })

  it('et au moins un pas INTERNE — la garde doit distinguer, pas tout bloquer', () => {
    expect(EVERY_STEP.some(({ step }) => !reachesOutsideProduct(step.intentType))).toBe(true)
  })

  it('le catalogue de routines est lu, lui aussi', () => {
    expect(ROUTINE_CATALOG.length).toBeGreaterThanOrEqual(20)
  })

  it('les six niveaux du barème sont là', () => {
    expect(EVERY_LEVEL).toHaveLength(6)
  })
})

describe('GA-239 — l’ordre comparé est une permutation de l’échelle du contrat', () => {
  /**
   * La politique compare une AUTRE relation que l'échelle du contrat (voir
   * `HUMAN_DEMAND_ORDER`). Deux listes, donc un risque : un septième niveau
   * ajouté d'un côté et oublié de l'autre. `indexOf` rendrait `-1` sans rien
   * dire, et le niveau oublié se classerait sous tous les autres — c'est-à-dire
   * du côté « personne n'a besoin de dire oui ».
   */
  it('les deux listes portent exactement les mêmes niveaux', () => {
    expect([...HUMAN_DEMAND_ORDER].sort()).toEqual([...AUTOMATION_LEVEL_ORDER].sort())
  })

  it('elles ne portent pas le même ORDRE — sinon le défaut est revenu', () => {
    expect([...HUMAN_DEMAND_ORDER]).not.toEqual([...AUTOMATION_LEVEL_ORDER])
  })

  it('les deux niveaux autonomes sont les DEUX plus bas en exigence humaine', () => {
    expect(HUMAN_DEMAND_ORDER.slice(0, 2)).toEqual(['n5_extended_auto', 'n4_bounded_auto'])
  })

  it('demandsAHuman découpe le barème là où il faut', () => {
    expect(EVERY_LEVEL.filter(demandsAHuman)).toEqual(['n2_user_approval', 'n3_manager_approval'])
  })
})

/**
 * ⚠️ L'INSTRUMENT DE MESURE EST ÉCRIT EN TOUTES LETTRES, ET C'EST LE POINT.
 *
 * La première version de cette garde vérifiait `demandsAHuman(resolved)`. En
 * cassant volontairement l'ordre pour prouver qu'elle savait dire NON, elle est
 * restée VERTE sur ce bloc : `demandsAHuman` s'appuie sur le même ordre, donc le
 * défaut corrompt la mesure en même temps que le code mesuré — exactement le
 * travers qu'elle reproche au test d'origine (`atLeast(requiredLevel, 'n3')`).
 *
 * Les deux seuls niveaux qui font poser la question à quelqu'un sont donc listés
 * ici, à la main, sans passer par la politique. Le lien avec la politique est
 * vérifié séparément (« demandsAHuman découpe le barème là où il faut ») : si
 * les deux divergent, c'est CE test-là qui tombe, et il désigne le coupable.
 */
const LEVELS_THAT_ASK_A_HUMAN = ['n2_user_approval', 'n3_manager_approval']

describe('GA-239 — aucun réglage ne fait partir un pas externe tout seul', () => {
  const CASES = EVERY_LEVEL.flatMap(level => EVERY_STEP.map(entry => ({ ...entry, level })))

  it('le produit cartésien balayé n’est pas vide', () => {
    expect(CASES.length).toBe(EVERY_LEVEL.length * EVERY_STEP.length)
    expect(CASES.length).toBeGreaterThanOrEqual(60)
  })

  it.each(CASES)('$workflow/$step.key à $level', ({ step, level }) => {
    const resolved = levelForStep(step, settingsAt(level))
    const mustAskSomeone = reachesOutsideProduct(step.intentType) || step.risk === 'irreversible'
    if (mustAskSomeone) expect(LEVELS_THAT_ASK_A_HUMAN).toContain(resolved)
  })

  it.each(EVERY_LEVEL)('un run entier de « Après le rendez-vous » à %s attend quelqu’un', level => {
    // Le run, et pas seulement le pas : c'est `decideApproval` qui agrège, et
    // c'est son agrégation qui laissait le niveau du workflow avaler celui du
    // pas. Le workflow est nommé parce qu'il porte l'envoi ; le balayage
    // exhaustif au-dessus couvre les autres.
    const definition = WORKFLOW_CATALOG.find(d => d.key === 'meeting_follow_up')
    expect(definition).toBeDefined()
    const decision = decideApproval({
      steps: definition?.steps ?? [],
      workflowMinimum: 'n5_extended_auto',
      targetCount: 1,
      estimatedCredits: 0,
      settings: settingsAt(level),
    })
    expect(LEVELS_THAT_ASK_A_HUMAN).toContain(decision.requiredLevel)
  })

  it.each(EVERY_LEVEL)('et le PLANIFICATEUR ne le range pas dans « exécutable » à %s', level => {
    // La mesure la plus indépendante qui existe ici : une LISTE observable.
    // `plan()` est le dernier endroit avant que quelque chose parte ; si le
    // barème se retrompe un jour, l'envoi réapparaîtra dans `executableNow` et
    // ce test le dira, quelle que soit la façon dont le niveau a été calculé.
    const definition = WORKFLOW_CATALOG.find(d => d.key === 'meeting_follow_up')
    expect(definition).toBeDefined()
    if (!definition) return
    const plan = planner().plan(
      definition,
      {
        intents: Object.fromEntries(definition.steps.map(s => [s.key, { type: 'notify_user', title: 'x' }])),
        targetLabel: 'ACME',
        targetCount: 1,
        availableCapabilities: new Set(definition.steps.map(s => s.capability)),
      },
      settingsAt(level),
    )
    expect(plan.executableNow.map(p => p.step.key)).not.toContain('send_recap')
    expect(plan.approvalRequired.map(p => p.step.key)).toContain('send_recap')
  })
})

describe('GA-239 — la PORTÉE seule suffit à exiger un humain', () => {
  /**
   * ⚠️ CE BLOC EXISTE PARCE QUE LE CATALOGUE NE SUFFIT PAS À LE PROUVER.
   *
   * Les deux pas externes du catalogue (`send_recap`, `push_profile`) sont AUSSI
   * déclarés `risk: 'irreversible'`. En retirant volontairement la clause de
   * portée pour vérifier que la garde savait dire NON, elle est restée verte :
   * la clause du risque rattrapait les deux cas. Le catalogue ne contient donc
   * aucun pas EXTERNE-ET-RÉVERSIBLE — la forme même que la clause protège, et
   * celle qu'un auteur de pas écrira le jour où il déclarera `low` sur un envoi
   * qu'il croit rattrapable.
   *
   * On la fabrique donc, à partir de l'énumération des intents — pas d'une liste
   * recopiée. Un neuvième type classé `external` entre ici tout seul.
   */
  const EXTERNAL_TYPES = actionIntentTypeSchema.options.filter(reachesOutsideProduct)

  /** Un pas nu : réversible, gratuit, sans famille sensible. Seule la PORTÉE parle. */
  function bareStep(intentType: (typeof EXTERNAL_TYPES)[number]): WorkflowStep {
    return {
      key: `bare_${intentType}`,
      intentType,
      intent: 'Un pas que son auteur croit rattrapable',
      capability: 'email',
      permission: 'contacts:send',
      estimatedCredits: 0,
      risk: 'low',
      expectedResult: 'Quelque chose est parti',
      dependsOn: [],
      retry: { maxAttempts: 1, backoffSeconds: 30, retryOnUnknown: false },
    }
  }

  it('l’énumération des intents porte au moins un type externe', () => {
    expect(actionIntentTypeSchema.options.length).toBeGreaterThanOrEqual(8)
    expect(EXTERNAL_TYPES).toContain('send_email')
    expect(EXTERNAL_TYPES.length).toBeGreaterThanOrEqual(2)
  })

  it.each(EXTERNAL_TYPES.flatMap(t => EVERY_LEVEL.map(level => ({ t, level }))))(
    'un $t nu, annoncé « low » et gratuit, exige quand même quelqu’un à $level',
    ({ t, level }) => {
      expect(LEVELS_THAT_ASK_A_HUMAN).toContain(levelForStep(bareStep(t), settingsAt(level)))
    },
  )
})

describe('GA-239 — le plancher ne mange pas le travail interne borné', () => {
  /**
   * L'autre moitié de la règle, et elle compte autant : `n4_bounded_auto` est
   * LÉGITIME. Sept routines du catalogue tournent à ce niveau — brief du matin,
   * préparation de rendez-vous, récap hebdo, prévision, checklist, lancement du
   * lundi, contrôle de santé des connecteurs. Ce sont des travaux internes et
   * bornés. Une garde qui exigerait un clic pour eux aurait « corrigé » le
   * défaut en supprimant la fonctionnalité.
   */
  it('les routines en automatique (borné N4, ou étendu N5 depuis le 11/10/2026) sont toujours là', () => {
    // #4016 L6 — `connector_health` est passée de N4 à N5 : le compte porte sur
    // les deux niveaux autonomes, pas sur N4 seul.
    const autonomous = ROUTINE_CATALOG.filter(
      routine => routine.automationLevel === 'n4_bounded_auto' || routine.automationLevel === 'n5_extended_auto',
    )
    expect(autonomous.length).toBeGreaterThanOrEqual(7)
  })

  it('un pas interne, réversible et gratuit obtient l’automatisme demandé', () => {
    // #4016 L6 — « interne » exclut désormais l'écriture dans l'outil du client :
    // une note CRM garde son go (bloc suivant).
    const internal = EVERY_STEP.filter(
      ({ step }) =>
        !reachesOutsideProduct(step.intentType) &&
        !writesIntoClientTool(step.intentType) &&
        step.risk !== 'irreversible' &&
        step.estimatedCredits === 0 &&
        !step.sensitiveFamily,
    )
    expect(internal.length).toBeGreaterThanOrEqual(1)
    for (const { step } of internal) {
      expect(levelForStep(step, settingsAt('n4_bounded_auto'))).toBe('n4_bounded_auto')
    }
  })

  it('#4016 L6 — une écriture dans le CRM du client demande un go à TOUS les niveaux, N5 compris', () => {
    // « Pour le CRM faut quand même un go du user » (Louis 11/10/2026). Le
    // catalogue réel est balayé : chaque pas qui écrit chez le client, à chaque
    // niveau, doit atterrir chez quelqu'un.
    const crmWrites = EVERY_STEP.filter(({ step }) => writesIntoClientTool(step.intentType))
    expect(crmWrites.length).toBeGreaterThanOrEqual(1)
    for (const { step } of crmWrites) {
      for (const level of EVERY_LEVEL) {
        expect(LEVELS_THAT_ASK_A_HUMAN).toContain(levelForStep(step, settingsAt(level)))
      }
    }
  })

  it('« Compte dormant » part encore seul quand l’espace l’a demandé', () => {
    const definition = WORKFLOW_CATALOG.find(d => d.key === 'dormant_account_revival')
    expect(definition).toBeDefined()
    const decision = decideApproval({
      steps: definition?.steps ?? [],
      workflowMinimum: definition?.minimumLevel ?? 'n2_user_approval',
      targetCount: 1,
      estimatedCredits: 0,
      settings: settingsAt('n4_bounded_auto'),
    })
    expect(demandsAHuman(decision.requiredLevel)).toBe(false)
  })
})

/**
 * #1931 L2 — les cinq intents des cartes de Laura, et les deux moitiés de la
 * doctrine « une écriture passe par une porte » :
 *   geste d'UTILISATEUR = auto-approuvé (le clic EST la décision) ;
 *   geste de SYSTÈME = demande visible, prévisualisation FIGÉE, expiration 3 jours.
 */
const CARD_INTENTS = [
  'generate_message',
  'create_mail_draft',
  'update_routine',
  'update_setting',
  'pin_memory_fact',
] as const
const CARD_ACTIONS = [
  'enrich_contact',
  'schedule_reminder',
  'export_contact_to_crm',
  'prepare_message',
  'prepare_mail_draft',
  'toggle_routine',
  'update_setting',
  'pin_memory_fact',
] as const

describe('GA-239 — L2 : les cinq intents des cartes de Laura', () => {
  it('les cinq sont des types d’intent déclarés (la table de portée les classe)', () => {
    for (const type of CARD_INTENTS) expect(actionIntentTypeSchema.options).toContain(type)
  })

  it('les cinq sont INTERNES — aucun ne sollicite quelqu’un d’autre que son auteur', () => {
    // `create_mail_draft` en tête : un brouillon dans une boîte PERSONNELLE ne
    // part chez personne. Qu'il ne puisse pas partir est prouvé par
    // `card-effect-ports.spec.ts` (le port n'a aucune méthode d'envoi).
    for (const type of CARD_INTENTS) expect(reachesOutsideProduct(type)).toBe(false)
  })

  it('les huit cartes d’action ont une définition lue ici — la garde balaie un corpus non vide', () => {
    const definitions = CARD_ACTIONS.map(action => cardDefinitionForKey(`card_${action}`))
    expect(definitions.every(Boolean)).toBe(true)
    expect(definitions.flatMap(definition => definition?.steps ?? [])).toHaveLength(CARD_ACTIONS.length)
  })

  it.each(EVERY_LEVEL)('à %s, un pas de carte qui SORTIRAIT du produit exigerait quelqu’un', level => {
    for (const action of CARD_ACTIONS) {
      for (const step of cardDefinitionForKey(`card_${action}`)?.steps ?? []) {
        if (reachesOutsideProduct(step.intentType) || step.risk === 'irreversible') {
          expect(LEVELS_THAT_ASK_A_HUMAN).toContain(levelForStep(step, settingsAt(level)))
        }
      }
    }
  })
})

/**
 * ⚠️ 11/10/2026 — #4016 L5 (décision Louis : « tout ok mais faut un go vérifié
 * avant »). Le récapitulatif de rendez-vous (`meeting_follow_up`) et l'envoi de
 * Laura PEUVENT partir sans clic — mais SEULEMENT sous un mandat signé de leur
 * portée, par le dispatcher outreach (`gateAwaitingMandate`). Le barème d'Action
 * OS n'est PAS ce chemin, et ne le devient pas : aucun niveau d'automatisation,
 * aucun seuil ne remplace le mandat. Ce bloc garde les deux moitiés.
 */
describe('GA-239 — #4016 L5 : le mandat, jamais un réglage, ouvre l’envoi sans clic', () => {
  const NOW = new Date(2026, 9, 7, 10)
  const SIGNED = new Date(2026, 9, 6, 8).toISOString()
  const step = {
    kind: 'email',
    channel: 'email',
    contact_id: 'c',
    content_hash: 'h',
    sender_mailbox_id: 'm',
    scope: 'meeting_follow_up' as const,
    originated_at: new Date(2026, 9, 7, 9).toISOString(),
  }
  const contact = { replied: false, opposed: false, excluded: false }
  const capabilities = { mailbox_connected: true, reply_reading_available: true }
  const followUpMandate = {
    id: 'm',
    workspace_id: 'ws',
    scope: 'meeting_follow_up' as const,
    campaign_label: 'Suivi de rendez-vous',
    contact_ids: [],
    channels: ['email' as const],
    sender_mailbox_id: 'm',
    content_hash: null,
    window: { start_hour: 8, end_hour: 19 },
    starts_at: SIGNED,
    expires_at: new Date(2026, 9, 20).toISOString(),
    max_messages: 10,
    sent_count: 0,
    validated_by: ['u'],
    validated_at: SIGNED,
    revoked_at: null,
    paused_at: null,
  }

  it.each(EVERY_LEVEL)(
    'à %s, le barème garde `send_recap` sous un humain — le niveau ne remplace pas le mandat',
    level => {
      const recap = EVERY_STEP.find(({ step: s }) => s.key === 'send_recap')?.step
      expect(recap).toBeDefined()
      if (recap) expect(LEVELS_THAT_ASK_A_HUMAN).toContain(levelForStep(recap, settingsAt(level)))
    },
  )

  it('le suivi de rendez-vous part SOUS mandat signé de sa portée', () => {
    expect(delegationVerdict({ now: NOW, delegation: followUpMandate, step, contact, capabilities })).toEqual({
      decision: 'run',
      basis: 'delegation',
    })
  })

  it('sait dire NON — sans mandat, ou mandat révoqué, ou d’une autre portée : il attend', () => {
    const verdicts = [
      delegationVerdict({ now: NOW, delegation: null, step, contact, capabilities }),
      delegationVerdict({
        now: NOW,
        delegation: { ...followUpMandate, revoked_at: SIGNED },
        step,
        contact,
        capabilities,
      }),
      delegationVerdict({
        now: NOW,
        delegation: { ...followUpMandate, scope: 'laura_send' as const },
        step,
        contact,
        capabilities,
      }),
    ]
    expect(verdicts.map(v => v.decision)).toEqual(['awaits_validation', 'awaits_validation', 'awaits_validation'])
  })
})

describe('GA-239 — L2 : geste de SYSTÈME = demande visible ; geste d’UTILISATEUR = auto-approuvé', () => {
  it('un run lancé sur un pas qui SORT du produit ouvre une demande `pending`, résumé figé, expirant à 3 jours', async () => {
    const runs = createMockRepository<WorkflowRunEntity>()
    const approvals = createMockRepository<ApprovalRequestEntity>()
    const workspaces = createMockRepository<WorkspaceEntity>()
    runs.save.mockImplementation(async (entity: Partial<WorkflowRunEntity>) => ({ id: 'run-1', ...entity }))
    const dispatch = jest.fn()
    const runner = new WorkflowRunnerService(
      runs as never,
      approvals as never,
      workspaces as never,
      { dispatch } as never,
      { reserve: jest.fn(), settle: jest.fn(), sweepExpired: jest.fn() } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'owner' }),
        isDemoWorkspace: jest.fn().mockResolvedValue(false),
      } as never,
    )
    const definition = WORKFLOW_CATALOG.find(d => d.key === 'meeting_follow_up')
    expect(definition).toBeDefined()
    const before = Date.now()
    await runner.start({
      principal: { userId: 'u1', email: 'rep@esn.fr' },
      definitionKey: 'meeting_follow_up',
      idempotencyKey: 'system-run-1',
      context: {
        intents: Object.fromEntries((definition?.steps ?? []).map(s => [s.key, { type: 'notify_user', title: 'x' }])),
        targetLabel: 'ACME',
        targetCount: 1,
        availableCapabilities: new Set((definition?.steps ?? []).map(s => s.capability)),
      },
    })
    expect(dispatch).not.toHaveBeenCalled()
    const request = approvals.create.mock.calls[0]?.[0] as Partial<ApprovalRequestEntity>
    expect(request).toMatchObject({ state: 'pending', decided_by: null })
    expect(request.summary).toContain('ACME') // FIGÉ au moment de la demande
    const expiresIn = (request.expires_at as Date).getTime() - before
    expect(expiresIn).toBeGreaterThanOrEqual(APPROVAL_TTL_MS - 5_000)
    expect(expiresIn).toBeLessThanOrEqual(APPROVAL_TTL_MS + 5_000)
  })

  it('un CLIC sur une carte est la décision : approbation `approved` par son auteur, aucune demande en attente', async () => {
    const runs = inMemoryRepository<WorkflowRunEntity>()
    const approvals = inMemoryRepository<ApprovalRequestEntity>()
    const workspaces = inMemoryRepository<WorkspaceEntity>()
    workspaces.rows.push({ id: 'ws-1' } as WorkspaceEntity)
    const dispatch = jest.fn().mockResolvedValue({ type: 'create_mail_draft', status: 'done', externalRef: 'd-1' })
    const reservations = { reserve: jest.fn(), settle: jest.fn(), sweepExpired: jest.fn() }
    const runner = new WorkflowRunnerService(
      runs as never,
      approvals as never,
      workspaces as never,
      { dispatch } as never,
      reservations as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: 'ws-1', role: 'sales' }),
        isDemoWorkspace: jest.fn().mockResolvedValue(false),
      } as never,
    )
    const cards = new CopilotCardService(
      runs as never,
      approvals as never,
      runner,
      reservations as never,
      inMemoryRepository() as never,
      inMemoryRepository() as never,
    )
    const proposed = await cards.propose({
      principal: { userId: 'u1', email: 'rep@esn.fr' },
      conversationId: 'conv-1',
      turnId: '33333333-3333-4333-8333-333333333333',
      proposalIndex: 0,
      action: { action: 'prepare_mail_draft', to: 'claire@acme.example', subject: 'Suite', body: 'Bonjour' },
    })
    await cards.confirm(proposed?.run.id as string, { userId: 'u1', email: 'rep@esn.fr' })
    expect(approvals.rows).toEqual([expect.objectContaining({ state: 'approved', decided_by: 'u1' })])
    expect(approvals.rows.some(row => row.state === 'pending')).toBe(false)
    expect(dispatch.mock.calls[0]?.[1]).toMatchObject({ origin: 'user' })
  })
})
