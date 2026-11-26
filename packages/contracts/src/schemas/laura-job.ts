import { z } from 'zod'

import { creditCostOf, type CreditedAction } from '../billing/credit-weights.js'
import type { WorkflowRunStatus } from './action-os.js'
import { planStepStatusSchema } from './copilot-plan.js'

/**
 * #2276 — LE JOB COMPOSITE DE LAURA : une demande complexe, multi-capacités,
 * devient UN objet persistant au lieu d'une boucle courte qui simule le travail
 * dans une seule réponse texte (#2276.1, #2276.2).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * OÙ IL VIT — et pourquoi pas une table neuve
 * ─────────────────────────────────────────────────────────────────────────────
 * Un job est une ligne `workflow_runs` (`definition_key = 'laura_job'`,
 * `trigger = 'laura_job'`), dont la colonne `job jsonb` porte la FICHE ci-dessous.
 * La ligne porte déjà, et une table neuve les aurait dupliqués (GA-26) :
 * l'owner (`user_id`, #2276.19), la conversation d'origine (`conversation_id` /
 * `turn_id`, #2276.20), les coûts estimés et débités (#2276.12), les dates de
 * début et de fin (#2276.13), l'idempotence par espace, et neuf des dix états
 * (#2276.24-.31). Deux statuts sont ajoutés EN FIN de `workflowRunStatusSchema` :
 * `draft` et `to_confirm`.
 *
 * Ce qui ne se distingue PAS d'une carte de conversation (`copilot-plan.ts`) : une
 * carte est UN geste, un plan est au plus trois cartes d'une réponse. Un job
 * couvre une demande entière — vingt filiales, cinquante décideurs — en étapes
 * dépendantes, sur une seule fiche.
 *
 * Doctrine tenue ici :
 *  - Laura PRÉPARE : créer un job n'exécute rien et ne débite rien ;
 *  - rien de payant sans coût annoncé : chaque capacité tire son coût de la
 *    grille unique, le job pose `to_confirm` et n'avance qu'au clic ;
 *    une fiche sans périmètre qui suppose quelque chose reste `draft`
 *    ({@link lauraJobInitialStatus}) ;
 *  - une écriture hors Bellum (CRM) exige TOUJOURS une validation, quoi que dise
 *    le modèle ({@link LAURA_JOB_CAPABILITIES}) ;
 *  - un timeout n'est pas un échec : `unknown` ARRÊTE la reprise ({@link lauraJobResumeOf}) ;
 *  - « non estimé » n'est jamais « 0 » : un coût inconnu est `null`.
 */

/** La clé de définition ET le déclencheur d'un job — une seule constante (GA-26). */
export const LAURA_JOB_DEFINITION_KEY = 'laura_job'

// ── #2276.11 — les capacités qu'une étape mobilise ──────────────────────────

/**
 * Une capacité = ce qu'une étape FAIT, avec son coût tiré de la grille unique
 * (`credit-weights.ts`) — jamais un chiffre recopié, jamais un coût choisi par le
 * modèle. `credited: null` = gratuite par construction (lecture), `writesOutside`
 * = écrit dans un outil du client, donc validation forcée.
 */
export const lauraJobCapabilitySchema = z.enum([
  'read_workspace',
  'search_market_memory',
  'account_analysis',
  'account_refresh',
  'contact_enrichment',
  'message_generation',
  'need_matching',
  'territory_snapshot',
  'crm_write',
])
export type LauraJobCapability = z.infer<typeof lauraJobCapabilitySchema>

/**
 * #2276.46 / .47 / .51 — ce que la prévisualisation lit d'une capacité, au même
 * endroit que son coût (GA-26) :
 *  - `reusesData` : elle RELIT des données déjà dans l'espace (rien de neuf) ;
 *  - `executableInJob` : l'exécuteur (`LauraJobExecutor`) sait la faire partir
 *    dans un job — sinon l'étape sera `not_executable_in_job`, et la
 *    prévisualisation le dit AVANT le clic ;
 *  - `targetsContacts` : elle s'applique aux contacts du périmètre, au plus
 *    `units` d'entre eux (c'est ce que le coût confirmé couvre).
 */
type LauraJobCapabilityEntry = {
  credited: CreditedAction | null
  writesOutside: boolean
  reusesData: boolean
  executableInJob: boolean
  targetsContacts: boolean
  /**
   * #3860.1 — elle s'applique aux COMPTES du périmètre (au plus `units`) :
   * l'analyse et l'actualisation d'un dossier.
   */
  targetsAccounts: boolean
  /**
   * #3860.1 — le FILTRE qu'elle exige, par étape : au moins un de ces champs de
   * `criteria`. Vide = aucun filtre requis. Une recherche sans filtre balaierait
   * tout le corpus partagé (mémoire marché) ou n'aurait pas d'objet (besoin,
   * territoire) — l'étape est alors bloquée, et la prévisualisation le dit.
   */
  criteriaKeys: readonly LauraJobCriterion[]
  /**
   * #3860.2 — elle PRODUIT des contacts (ceux que l'analyse a trouvés sur les
   * comptes traités), qui deviennent les cibles des étapes suivantes.
   */
  producesContacts: boolean
}

