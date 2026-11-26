import { z } from 'zod'
import type { CardGesture, CopilotCardState, PendingChatAction } from './copilot-card.js'

/**
 * #1950.14 / #1950.18 / #1950.20 / #1950.22 — LE PLAN DE LAURA, LU AU NIVEAU DU PLAN.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE FICHIER RENVERSE, ET POURQUOI
 * ─────────────────────────────────────────────────────────────────────────────
 * 1950.3 (12/09/2026) : « aucune exécution enchaînée, aucun nouvel état, aucune
 * dépendance — ces trois-là attendent la migration Action OS, où vivront les
 * cartes gouvernées » (`PlanRecap.tsx`). Les cartes gouvernées existent
 * (`workflow_runs`, état persisté), et Louis a tranché le 19/09 : TOUT LIVRER.
 * Un plan = les cartes d'UNE réponse de Laura, dans l'ordre de leur rang
 * (`proposalIndex`). Ce fichier est la SEULE lecture de ce plan (GA-26) :
 * l'API l'appelle pour enchaîner (`CopilotCardService.runPlan`) et pour refuser
 * le clic d'une étape bloquée ; l'écran l'appelle pour dire l'état de chaque
 * étape et quels gestes de plan il offre. Deux dérivations diverger-aient.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI TIENT ENCORE
 * ─────────────────────────────────────────────────────────────────────────────
 *  - « Le copilote n'envoie jamais d'e-mail » et « une écriture CRM/ERP passe par
 *    une porte » : le geste de plan n'enchaîne QUE ce qui prépare ou crée dans
 *    Bellum ({@link PLAN_STEP_REACH}). Ce qui écrirait dehors reste sur sa porte
 *    habituelle — sa carte, sa prévisualisation, son clic.
 *  - Une dépendance est DÉCLARÉE (`depends_on`), jamais devinée depuis le rang.
 *  - Un timeout est `unknown`, jamais un échec — et il arrête la reprise.
 *
 * L'état d'une étape n'est PAS une nouvelle colonne : il se DÉRIVE de l'état de
 * la carte, déjà persisté (`workflow_runs`). Le plan survit donc à la fermeture
 * de la page sans deuxième vérité à tenir (#1950 : « le plan ne devient pas une
 * deuxième vérité dans la conversation »).
 */

// ── #1950.20 — l'état d'une étape, au niveau du plan ────────────────────────

/**
 * Les états d'une étape. Les cinq de la décision (à faire / en cours / faite /
 * échouée / bloquée), plus deux que la doctrine impose de ne pas replier :
 *  - `unknown` — un timeout n'est pas un échec (il arrête la reprise) ;
 *  - `dropped` — refusée, expirée ou remplacée : elle ne partira pas, sans
 *    avoir échoué ni être faite.
 */
export const planStepStatusSchema = z.enum(['todo', 'running', 'done', 'failed', 'blocked', 'unknown', 'dropped'])
export type PlanStepStatus = z.infer<typeof planStepStatusSchema>

/** L'état de PLAN d'une carte, par son seul état de carte. Exhaustif (`never`). */
export function planStepStatusOf(state: CopilotCardState): PlanStepStatus {
  switch (state) {
    case 'suggested':
    case 'prepared':
    case 'snoozed':
      return 'todo'
    // Le clic a eu lieu, un responsable tranche : lancée, pas finie.
    case 'awaiting_review':
    case 'running':
      return 'running'
    // Une exécution partielle a produit quelque chose : ce qui en dépend peut suivre.
    // La carte, elle, continue de dire « Partielle ».
    case 'executed':
    case 'partial':
      return 'done'
    case 'failed':
      return 'failed'
    case 'blocked':
      return 'blocked'
    case 'unknown_outcome':
      return 'unknown'
    case 'rejected':
    case 'expired':
    case 'superseded':
      return 'dropped'
    default: {
      const exhaustive: never = state
      throw new Error(`planStepStatusOf: unhandled CopilotCardState ${String(exhaustive)}`)
    }
  }
}

