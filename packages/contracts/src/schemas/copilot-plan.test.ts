/**
 * #1950.14 / #1950.18 / #1950.20 / #1950.22 — LE PLAN DE LAURA, AU NIVEAU DU PLAN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #1950.14 REVIENT SUR 1950.3, DÉLIBÉRÉMENT (décision Louis 19/09/2026, QCM « TOUT LIVRER »)
 * ─────────────────────────────────────────────────────────────────────────────
 * 1950.3 (12/09) disait : « aucune exécution enchaînée, aucun nouvel état, aucune
 * dépendance » — le rang d'une carte était un ORDRE SUGGÉRÉ, et chaque étape
 * partait sur son propre clic. Ce fichier prouve le renversement :
 *  - un geste unique lance les étapes du plan dans l'ordre (#1950.14), ou la
 *    seule première (#1950.18) ;
 *  - chaque étape a un état AU NIVEAU DU PLAN (#1950.20) ;
 *  - une étape dont le prérequis DÉCLARÉ a échoué est bloquée (#1950.22).
 *
 * CE QUI TIENT ENCORE, et que ces tests gardent :
 *  - « le copilote n'envoie jamais d'e-mail » et « une écriture CRM/ERP passe par
 *    une porte » : le geste de plan n'enchaîne que ce qui PRÉPARE ou CRÉE dans
 *    Bellum ; ce qui écrirait dehors reste sur sa porte (sa propre carte) ;
 *  - une dépendance n'est JAMAIS devinée depuis le rang : sans `depends_on`
 *    déclaré, rien n'est bloqué ;
 *  - un timeout est `unknown`, jamais un échec : il arrête la reprise du plan.
 */
import { describe, expect, it } from 'vitest'

import {
  PENDING_CHAT_ACTION_TYPES,
  pendingChatActionSchema,
  type CopilotCardState,
  type PendingChatAction,
} from './copilot-card.js'
import {
  PLAN_STEP_REACH,
  planHorizonOf,
  planLaunchPreview,
  planNextLaunch,
  planStepReachOf,
  planStepStatusOf,
  planStepsOf,
  runCopilotPlanRequestSchema,
  type PlanStepInput,
} from './copilot-plan.js'

const enrich = (depends_on?: number[]): PendingChatAction => ({
  action: 'enrich_contact',
  contact_id: 'c-1',
  contact_name: 'Claire Dubois',
  organization_name: 'Acme',
  ...(depends_on ? { depends_on } : {}),
})
const message = (depends_on?: number[]): PendingChatAction => ({
  action: 'prepare_message',
  contact_id: 'c-1',
  channel: 'email',
  ...(depends_on ? { depends_on } : {}),
})
const crm = (depends_on?: number[]): PendingChatAction => ({
  action: 'export_contact_to_crm',
  contact_id: 'c-1',
  contact_name: 'Claire Dubois',
  provider: 'hubspot',
  ...(depends_on ? { depends_on } : {}),
})

function step(rank: number, state: CopilotCardState, action: PendingChatAction | null): PlanStepInput {
  const confirmable = state === 'prepared' || state === 'snoozed'
  return {
    id: `run-${rank}`,
    proposalIndex: rank,
    state,
    action,
    allowedGestures: confirmable ? ['confirm', 'reject', 'snooze', 'modify'] : state === 'failed' ? ['retry'] : [],
  }
}

describe('#1950.20 — chaque étape a un état au niveau du PLAN', () => {
  it('les treize états de carte se rangent sous sept états de plan', () => {
    expect(planStepStatusOf('suggested')).toBe('todo')
    expect(planStepStatusOf('prepared')).toBe('todo')
    expect(planStepStatusOf('snoozed')).toBe('todo')
    expect(planStepStatusOf('awaiting_review')).toBe('running')
    expect(planStepStatusOf('running')).toBe('running')
    expect(planStepStatusOf('executed')).toBe('done')
    expect(planStepStatusOf('partial')).toBe('done')
    expect(planStepStatusOf('failed')).toBe('failed')
    expect(planStepStatusOf('blocked')).toBe('blocked')
    expect(planStepStatusOf('rejected')).toBe('dropped')
    expect(planStepStatusOf('expired')).toBe('dropped')
    expect(planStepStatusOf('superseded')).toBe('dropped')
  })

  it('un timeout est `unknown`, JAMAIS un échec', () => {
    expect(planStepStatusOf('unknown_outcome')).toBe('unknown')
    expect(planStepStatusOf('unknown_outcome')).not.toBe('failed')
  })
})