const NONE = { targetsAccounts: false, criteriaKeys: [], producesContacts: false } as const

/**
 * #3860.1 (lot M06) — les cinq capacités jusqu'ici `executableInJob: false`
 * partent désormais dans un job, chacune avec ce qu'elle exige :
 *  - `search_market_memory` / `need_matching` / `territory_snapshot` : un FILTRE
 *    par étape (`criteriaKeys`), sinon l'étape est bloquée (`missing_criteria`) ;
 *  - `account_analysis` / `account_refresh` : les comptes du périmètre, et
 *    l'ATTENTE de leur analyse asynchrone (`awaiting`), dont les contacts
 *    trouvés alimentent les étapes suivantes (#3860.2).
 */
export const LAURA_JOB_CAPABILITIES: Readonly<Record<LauraJobCapability, LauraJobCapabilityEntry>> = {
  read_workspace: {
    credited: null,
    writesOutside: false,
    reusesData: true,
    executableInJob: true,
    targetsContacts: false,
    ...NONE,
  },
  search_market_memory: {
    credited: null,
    writesOutside: false,
    reusesData: true,
    executableInJob: true,
    targetsContacts: false,
    ...NONE,
    criteriaKeys: ['technology', 'location', 'region', 'department'],
  },
  account_analysis: {
    credited: 'account_analysis',
    writesOutside: false,
    reusesData: false,
    executableInJob: true,
    targetsContacts: false,
    ...NONE,
    targetsAccounts: true,
    producesContacts: true,
  },
  account_refresh: {
    credited: 'account_refresh',
    writesOutside: false,
    reusesData: false,
    executableInJob: true,
    targetsContacts: false,
    ...NONE,
    targetsAccounts: true,
    producesContacts: true,
  },
  contact_enrichment: {
    credited: 'contact_enrichment',
    writesOutside: false,
    reusesData: false,
    executableInJob: true,
    targetsContacts: true,
    ...NONE,
  },
  // Prépare un message : Laura n'envoie jamais (doctrine).
  message_generation: {
    credited: 'message_generation',
    writesOutside: false,
    reusesData: false,
    executableInJob: true,
    targetsContacts: true,
    ...NONE,
  },
  need_matching: {
    credited: 'need_matching',
    writesOutside: false,
    reusesData: false,
    executableInJob: true,
    targetsContacts: false,
    ...NONE,
    criteriaKeys: ['needId'],
  },
  // #3860.1 — lit la DERNIÈRE photo hebdomadaire du département (la veille la
  // prend chaque lundi) : jamais une collecte à la demande, la date est nommée.
  territory_snapshot: {
    credited: 'territory_snapshot',
    writesOutside: false,
    reusesData: false,
    executableInJob: true,
    targetsContacts: false,
    ...NONE,
    criteriaKeys: ['department'],
  },
  crm_write: {
    credited: null,
    writesOutside: true,
    reusesData: false,
    executableInJob: true,
    targetsContacts: true,
    ...NONE,
  },
}

/**
 * #2276.51 — les PLAFONDS d'une fiche, une seule source : le schéma les
 * applique, la prévisualisation les montre (jamais un chiffre recopié côté web).
 */
export const LAURA_JOB_LIMITS = {
  maxSteps: 20,
  maxUnitsPerStep: 500,
  maxAccounts: 200,
  maxContacts: 500,
  /**
   * #3860.1 — combien de temps une étape attend ses analyses asynchrones
   * (3 à 6 min chacune, en file). Au-delà, l'étape devient `unknown` — un
   * timeout n'est pas un échec, et rien ne se relance seul.
   */
  maxAsyncWaitSeconds: 7_200,
} as const

/**
 * #2276 tranche 2 — pourquoi une étape n'est pas « faite ». Un CODE, que l'écran
 * traduit (FR+EN) ; le détail rapporté par la capacité va dans `errors`.
 *  - `not_executable_in_job` : la capacité ne s'exécute pas (encore) dans un job —
 *    rien n'est parti, rien n'est débité ;
 *  - `dependency_not_done` : une étape dont elle dépend n'a pas abouti ;
 *  - `no_target_in_scope` : le périmètre ne porte aucune cible pour elle ;
 *  - `refused` : la capacité a refusé (droit, mandat, outil non branché) ;
 *  - `capability_failed` : la capacité a échoué ;
 *  - `timeout` : on ne sait pas si c'est parti — un timeout n'est pas un échec.
 */
export const lauraJobStepNoteSchema = z.enum([
  'not_executable_in_job',
  'dependency_not_done',
  'no_target_in_scope',
  'refused',
  'capability_failed',
  'timeout',
  // #3860.1 — la capacité exige un filtre que l'étape ne porte pas : rien n'est parti.
  'missing_criteria',
])
export type LauraJobStepNote = z.infer<typeof lauraJobStepNoteSchema>

// ── #2276.8 / #2276.9 — les étapes et leurs dépendances ─────────────────────

const stepKey = z.string().regex(/^[a-z0-9_]{1,40}$/)

/**
 * #3860.1 — le FILTRE d'une étape, posé par le modèle à la proposition, montré
 * avant le clic. Fermé (`strict`) : un champ inconnu est refusé, jamais ignoré.
 * La région est un code INSEE, le département un code (« 31 », « 2A », « 974 »).
 */