// ── #1950.14 — ce qu'une étape touche, donc ce qui s'enchaîne ───────────────

/**
 * Ce qu'une étape touche :
 *  - `bellum` — elle prépare ou crée DANS Bellum : le geste de plan l'enchaîne ;
 *  - `outside` — elle écrirait dehors (CRM, messagerie, agenda) : elle reste
 *    sur sa porte, sa propre carte ;
 *  - `screen` — elle ouvre un écran : il n'y a rien à enchaîner ;
 *  - `setting` — elle change un réglage : un réglage se change par un geste qui
 *    le NOMME, jamais au passage d'un plan.
 */
export type PlanStepReach = 'bellum' | 'outside' | 'screen' | 'setting'

/**
 * Exhaustif : une proposition AJOUTÉE au contrat fait tomber la compilation ici,
 * au lieu d'être enchaînée ou écartée par défaut.
 */
export const PLAN_STEP_REACH: Readonly<Record<PendingChatAction['action'], PlanStepReach>> = {
  prepare_message: 'bellum',
  // #3894.3 — l'audience se DÉCIDE destinataire par destinataire sur ses propres
  // cartes : le geste de plan n'enchaîne jamais N brouillons d'un coup.
  prepare_message_audience: 'screen',
  enrich_contact: 'bellum',
  pin_memory_fact: 'bellum',
  start_account_analysis: 'bellum',
  create_contact_from_crm: 'bellum',
  // Épopée #2853 (#2157.1) — le clic crée une liste dans Bellum
  // (`POST /target-lists` puis `.../items`) : aucun CRM/agenda/messagerie
  // touché, même raison que `create_contact_from_crm` juste au-dessus.
  create_target_list_from_account: 'bellum',
  // Épopée #2781 (#2150.30, LOT j1 26/09) — le clic attribue le compte dans
  // Bellum (`POST /accounts/portfolio`) : aucun CRM/agenda/messagerie touché,
  // même raison que `create_target_list_from_account` juste au-dessus.
  add_account_to_portfolio: 'bellum',
  // « Votre agenda, sinon le journal d'actions » (`copilot-card-catalog.ts`) :
  // quand un agenda est branché, le rappel s'y écrit — c'est dehors.
  schedule_reminder: 'outside',
  export_contact_to_crm: 'outside',
  prepare_mail_draft: 'outside',
  // G.1 — le clic écrit un événement dans l'agenda branché : c'est dehors.
  prepare_calendar_event: 'outside',
  find_accounts: 'screen',
  open_screen: 'screen',
  prepare_consultant_record: 'screen',
  // Épopée #2872 (#2367.6, LOT c5 clôture 26/09) — même famille : le clic
  // ouvre le panneau de matching, rien à enchaîner.
  push_profile: 'screen',
  prepare_campaign: 'screen',
  // #2322 — le besoin compilé se LIT sur la carte ; le clic ouvre le
  // créateur de besoin. Rien à enchaîner : la création est le geste suivant,
  // et c'est une personne qui le fait.
  compile_need: 'screen',
  // #2392 — la clôture de journée se DÉCIDE sur sa carte, tâche par tâche :
  // aucun geste de plan ne l'enchaîne (« tout reporter » est le NO-GO #2392.9).
  day_closure: 'screen',
  toggle_routine: 'setting',
  update_setting: 'setting',
  // #2423.9 — le clic ENREGISTRE l'avenant `proposé` dans Bellum (même route que
  // l'écran, `POST delivery/missions/:id/amendments`) : ce n'est ni une sortie
  // (aucun CRM/agenda/messagerie touché) ni une simple ouverture d'écran.
  propose_mission_amendment: 'bellum',
  // #2391 — le plan de journée se DÉCIDE sur sa carte : aucun geste de plan ne
  // l'enchaîne, même raison que `day_closure` juste au-dessus.
  propose_focus_plan: 'screen',
  // #2770.55-.62 — le plan de semaine se décide sur sa carte, comme celui de la journée.
  propose_weekly_plan: 'screen',
  // #2324.39 — l'opportunité vit dans Bellum : l'écriture reste chez nous.
  propose_opportunity_update: 'bellum',
  // #2376 — le brief d'appel se LIT sur sa carte (identité, branches, mode
  // live) : rien n'est créé dans Bellum, rien à enchaîner.
  prepare_cold_call: 'screen',
  // #2320.26/.27 (épopée #2967) — le besoin vit dans Bellum : l'écriture reste
  // chez nous, même raison que `propose_opportunity_update` juste au-dessus.
  propose_need_transition: 'bellum',
  // #2987.56 — la note de frais vit dans Bellum : l'écriture reste chez nous,
  // même raison que `propose_need_transition` juste au-dessus.
  decide_expense_report: 'bellum',
  // #3345.2 — écarter une piste est un geste à part, jamais enchaîné dans
  // « Lancer tout le plan » (un écartement en rafale n'est pas une décision
  // lue piste par piste) : même famille que `propose_long_job` plus bas.
  decide_qualification_lead: 'screen',
  // Épopée #2955 (#2394.6/.19/.43) — la note s'écrit sur la fiche existante
  // du CRM connecté : dehors, même raison qu'`export_contact_to_crm`.
  propose_crm_note: 'outside',
  // #1952.3 / #1952.7 (épopée #2844) — un travail LONG ne s'enchaîne pas dans
  // « Lancer tout le plan » : il part d'un clic à lui, et son avancement se suit
  // sur l'écran du besoin (même statut qu'`open_screen`, rien à enchaîner).
  propose_long_job: 'screen',
  // #2434.56 (épopée #3579) — une DÉPENSE en masse ne s'enchaîne jamais dans
  // « Lancer tout le plan » : elle part d'un clic à elle, qui lit le coût total.
  propose_bulk_enrichment: 'screen',
  // #3871.1 (lot V11, 07/10) — un passage en historique est une DÉCISION à
  // part, jamais enchaînée dans « Lancer tout le plan » : même famille que
  // `decide_qualification_lead` juste au-dessus.
  propose_contact_departure: 'screen',
  // #3950.1 (décision Louis 09/10/2026) — le lancement de l'export du vivier
  // part d'un clic à lui (comme `propose_long_job` plus haut), jamais enchaîné
  // dans « Lancer tout le plan » : il appelle directement `talents/export/ats`
  // ou `talents/export/bulk`, rien à préparer ni créer dans Bellum.
  launch_vivier_export: 'screen',
  // #3869.a (lot M05, 09/10) — une recherche de personnes est une DÉPENSE : elle
  // part d'un clic à elle, qui lit le coût, jamais enchaînée dans « Lancer tout le plan ».
  propose_people_search: 'screen',
  // #2433.7 (lot M10, 09/10) — le signalement préparé part d'un clic à lui,
  // jamais enchaîné dans « Lancer tout le plan » : il appelle `POST /feedback`,
  // la porte du formulaire de signalement — un envoi vers l'équipe, pas une
  // préparation dans Bellum.
  prepare_bug_report: 'screen',
}