describe('#1950.22 — une étape dépendante est bloquée si son prérequis DÉCLARÉ a échoué', () => {
  it('le champ `depends_on` traverse le contrat (il n’est pas retiré à la validation)', () => {
    const parsed = pendingChatActionSchema.parse(message([0]))
    expect(parsed.depends_on).toEqual([0])
  })

  it('prérequis échoué → la dépendante est bloquée, et dit PAR QUI', () => {
    const views = planStepsOf([step(0, 'failed', enrich()), step(1, 'prepared', message([0]))])
    expect(views[1]).toMatchObject({ status: 'blocked', blockedBy: { rank: 0, cause: 'failed' } })
  })

  it('SANS dépendance déclarée, rien n’est bloqué — même derrière une étape échouée (jamais devinée depuis le rang)', () => {
    const views = planStepsOf([step(0, 'failed', enrich()), step(1, 'prepared', message())])
    expect(views[1]).toMatchObject({ status: 'todo', blockedBy: null })
  })

  it('le blocage se propage : dépendante d’une étape bloquée', () => {
    const views = planStepsOf([
      step(0, 'failed', enrich()),
      step(1, 'prepared', message([0])),
      step(2, 'prepared', crm([1])),
    ])
    expect(views[2]).toMatchObject({ status: 'blocked', blockedBy: { rank: 1, cause: 'blocked' } })
  })

  it('prérequis au résultat INCONNU → la dépendante ne part pas, sans être dite « échouée »', () => {
    const views = planStepsOf([step(0, 'unknown_outcome', enrich()), step(1, 'prepared', message([0]))])
    expect(views[1]).toMatchObject({ status: 'blocked', blockedBy: { rank: 0, cause: 'unknown' } })
  })

  it('une étape déjà faite n’est jamais « bloquée » après coup', () => {
    const views = planStepsOf([step(0, 'failed', enrich()), step(1, 'executed', message([0]))])
    expect(views[1]).toMatchObject({ status: 'done', blockedBy: null })
  })

  it('un prérequis encore à faire fait ATTENDRE, il ne bloque pas', () => {
    const views = planStepsOf([step(0, 'prepared', enrich()), step(1, 'prepared', message([0]))])
    expect(views[1]).toMatchObject({ status: 'todo', blockedBy: null, waitingOn: [0] })
  })

  it('une dépendance circulaire ne boucle pas', () => {
    const views = planStepsOf([step(0, 'prepared', enrich([1])), step(1, 'prepared', message([0]))])
    expect(views.map(view => view.status)).toEqual(['todo', 'todo'])
  })
})

describe('#1950.14 — ce que « Lancer tout le plan » enchaîne', () => {
  it('la table de portée est EXHAUSTIVE sur les propositions de Laura', () => {
    expect(Object.keys(PLAN_STEP_REACH).sort()).toEqual([...PENDING_CHAT_ACTION_TYPES].sort())
  })

  it('seul ce qui prépare ou crée DANS Bellum s’enchaîne ; CRM, messagerie, agenda restent sur leur porte', () => {
    const chained = Object.entries(PLAN_STEP_REACH)
      .filter(([, reach]) => reach === 'bellum')
      .map(([type]) => type)
      .sort()
    expect(chained).toEqual(
      [
        // Épopée #2781 (#2150.30, LOT j1 26/09) — attribue le compte dans
        // Bellum, même route que l'écran.
        'add_account_to_portfolio',
        'create_contact_from_crm',
        // Épopée #2853 (#2157.1) — crée une liste dans Bellum, même route que l'écran.
        'create_target_list_from_account',
        'enrich_contact',
        'pin_memory_fact',
        'prepare_message',
        // #2423.9 — enregistre un avenant `proposé` dans Bellum, même route que l'écran.
        'propose_mission_amendment',
        // #2324.39 — met à jour une opportunité de Bellum, même PATCH que l'écran.
        'propose_opportunity_update',
        // #2320.26/.27 (épopée #2967) — change le statut d'un besoin de Bellum,
        // même PATCH que l'écran.
        'propose_need_transition',
        // #2987.56 — décide (valide/refuse) une note de frais de Bellum,
        // même route que l'écran.
        'decide_expense_report',
        'start_account_analysis',
      ].sort(),
    )
    expect(PLAN_STEP_REACH.export_contact_to_crm).toBe('outside')
    expect(PLAN_STEP_REACH.prepare_mail_draft).toBe('outside')
    expect(PLAN_STEP_REACH.schedule_reminder).toBe('outside')
  })

  it('un message qui ENVERRAIT sort de Bellum : il ne s’enchaîne pas', () => {
    expect(planStepReachOf({ action: 'prepare_message', contact_id: 'c-1', channel: 'email', sends_email: true })).toBe(
      'outside',
    )
    expect(planStepReachOf(message())).toBe('bellum')
  })

  it('lance dans l’ordre du rang, en sautant la porte externe sans s’y arrêter', () => {
    const steps = [step(0, 'prepared', enrich()), step(1, 'prepared', crm()), step(2, 'prepared', message())]
    expect(planNextLaunch(steps, 'all', new Set())).toBe('run-0')
    expect(planNextLaunch(steps, 'all', new Set(['run-0']))).toBe('run-2')
    expect(planNextLaunch(steps, 'all', new Set(['run-0', 'run-2']))).toBeNull()
  })

  it('une dépendante attend que son prérequis soit FAIT, puis part', () => {
    const waiting = [step(0, 'prepared', message([1])), step(1, 'prepared', enrich())]
    expect(planNextLaunch(waiting, 'all', new Set())).toBe('run-1')
    const unlocked = [step(0, 'prepared', message([1])), step(1, 'executed', enrich())]
    expect(planNextLaunch(unlocked, 'all', new Set(['run-1']))).toBe('run-0')
  })

  it('un prérequis ÉCHOUÉ arrête sa dépendante, pas le reste du plan', () => {
    const steps = [step(0, 'failed', enrich()), step(1, 'prepared', message([0])), step(2, 'prepared', message())]
    expect(planNextLaunch(steps, 'all', new Set(['run-0']))).toBe('run-2')
  })

  it('un résultat INCONNU arrête la reprise du plan entier', () => {
    const steps = [step(0, 'unknown_outcome', enrich()), step(1, 'prepared', message())]
    expect(planNextLaunch(steps, 'all', new Set())).toBeNull()
  })

  it('une carte sans prévisualisation (`suggested`) ne se lance pas : personne ne valide ce qu’on ne lui a pas montré', () => {
    expect(planNextLaunch([step(0, 'suggested', enrich())], 'all', new Set())).toBeNull()
  })
})