const lauraJobStepCriteriaSchema = z
  .object({
    technology: z.string().trim().min(1).max(80).optional(),
    location: z.string().trim().min(1).max(120).optional(),
    region: z
      .string()
      .regex(/^\d{2}$/)
      .optional(),
    department: z
      .string()
      .regex(/^(2A|2B|\d{2,3})$/)
      .optional(),
    needId: z.string().guid().optional(),
  })
  .strict()
type LauraJobStepCriteria = z.infer<typeof lauraJobStepCriteriaSchema>
type LauraJobCriterion = keyof LauraJobStepCriteria

const uuidList = (max: number) => z.array(z.string().guid()).max(max).default([])

export const lauraJobStepSchema = z.object({
  key: stepKey,
  label: z.string().trim().min(1).max(200),
  capability: lauraJobCapabilitySchema,
  /** Combien de cibles l'étape traite (20 filiales = 20). Multiplie le coût unitaire. */
  units: z.number().int().min(1).max(LAURA_JOB_LIMITS.maxUnitsPerStep).default(1),
  /** #2276.9 — des clés d'étapes DÉCLARÉES PLUS HAUT, jamais devinées depuis le rang. */
  dependsOn: z.array(stepKey).max(10).default([]),
  /** Ce que le modèle déclare ; une capacité qui écrit dehors l'emporte toujours. */
  requiresApproval: z.boolean().default(false),
  status: planStepStatusSchema.default('todo'),
  // ── #2276.59 — la PREUVE d'une étape, écrite par l'exécuteur, jamais par le modèle
  // (`LauraJobService.fresh` la remet à zéro sur une fiche proposée). `null` =
  // non mesuré, jamais 0 (GA-18).
  startedAt: z.string().datetime().nullable().default(null),
  finishedAt: z.string().datetime().nullable().default(null),
  /** Les crédits que la capacité a DÉBITÉS — rapportés par elle, jamais recopiés de l'estimation. */
  creditsSpent: z.number().int().min(0).nullable().default(null),
  /**
   * #2852.21 — les crédits RÉSERVÉS pour cette étape avant son exécution
   * (`lauraJobStepCredits`, la même grille que l'estimation) — posé par
   * l'exécuteur au moment où il tient la réservation, jamais par le modèle.
   * `null` tant que l'étape n'a pas encore été prise en charge (non mesuré,
   * jamais 0).
   */
  creditsReserved: z.number().int().min(0).nullable().default(null),
  /**
   * #2852.23 — la part de la réservation RENDUE au solde : `creditsReserved -
   * creditsSpent` une fois l'étape soldée. `0` est un fait mesuré (rien
   * remboursé, la réservation a été intégralement consommée) ; `null` reste
   * le silence tant que l'étape n'est pas soldée.
   */
  creditsRefunded: z.number().int().min(0).nullable().default(null),
  /** Ce qui explique l'état d'une étape qui n'est pas « faite » — un code, traduit par l'écran. */
  note: lauraJobStepNoteSchema.nullable().default(null),
  /** Doctrine — la porte : qui a validé une étape qui l'exige, et quand. Jamais le modèle. */
  approvedBy: z.string().guid().nullable().default(null),
  approvedAt: z.string().datetime().nullable().default(null),
  /** #3860.1 — le filtre de l'étape (voir {@link lauraJobStepCriteriaSchema}). `null` = aucun. */
  criteria: lauraJobStepCriteriaSchema.nullable().default(null),
  /**
   * #3860.1 — les runs ASYNCHRONES que l'étape attend (une analyse par compte),
   * écrits par l'exécuteur, jamais par le modèle. Non vide ⇔ l'étape est
   * `running` entre deux passages.
   */
  awaiting: z
    .array(
      z.object({ accountId: z.string().guid(), runRef: z.string().min(1).max(300), launchedAt: z.string().datetime() }),
    )
    .max(LAURA_JOB_LIMITS.maxAccounts)
    .default([]),
  /**
   * #3860.2 — les identités que l'étape a PRODUITES (preuve), versées dans le
   * périmètre du job pour les étapes suivantes ({@link lauraJobWithProducedIdentities}).
   */
  produced: z
    .object({ accountIds: uuidList(LAURA_JOB_LIMITS.maxAccounts), contactIds: uuidList(LAURA_JOB_LIMITS.maxContacts) })
    .default({ accountIds: [], contactIds: [] }),
})
export type LauraJobStep = z.infer<typeof lauraJobStepSchema>

const text = z.string().trim().min(1)

// ── #2276.3-.21 — la fiche du job ───────────────────────────────────────────