/** La portée d'UNE proposition : la table, plus un message qui déclarerait qu'il ENVOIE. */
export function planStepReachOf(action: PendingChatAction): PlanStepReach {
  if (action.action === 'prepare_message' && action.sends_email === true) return 'outside'
  return PLAN_STEP_REACH[action.action]
}

// ── #1950.22 — la lecture du plan : qui est bloqué, qui attend ──────────────

/** Ce que le plan lit d'une étape — un sous-ensemble de la carte que l'API sert. */
export type PlanStepInput = {
  id: string
  proposalIndex: number | null
  state: CopilotCardState
  action: PendingChatAction | null
  allowedGestures: readonly CardGesture[]
}

/** Pourquoi une étape est bloquée : le RANG de son prérequis, et ce qui lui est arrivé. */
type PlanStepBlock = { rank: number; cause: 'failed' | 'blocked' | 'unknown' }

export type PlanStepView = {
  id: string
  rank: number | null
  status: PlanStepStatus
  /** Présent seulement quand un prérequis DÉCLARÉ a échoué, n'a pas pu partir, ou a un résultat inconnu. */
  blockedBy: PlanStepBlock | null
  /** Les prérequis déclarés qui ne sont pas encore faits — l'étape les attend, elle n'est pas bloquée. */
  waitingOn: number[]
  /** `null` quand la proposition n'est pas relisible. */
  reach: PlanStepReach | null
}