describe('ce que l’écran annonce AVANT le clic (le coût total est annoncé avant dépense)', () => {
  it('liste ce que le geste lancerait si chaque étape réussissait — dépendantes comprises, porte externe exclue', () => {
    const steps = [step(0, 'prepared', enrich()), step(1, 'prepared', crm()), step(2, 'prepared', message([0]))]
    expect(planLaunchPreview(steps, 'all')).toEqual(['run-0', 'run-2'])
    expect(planLaunchPreview(steps, 'first')).toEqual(['run-0'])
  })

  it('rien à annoncer quand rien ne partirait', () => {
    expect(planLaunchPreview([step(0, 'executed', enrich()), step(1, 'prepared', crm())], 'all')).toEqual([])
  })
})

describe('#1950.18 — exécuter uniquement la 1re étape', () => {
  it('lance la première étape À FAIRE, et elle seule', () => {
    const steps = [step(0, 'prepared', enrich()), step(1, 'prepared', message())]
    expect(planNextLaunch(steps, 'first', new Set())).toBe('run-0')
    expect(planNextLaunch(steps, 'first', new Set(['run-0']))).toBeNull()
  })

  it('la première étape à faire écrit dehors : rien ne part, elle reste sur sa porte', () => {
    const steps = [step(0, 'prepared', crm()), step(1, 'prepared', message())]
    expect(planNextLaunch(steps, 'first', new Set())).toBeNull()
  })

  it('le corps de la requête ne connaît que les deux gestes', () => {
    expect(runCopilotPlanRequestSchema.parse({ mode: 'all' })).toEqual({ mode: 'all' })
    expect(runCopilotPlanRequestSchema.parse({ mode: 'first' })).toEqual({ mode: 'first' })
    expect(runCopilotPlanRequestSchema.safeParse({ mode: 'everything' }).success).toBe(false)
    expect(runCopilotPlanRequestSchema.safeParse({ mode: 'all', extra: 1 }).success).toBe(false)
  })
})

/**
 * #1950.10 — « durée estimée » : reformulé (doctrine « jamais de donnée
 * fictive », « on n'affiche pas ce qu'on n'a pas »). Une durée devinée par le
 * modèle n'est pas mesurée ; ce que le plan PORTE, c'est la date de ses étapes
 * datées. L'horizon est la plus lointaine — sinon rien, jamais une estimation.
 */
describe('#1950.10 — l’horizon du plan se lit sur ses étapes datées', () => {
  const reminder = (at: string): PendingChatAction =>
    pendingChatActionSchema.parse({ action: 'schedule_reminder', contact_id: 'c-1', at })

  it('rend la date la plus lointaine des rappels du plan', () => {
    expect(planHorizonOf([reminder('2026-09-26T09:00:00Z'), null, reminder('2026-10-02T09:00:00Z')])).toBe(
      '2026-10-02T09:00:00Z',
    )
  })

  it('ne rend RIEN quand aucune étape n’est datée — jamais une durée estimée', () => {
    expect(planHorizonOf([null])).toBeNull()
    expect(planHorizonOf([])).toBeNull()
  })

  it('ignore une date illisible plutôt que de la deviner', () => {
    expect(planHorizonOf([reminder('demain matin')])).toBeNull()
  })
})