export const lauraJobBriefSchema = z
  .object({
    /** #2276.3 — la demande telle que la personne l'a écrite. */
    originalRequest: text.max(4000),
    /** #2276.4 — ce que Laura a compris qu'il faut obtenir. */
    intent: text.max(500),
    /** #2276.5 — à quoi ressemble le travail fini. */
    expectedOutcome: text.max(1000),
    /** #2276.6 — sur quoi le job porte : une phrase, et les cibles résolues quand il y en a. */
    scope: z.object({
      description: text.max(500),
      accountIds: z.array(z.string().guid()).max(LAURA_JOB_LIMITS.maxAccounts).default([]),
      contactIds: z.array(z.string().guid()).max(LAURA_JOB_LIMITS.maxContacts).default([]),
    }),
    /** #2276.7 — ce que Laura suppose sans l'avoir vérifié. Vide = rien de supposé. */
    assumptions: z.array(text.max(300)).max(10).default([]),
    /** #2276.8 */
    steps: z.array(lauraJobStepSchema).min(1).max(LAURA_JOB_LIMITS.maxSteps),
    /** #2276.10 — les sources que le job lit (libellés, jamais nos fournisseurs). */
    sources: z.array(text.max(200)).max(20).default([]),
    /**
     * #2276.13 / #2276.49 — la durée prévue, en secondes. `null` = non estimée,
     * jamais 0. Posée par le SERVEUR à partir de mesures
     * ({@link lauraJobMeasuredDuration}), jamais par le modèle.
     */
    estimatedDurationSeconds: z.number().int().min(1).max(86_400).nullable().default(null),
    /** #2276.49 — sur combien d'étapes MESURÉES l'estimation repose. `null` = pas d'estimation. */
    estimatedDurationBasis: z.number().int().min(1).nullable().default(null),
    /** #2276.16 — ce que chaque étape a déjà produit. */
    intermediateResults: z
      .array(z.object({ stepKey, summary: text.max(500), at: z.string().datetime() }))
      .max(50)
      .default([]),
    /** #2276.17 — les erreurs, par étape quand on sait laquelle. */
    errors: z
      .array(z.object({ stepKey: stepKey.nullable(), message: text.max(500), at: z.string().datetime() }))
      .max(50)
      .default([]),
    /** #2276.21 — ce que le job a créé dans Bellum ou dans l'outil branché. */
    createdObjects: z
      .array(z.object({ kind: z.string().min(1).max(40), id: z.string().min(1).max(300), label: text.max(200) }))
      .max(200)
      .default([]),
  })
  .superRefine((brief, ctx) => {
    // #2276.9 — une dépendance désigne une étape DÉJÀ déclarée : ni elle-même, ni
    // une étape plus bas (ce qui interdit tout cycle par construction), ni une
    // clé inconnue. Une clé en double rendrait la référence ambiguë.
    const seen = new Set<string>()
    brief.steps.forEach((step, index) => {
      if (seen.has(step.key)) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['steps', index, 'key'], message: 'duplicate step key' })
      }
      for (const dependency of step.dependsOn) {
        if (!seen.has(dependency)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['steps', index, 'dependsOn'],
            message: `dependency "${dependency}" is not an earlier step`,
          })
        }
      }
      seen.add(step.key)
    })
  })
export type LauraJobBrief = z.infer<typeof lauraJobBriefSchema>

// ── #2276.22-.31 — les états d'un job ───────────────────────────────────────

/**
 * Les dix états de #2276, plus deux que la doctrine interdit de replier :
 * `blocked` (rien n'est parti) et `unknown` (on ne sait pas si c'est parti —
 * un timeout n'est pas un échec).
 */
export const lauraJobStateSchema = z.enum([
  'draft',
  'to_confirm',
  'planned',
  'running',
  'awaiting_approval',
  'partial',
  'done',
  'failed',
  'cancelled',
  'superseded',
  'blocked',
  'unknown',
])
export type LauraJobState = z.infer<typeof lauraJobStateSchema>

/**
 * L'état d'un job, par le seul statut de sa ligne. Exhaustif (`never`) : un
 * statut ajouté sans passer ici ne compile pas. `snoozed` n'est jamais écrit
 * sur un job ; lu quand même, il redevient ce qu'il était avant d'être mis de
 * côté — une fiche qui attend qu'on la confirme.
 */
export function lauraJobStateOf(status: WorkflowRunStatus): LauraJobState {
  switch (status) {
    case 'draft':
    case 'to_confirm':
    case 'planned':
    case 'running':
    case 'awaiting_approval':
    case 'partial':
    case 'done':
    case 'failed':
    case 'cancelled':
    case 'superseded':
    case 'blocked':
    case 'unknown':
      return status
    case 'snoozed':
      return 'to_confirm'
    default: {
      const exhaustive: never = status
      throw new Error(`lauraJobStateOf: unhandled WorkflowRunStatus ${String(exhaustive)}`)
    }
  }
}

// ── Dérivations — UNE lecture de chaque, pour l'API et l'écran (GA-26) ──────

/** #2276.12 — le coût d'une étape, tiré de la grille ; une lecture ne coûte rien par construction. */
export function lauraJobStepCredits(step: Pick<LauraJobStep, 'capability' | 'units'>): number {
  const credited = LAURA_JOB_CAPABILITIES[step.capability].credited
  return credited === null ? 0 : creditCostOf(credited) * step.units
}

/** #2276.12 — le coût maximum annoncé : la somme des étapes, tirée de la grille. */
export function lauraJobEstimatedCredits(brief: Pick<LauraJobBrief, 'steps'>): number {
  return brief.steps.reduce((sum, step) => sum + lauraJobStepCredits(step), 0)
}

/** #2276.14 — les étapes qui attendront une validation humaine. */
export function lauraJobValidationsRequired(brief: Pick<LauraJobBrief, 'steps'>): LauraJobStep[] {
  return brief.steps.filter(lauraJobStepNeedsApproval)
}