function declaredPrerequisites(step: PlanStepInput): number[] {
  const declared = step.action?.depends_on ?? []
  // Une étape ne dépend pas d'elle-même : la déclaration serait insatisfiable.
  return [...new Set(declared)].filter(rank => rank !== step.proposalIndex)
}

/**
 * Chaque étape avec son état de plan. Une étape À FAIRE dont un prérequis
 * déclaré a échoué (ou n'a pas pu partir, ou a un résultat inconnu) devient
 * `blocked` ; une étape déjà partie garde son état — le passé ne se réécrit pas.
 * Une dépendance vers un rang absent du plan (proposition de navigation, rang
 * hors de la réponse) n'est jamais satisfaite : l'étape l'ATTEND.
 */
export function planStepsOf(steps: readonly PlanStepInput[]): PlanStepView[] {
  const byRank = new Map<number, PlanStepInput>()
  for (const step of steps) if (step.proposalIndex !== null) byRank.set(step.proposalIndex, step)
  const resolved = new Map<string, PlanStepStatus>()

  function effectiveStatus(
    step: PlanStepInput,
    visiting: Set<string>,
  ): { status: PlanStepStatus; block: PlanStepBlock | null } {
    const own = planStepStatusOf(step.state)
    if (own !== 'todo') return { status: own, block: null }
    // Une dépendance circulaire ne bloque rien : aucun maillon n'a échoué.
    if (visiting.has(step.id)) return { status: own, block: null }
    visiting.add(step.id)
    for (const rank of declaredPrerequisites(step)) {
      const prerequisite = byRank.get(rank)
      if (!prerequisite) continue
      const cached = resolved.get(prerequisite.id)
      const status = cached ?? effectiveStatus(prerequisite, visiting).status
      if (status === 'failed' || status === 'blocked' || status === 'unknown') {
        visiting.delete(step.id)
        return { status: 'blocked', block: { rank, cause: status } }
      }
    }
    visiting.delete(step.id)
    return { status: own, block: null }
  }

  return [...steps]
    .sort(
      (left, right) =>
        (left.proposalIndex ?? Number.MAX_SAFE_INTEGER) - (right.proposalIndex ?? Number.MAX_SAFE_INTEGER),
    )
    .map(step => {
      const { status, block } = effectiveStatus(step, new Set())
      resolved.set(step.id, status)
      const waitingOn =
        status === 'todo'
          ? declaredPrerequisites(step).filter(rank => {
              const prerequisite = byRank.get(rank)
              return !prerequisite || planStepStatusOf(prerequisite.state) !== 'done'
            })
          : []
      return {
        id: step.id,
        rank: step.proposalIndex,
        status,
        blockedBy: block,
        waitingOn,
        reach: step.action ? planStepReachOf(step.action) : null,
      }
    })
}

// ── #1950.10 — l'horizon DATÉ du plan, jamais une durée estimée ─────────────

/**
 * #1950.10 — « durée estimée » est reformulé : une durée devinée par le modèle
 * serait une donnée non mesurée (doctrine « jamais de donnée fictive »). Ce que
 * le plan PORTE, ce sont les dates de ses étapes datées (un rappel programmé) ;
 * l'horizon est la plus lointaine. Aucune étape datée → `null`, et l'écran ne
 * rend aucune ligne. Une date illisible est ignorée, jamais devinée.
 */