/** #2276.11 — les capacités mobilisées, dans l'ordre de leur première étape. */
export function lauraJobToolsOf(brief: Pick<LauraJobBrief, 'steps'>): LauraJobCapability[] {
  return [...new Set(brief.steps.map(step => step.capability))]
}

/** #2276.15 — l'avancement MESURÉ : des étapes finies sur des étapes, jamais un pourcentage inventé. */
export function lauraJobProgressOf(brief: Pick<LauraJobBrief, 'steps'>): { done: number; total: number } {
  return { done: brief.steps.filter(step => step.status === 'done').length, total: brief.steps.length }
}

/**
 * #2276.18 — la reprise. Elle repart de la première étape non faite — les
 * étapes faites ne sont jamais rejouées — et seulement d'un job arrêté en
 * `partial` ou `failed`. `unknown` l'ARRÊTE : une étape peut-être partie ne se
 * relance pas toute seule (doctrine).
 */
export function lauraJobResumeOf(
  state: LauraJobState,
  brief: Pick<LauraJobBrief, 'steps'>,
): { resumable: boolean; fromStepKey: string | null } {
  if (state === 'unknown' || brief.steps.some(step => step.status === 'unknown')) {
    return { resumable: false, fromStepKey: null }
  }
  if (state !== 'partial' && state !== 'failed') return { resumable: false, fromStepKey: null }
  const next = brief.steps.find(step => step.status !== 'done')
  return next ? { resumable: true, fromStepKey: next.key } : { resumable: false, fromStepKey: null }
}

// ── #2276 tranche 2 — l'exécution par étapes ────────────────────────────────

/** Doctrine — une étape exige une validation si le modèle le dit OU si elle écrit dehors. */
export function lauraJobStepNeedsApproval(step: Pick<LauraJobStep, 'capability' | 'requiresApproval'>): boolean {
  return step.requiresApproval || LAURA_JOB_CAPABILITIES[step.capability].writesOutside
}

/**
 * #2276.1 — la prochaine étape à exécuter : la première `todo` dont toutes les
 * dépendances sont `done`. `null` = plus rien ne peut partir.
 */
export function lauraJobNextStepOf(brief: Pick<LauraJobBrief, 'steps'>): LauraJobStep | null {
  const done = new Set(brief.steps.filter(step => step.status === 'done').map(step => step.key))
  return brief.steps.find(step => step.status === 'todo' && step.dependsOn.every(key => done.has(key))) ?? null
}

/** La prochaine étape, quand elle attend une validation humaine qu'elle n'a pas encore. */
export function lauraJobAwaitsApproval(brief: Pick<LauraJobBrief, 'steps'>): LauraJobStep | null {
  const next = lauraJobNextStepOf(brief)
  return next && lauraJobStepNeedsApproval(next) && next.approvedBy === null ? next : null
}

/**
 * #2276.58 / #2276.60 — l'état d'un job QUI A COMMENCÉ, par ses seules étapes.
 * `unknown` l'emporte sur tout (un timeout n'est pas un échec, et rien ne se
 * rejoue seul) ; puis la porte (`awaiting_approval`) ; puis `running` tant
 * qu'une étape peut partir ; sinon l'état terminal : `done`, `partial` (des
 * résultats restent), `failed`, ou `blocked` (rien n'est parti).
 */
export function lauraJobStateAfterStep(
  brief: Pick<LauraJobBrief, 'steps'>,
): Extract<LauraJobState, 'unknown' | 'awaiting_approval' | 'running' | 'done' | 'partial' | 'failed' | 'blocked'> {
  const steps = brief.steps
  if (steps.some(step => step.status === 'unknown')) return 'unknown'
  if (steps.every(step => step.status === 'done')) return 'done'
  if (lauraJobAwaitsApproval(brief)) return 'awaiting_approval'
  if (lauraJobNextStepOf(brief)) return 'running'
  if (steps.some(step => step.status === 'done')) return 'partial'
  if (steps.some(step => step.status === 'failed')) return 'failed'
  return 'blocked'
}

/** #2276.57 / #2276.18 — les gestes qu'une personne peut faire sur un job. */
export const lauraJobGestureSchema = z.enum(['confirm', 'approve', 'resume', 'cancel'])
export type LauraJobGesture = z.infer<typeof lauraJobGestureSchema>

/** I3 — le coût maximum de ce qui RESTE à faire : ce que la réservation doit encore couvrir. */
export function lauraJobRemainingCredits(brief: Pick<LauraJobBrief, 'steps'>): number {
  return brief.steps.filter(step => step.status === 'todo').reduce((sum, step) => sum + lauraJobStepCredits(step), 0)
}

/**
 * La fin d'un passage : ce qui reste à faire et ne peut plus partir (une
 * dépendance n'a pas abouti) est SAUTÉ — pas raté. Appelée seulement quand plus
 * rien ne peut partir ({@link lauraJobNextStepOf} rend `null`).
 */
export function lauraJobDropUnreachable(brief: LauraJobBrief): LauraJobBrief {
  return {
    ...brief,
    steps: brief.steps.map(step =>
      step.status === 'todo' ? { ...step, status: 'dropped', note: 'dependency_not_done' } : step,
    ),
  }
}

/** Le corps d'un geste sans paramètre (confirmer, reprendre, annuler) : vide, rien d'autre. */
export const lauraJobGestureRequestSchema = z.object({}).strict()
/** Valider une étape : la clé de l'étape qui attend, rien d'autre (jamais « qui valide »). */
export const lauraJobApproveRequestSchema = z.object({ stepKey }).strict()

/** Les gestes permis dans cet état — UNE lecture, pour l'API (refus) et l'écran (boutons). */
export function lauraJobGesturesOf(state: LauraJobState, brief: Pick<LauraJobBrief, 'steps'>): LauraJobGesture[] {
  switch (state) {
    case 'to_confirm':
      return ['confirm', 'cancel']
    case 'draft':
    case 'planned':
    case 'running':
      return ['cancel']
    case 'awaiting_approval':
      return ['approve', 'cancel']
    case 'partial':
    case 'failed':
      return lauraJobResumeOf(state, brief).resumable ? ['resume'] : []
    default:
      return []
  }
}

/**
 * #2276.53 — la reprise remet à faire ce qui n'a pas abouti et GARDE le reste :
 * une étape faite n'est jamais rejouée, sa preuve reste. Appelée seulement
 * quand {@link lauraJobResumeOf} dit reprenable (jamais sur `unknown`).
 */
export function lauraJobRearmForResume(brief: LauraJobBrief): LauraJobBrief {
  return {
    ...brief,
    steps: brief.steps.map(step =>
      step.status === 'done'
        ? step
        : {
            ...step,
            status: 'todo',
            note: null,
            startedAt: null,
            finishedAt: null,
            creditsSpent: null,
            creditsReserved: null,
            creditsRefunded: null,
            awaiting: [],
            produced: { accountIds: [], contactIds: [] },
          },
    ),
  }
}

/**
 * #2276.22 / #2276.23 — l'état où Laura POSE un job neuf. Tranché sans Louis
 * (24/09) : `to_confirm` quand la fiche est confirmable, `draft` sinon. Une
 * fiche n'est pas confirmable tant qu'elle suppose quelque chose qu'aucune cible
 * résolue ne vient étayer ET qu'elle n'a aucune cible — le « brouillon » dit
 * alors « il manque le périmètre », pas « prêt à lancer ».
 */
export function lauraJobInitialStatus(brief: LauraJobBrief): Extract<WorkflowRunStatus, 'draft' | 'to_confirm'> {
  const hasTargets = brief.scope.accountIds.length > 0 || brief.scope.contactIds.length > 0
  if (brief.assumptions.length > 0 && !hasTargets) return 'draft'
  // #2276.22 — paramètres INCOMPLETS : une étape qui exige un filtre qu'elle n'a pas, ou des comptes / contacts que
  // ni le périmètre ni une étape amont ne fournira, ne peut pas être confirmée — le job naît Brouillon et dit
  // « il manque le périmètre » (jamais « prêt à lancer »).
  const incomplete = brief.steps.some(step => {
    const entry = LAURA_JOB_CAPABILITIES[step.capability]
    if (lauraJobStepCriteriaMissing(step)) return true
    if (entry.targetsAccounts && brief.scope.accountIds.length === 0) return true
    if (entry.targetsContacts && brief.scope.contactIds.length === 0 && contactProducerOf(brief.steps, step) === null) {
      return true
    }
    return false
  })
  return incomplete ? 'draft' : 'to_confirm'
}

// ── Ce que l'API rend, ce que l'écran lit ───────────────────────────────────

// ── #3860.4 — la synthèse : la DERNIÈRE étape du job ──────────────────────────

/**
 * #3860.4 — DÉCISION LOUIS 09/10 : « l'étape de synthèse » = la DERNIÈRE étape
 * d'un job de Laura, un résumé ÉCRIT de ce que le job a produit (comptes
 * analysés, contacts, messages préparés, avec leurs liens) et de ce qui a
 * échoué ou reste `unknown`. Elle ne recalcule RIEN — elle lit `produced` des
 * étapes, `createdObjects` et le statut de chaque étape — et ne débite AUCUN
 * crédit (elle n'est pas une capacité). Elle n'existe qu'une fois le job arrivé
 * au bout : pendant qu'il tourne, elle mentirait.
 */
const LAURA_JOB_SYNTHESIS_STATES: readonly LauraJobState[] = ['done', 'partial', 'failed', 'cancelled', 'unknown']

const namedStep = z.object({ key: stepKey, label: z.string() })

export const lauraJobSynthesisSchema = z.object({
  accounts: z.array(z.object({ id: z.string().guid(), name: z.string() })),
  contacts: z.array(z.object({ id: z.string().guid(), name: z.string() })),
  messages: z.array(z.object({ id: z.string(), label: z.string() })),
  failed: z.array(namedStep),
  unknown: z.array(namedStep),
  errors: z.array(z.string()),
})
export type LauraJobSynthesis = z.infer<typeof lauraJobSynthesisSchema>