export function planHorizonOf(actions: readonly (PendingChatAction | null)[]): string | null {
  let latest: { at: string; time: number } | null = null
  for (const action of actions) {
    if (action?.action !== 'schedule_reminder') continue
    const time = Date.parse(action.at)
    if (Number.isNaN(time)) continue
    if (!latest || time > latest.time) latest = { at: action.at, time }
  }
  return latest?.at ?? null
}

// ── #1950.14 / #1950.18 — les deux gestes de plan ───────────────────────────

/** `all` = « Lancer tout le plan » (#1950.14) ; `first` = « Seulement la 1re étape » (#1950.18). */
export const planLaunchModeSchema = z.enum(['all', 'first'])
export type PlanLaunchMode = z.infer<typeof planLaunchModeSchema>

/** Le corps de `POST action-os/cards/plan/:turnId/run`. */
export const runCopilotPlanRequestSchema = z.object({ mode: planLaunchModeSchema }).strict()

function launchable(view: PlanStepView, step: PlanStepInput | undefined, launched: ReadonlySet<string>): boolean {
  return (
    step !== undefined &&
    view.status === 'todo' &&
    // `confirm` est le geste que le SERVEUR offre : une carte `suggested` n'a pas
    // de prévisualisation, et personne ne valide ce qu'on ne lui a pas montré.
    step.allowedGestures.includes('confirm') &&
    view.reach === 'bellum' &&
    view.waitingOn.length === 0 &&
    !launched.has(view.id)
  )
}

/**
 * La PROCHAINE étape qu'un geste de plan lance, ou `null` quand il s'arrête.
 * Rappelée après chaque étape (l'API relit alors l'état servi) : c'est ce qui
 * fait qu'un échec bloque sa dépendante sans arrêter le reste du plan.
 *
 *  - `all` : la première étape lançable dans l'ordre du rang. Une étape qui
 *    écrit dehors est SAUTÉE — elle reste sur sa porte, elle n'arrête pas le
 *    plan : sans dépendance déclarée, rien d'autre ne l'attend.
 *  - `first` : la première étape À FAIRE, et elle seule ; si elle écrit dehors
 *    ou attend un prérequis, rien ne part.
 *  - Une étape au résultat INCONNU arrête la reprise du plan entier : on ne
 *    relance pas à côté de ce qui est peut-être déjà parti.
 *
 * `launched` = ce que CE geste a déjà lancé (garde contre une boucle si une
 * carte restait `todo` après son clic).
 */
export function planNextLaunch(
  steps: readonly PlanStepInput[],
  mode: PlanLaunchMode,
  launched: ReadonlySet<string>,
): string | null {
  const views = planStepsOf(steps)
  if (views.some(view => view.status === 'unknown')) return null
  const byId = new Map(steps.map(step => [step.id, step]))
  if (mode === 'first') {
    if (launched.size > 0) return null
    const first = views.find(view => view.status === 'todo')
    return first && launchable(first, byId.get(first.id), launched) ? first.id : null
  }
  return views.find(view => launchable(view, byId.get(view.id), launched))?.id ?? null
}

/**
 * Ce qu'un geste de plan LANCERAIT si chaque étape réussissait — la liste que
 * l'écran annonce, et dont il additionne le coût, AVANT le clic (#1950 : « le
 * coût total est annoncé avant dépense »). Une borne haute, jamais une
 * promesse : un échec en route bloque sa dépendante déclarée, qui ne sera alors
 * ni lancée ni débitée. Même fonction que le serveur (`planNextLaunch`) : l'écran
 * n'annonce jamais une étape que le serveur ne lancerait pas.
 */
export function planLaunchPreview(steps: readonly PlanStepInput[], mode: PlanLaunchMode): string[] {
  let simulated = [...steps]
  const launched = new Set<string>()
  for (let attempt = 0; attempt < steps.length; attempt += 1) {
    const next = planNextLaunch(simulated, mode, launched)
    if (!next) break
    launched.add(next)
    simulated = simulated.map(step => (step.id === next ? { ...step, state: 'executed' as const } : step))
  }
  return [...launched]
}