/** Les identités que la synthèse doit NOMMER — `null` tant que le job n'est pas au bout. */
export function lauraJobSynthesisIdentities(
  state: LauraJobState,
  brief: Pick<LauraJobBrief, 'steps'>,
): { accountIds: string[]; contactIds: string[] } | null {
  if (!LAURA_JOB_SYNTHESIS_STATES.includes(state)) return null
  return {
    accountIds: [...new Set(brief.steps.flatMap(step => step.produced.accountIds))],
    contactIds: [...new Set(brief.steps.flatMap(step => step.produced.contactIds))],
  }
}

/**
 * La synthèse, nommée. `names` vient de l'appelant (le serveur relit les noms ;
 * la salle de démo n'en a pas) : une identité sans nom lisible — supprimée
 * depuis — ne fait AUCUNE ligne (on n'affiche pas ce qu'on n'a pas).
 */
export function lauraJobSynthesisOf(
  state: LauraJobState,
  brief: Pick<LauraJobBrief, 'steps' | 'createdObjects' | 'errors'>,
  names: { accounts: ReadonlyMap<string, string>; contacts: ReadonlyMap<string, string> },
): LauraJobSynthesis | null {
  const identities = lauraJobSynthesisIdentities(state, brief)
  if (!identities) return null
  const named = (ids: readonly string[], byId: ReadonlyMap<string, string>) =>
    ids.flatMap(id => {
      const name = byId.get(id)
      return name ? [{ id, name }] : []
    })
  const stepsIn = (status: LauraJobStep['status']) =>
    brief.steps.filter(step => step.status === status).map(step => ({ key: step.key, label: step.label }))
  return {
    accounts: named(identities.accountIds, names.accounts),
    contacts: named(identities.contactIds, names.contacts),
    messages: brief.createdObjects
      .filter(object => object.kind === 'outreach_message')
      .map(object => ({ id: object.id, label: object.label })),
    failed: stepsIn('failed'),
    unknown: stepsIn('unknown'),
    errors: brief.errors.map(entry => entry.message),
  }
}

export const lauraJobViewSchema = z.object({
  id: z.string().guid(),
  state: lauraJobStateSchema,
  brief: lauraJobBriefSchema,
  tools: z.array(lauraJobCapabilitySchema),
  validationsRequired: z.array(z.object({ key: stepKey, label: z.string() })),
  progress: z.object({ done: z.number().int().min(0), total: z.number().int().min(1) }),
  resume: z.object({ resumable: z.boolean(), fromStepKey: stepKey.nullable() }),
  /** #2276.19 */
  ownerId: z.string().guid(),
  /** #2276.20 */
  conversationId: z.string().nullable(),
  turnId: z.string().guid().nullable(),
  estimatedCredits: z.number().int().min(0),
  spentCredits: z.number().int().min(0),
  startedAt: z.string().datetime().nullable(),
  finishedAt: z.string().datetime().nullable(),
  createdAt: z.string().datetime(),
  /** #3860.4 — la synthèse, dernière étape du job. `null` tant qu'il n'est pas au bout. */
  synthesis: lauraJobSynthesisSchema.nullable().default(null),
})
export type LauraJobView = z.infer<typeof lauraJobViewSchema>

// ── #2276.46 / .47 / .51 — la prévisualisation, avant « Confirmer » ─────────

/** #2276.51 — une limite qui s'appliquera à une étape, dite AVANT le clic. */
export type LauraJobLimit =
  | { kind: 'max_targets'; stepKey: string; max: number }
  | { kind: 'no_targets'; stepKey: string }
  | { kind: 'not_executable'; stepKey: string }
  // #3860.1 — la capacité exige un filtre que l'étape ne porte pas.
  | { kind: 'missing_criteria'; stepKey: string }
  // #3860.2 — les cibles viendront d'une étape en amont (les contacts trouvés par l'analyse).
  | { kind: 'targets_from_step'; stepKey: string; fromStepKey: string }

/**
 * #2276.46 / #2276.47 / #2276.51 — ce que la personne lit avant de confirmer :
 * les étapes qui RELISENT des données déjà là, celles qui font du NEUF, et les
 * limites que l'exécuteur appliquera (au plus `units` contacts du périmètre,
 * une étape qu'un job ne sait pas encore faire partir). Tout vient de la table
 * des capacités — la carte ne devine rien.
 */
export function lauraJobPreviewOf(brief: Pick<LauraJobBrief, 'steps' | 'scope'>): {
  reused: Array<{ key: string; label: string }>
  newActions: Array<{ key: string; label: string }>
  limits: LauraJobLimit[]
} {
  const pick = (step: LauraJobStep) => ({ key: step.key, label: step.label })
  const limits: LauraJobLimit[] = []
  for (const step of brief.steps) {
    const entry = LAURA_JOB_CAPABILITIES[step.capability]
    if (!entry.executableInJob) {
      limits.push({ kind: 'not_executable', stepKey: step.key })
    } else if (lauraJobStepCriteriaMissing(step)) {
      limits.push({ kind: 'missing_criteria', stepKey: step.key })
    } else if (entry.targetsContacts || entry.targetsAccounts) {
      // L'exécuteur traite `scope.<cibles>.slice(0, units)` : c'est ce nombre-là.
      const inScope = entry.targetsContacts ? brief.scope.contactIds.length : brief.scope.accountIds.length
      const max = Math.min(step.units, inScope)
      const producer = entry.targetsContacts && max === 0 ? contactProducerOf(brief.steps, step) : null
      if (producer) limits.push({ kind: 'targets_from_step', stepKey: step.key, fromStepKey: producer })
      else
        limits.push(
          max > 0 ? { kind: 'max_targets', stepKey: step.key, max } : { kind: 'no_targets', stepKey: step.key },
        )
    }
  }
  return {
    reused: brief.steps.filter(step => LAURA_JOB_CAPABILITIES[step.capability].reusesData).map(pick),
    newActions: brief.steps.filter(step => !LAURA_JOB_CAPABILITIES[step.capability].reusesData).map(pick),
    limits,
  }
}

/** #3860.2 — l'étape en AMONT (dépendance directe ou transitive) qui produira des contacts. */
function contactProducerOf(steps: readonly LauraJobStep[], step: LauraJobStep): string | null {
  const byKey = new Map(steps.map(candidate => [candidate.key, candidate]))
  const queue = [...step.dependsOn]
  const seen = new Set<string>()
  while (queue.length > 0) {
    const key = queue.shift() as string
    if (seen.has(key)) continue
    seen.add(key)
    const upstream = byKey.get(key)
    if (!upstream) continue
    if (LAURA_JOB_CAPABILITIES[upstream.capability].producesContacts) return upstream.key
    queue.push(...upstream.dependsOn)
  }
  return null
}

// ── #3860.1 / #3860.2 — les étapes qui s'enchaînent ─────────────────────────

/** #3860.1 — la capacité exige un filtre, et l'étape n'en porte aucun des champs requis. */
export function lauraJobStepCriteriaMissing(step: Pick<LauraJobStep, 'capability' | 'criteria'>): boolean {
  const keys = LAURA_JOB_CAPABILITIES[step.capability].criteriaKeys
  if (keys.length === 0) return false
  return !keys.some(key => step.criteria?.[key] !== undefined)
}

/** #3860.1 — l'étape qui attend des runs asynchrones (au plus une : l'exécuteur avance étape par étape). */
export function lauraJobAwaitingStepOf(brief: Pick<LauraJobBrief, 'steps'>): LauraJobStep | null {
  return brief.steps.find(step => step.status === 'running' && step.awaiting.length > 0) ?? null
}

const mergedIds = (current: readonly string[], added: readonly string[], max: number): string[] =>
  [...new Set([...current, ...added])].slice(0, max)

/**
 * #3860.2 — le périmètre du job GAGNE les identités qu'une étape a produites :
 * union, sans doublon, dans l'ordre (les cibles d'origine d'abord), bornée aux
 * plafonds de la fiche. Rien de produit : la fiche est rendue telle quelle.
 */
export function lauraJobWithProducedIdentities(
  brief: LauraJobBrief,
  produced: { accountIds: readonly string[]; contactIds: readonly string[] },
): LauraJobBrief {
  if (produced.accountIds.length === 0 && produced.contactIds.length === 0) return brief
  return {
    ...brief,
    scope: {
      ...brief.scope,
      accountIds: mergedIds(brief.scope.accountIds, produced.accountIds, LAURA_JOB_LIMITS.maxAccounts),
      contactIds: mergedIds(brief.scope.contactIds, produced.contactIds, LAURA_JOB_LIMITS.maxContacts),
    },
  }
}

// ── #2276.49 — la durée, seulement mesurée ───────────────────────────────────

type MeasuredStep = Pick<LauraJobStep, 'capability' | 'units' | 'status' | 'startedAt' | 'finishedAt'>

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
}

/**
 * #2276.49 — la durée d'un job, estimée à partir des étapes RÉELLEMENT
 * exécutées de jobs précédents (preuve `startedAt`/`finishedAt`, #2276.59) : la
 * médiane des secondes par unité de chaque capacité, multipliée par les unités
 * annoncées. `null` dès qu'UNE capacité du job n'a aucune mesure — une durée à
 * moitié inventée serait une durée inventée. Aucune durée n'est jamais 0.
 */
export function lauraJobMeasuredDuration(
  steps: ReadonlyArray<Pick<LauraJobStep, 'capability' | 'units'>>,
  history: ReadonlyArray<MeasuredStep>,
): { seconds: number; basis: number } | null {
  const perUnit = new Map<LauraJobCapability, number[]>()
  for (const past of history) {
    if (past.status !== 'done' || !past.startedAt || !past.finishedAt) continue
    const seconds = (Date.parse(past.finishedAt) - Date.parse(past.startedAt)) / 1000
    if (!Number.isFinite(seconds) || seconds < 0) continue
    perUnit.set(past.capability, [...(perUnit.get(past.capability) ?? []), seconds / Math.max(1, past.units)])
  }
  let total = 0
  let basis = 0
  const counted = new Set<LauraJobCapability>()
  for (const step of steps) {
    const samples = perUnit.get(step.capability)
    if (!samples || samples.length === 0) return null
    total += median(samples) * step.units
    if (!counted.has(step.capability)) {
      counted.add(step.capability)
      basis += samples.length
    }
  }
  if (steps.length === 0) return null
  return { seconds: Math.min(86_400, Math.max(1, Math.round(total))), basis }
}
