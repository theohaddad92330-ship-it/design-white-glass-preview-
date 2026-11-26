import { z } from 'zod'
import { creditCostOf } from '../billing/credit-weights.js'
import type { CanonicalTriggerKind } from './canonical-trigger.js'
import type { OutreachIntent } from './outreach-canonical.js'
import { OUTREACH_PLAYBOOK_KEYS, type OutreachPlaybookKey } from './outreach-playbooks.js'

/**
 * Lot L-D1 (#4167, épopée #4163) — LES AUTOMATISATIONS, une seule grammaire :
 *
 *     Quand [signal]  →  alors [inscrire le contact dans la séquence X | préparer l'action Y]
 *
 * Ce fichier ne fabrique AUCUN signal : chacun des six pointe un ÉMETTEUR qui
 * existe déjà — un déclencheur du registre canonique (`canonical_trigger_events`,
 * `TriggerRegistryService`) ou une lecture déjà écrite (le balayage des comptes
 * sans action d'`InterventionsSweeper`, la sélection des fins de mission de
 * l'ATS). `AUTOMATION_SIGNAL_SOURCES` NOMME le fichier de chaque émetteur : un
 * signal dont personne n'émet rien se verrait ici, pas en recette.
 *
 * ⚠️ Rien ne part seul. Une règle PRÉPARE (inscription en séquence, message à
 * relire, appel à passer) ; l'e-mail est toujours validé par un humain, sous
 * mandat (c82). Mono-contact (c74) : un signal, un contact, jamais une audience.
 */

export const AUTOMATION_SIGNALS = [
  'hiring',
  'new_decision_maker',
  'tender',
  'target_change',
  'inactive_account',
  'mission_end',
] as const
export type AutomationSignal = (typeof AUTOMATION_SIGNALS)[number]
export const automationSignalSchema = z.enum(AUTOMATION_SIGNALS)

export type AutomationSignalSource =
  | { type: 'trigger'; kind: CanonicalTriggerKind; emitter: string }
  | {
      type: 'reader'
      reader: 'untouched_accounts' | 'ending_missions'
      emitter: string
      /** Le seul réglage que porte la source : le nombre de jours d'inactivité. */
      parameter?: 'inactive_days'
    }

/**
 * La source RÉELLE de chaque signal. `emitter` est le chemin du fichier qui
 * émet / calcule : il est lu par la garde du dépôt (`automation-rules` côté
 * API) qui vérifie que ce fichier existe.
 *
 * - recrutement → `besoin_entrant` : un besoin client confirmé par Découvrir ;
 * - nouveau décideur → `changement_decideur` : la mémoire de transition du rôle ;
 * - appel d'offres → `ao_publie` : le signal officiel persisté par Découvrir ;
 * - changement sur Mes cibles → `signal_nouveau` : un fait RÉELLEMENT neuf après
 *   un rafraîchissement de veille (la comparaison avant/après, pas un second calcul) ;
 * - compte inactif → le dernier geste tracé du compte (`user_actions`), comme l'alerte
 *   « compte sans action » — mais au seuil CHOISI par la règle ;
 * - fin de mission → les missions de l'ATS connecté dont la date de fin est connue.
 */
export const AUTOMATION_SIGNAL_SOURCES: Record<AutomationSignal, AutomationSignalSource> = {
  hiring: {
    type: 'trigger',
    kind: 'besoin_entrant',
    emitter: 'apps/api/src/modules/notifications/discover-alerts/discover-alert-event.sweeper.ts',
  },
  new_decision_maker: {
    type: 'trigger',
    kind: 'changement_decideur',
    emitter: 'apps/api/src/modules/notifications/discover-alerts/discover-alert-event.sweeper.ts',
  },
  tender: {
    type: 'trigger',
    kind: 'ao_publie',
    emitter: 'apps/api/src/modules/ia-proxy/ia-proxy.controller.ts',
  },
  target_change: {
    type: 'trigger',
    kind: 'signal_nouveau',
    emitter: 'apps/api/src/modules/watchlist-refresh/watchlist-refresh.worker.ts',
  },
  inactive_account: {
    type: 'reader',
    reader: 'untouched_accounts',
    emitter: 'apps/api/src/modules/playbooks/interventions.sweeper.ts',
    parameter: 'inactive_days',
  },
  mission_end: {
    type: 'reader',
    reader: 'ending_missions',
    emitter: 'apps/api/src/modules/ats/ats-parse.ts',
  },
}

/** Ce que la règle fait : la deuxième moitié de la phrase. */
export const AUTOMATION_ACTION_KINDS = ['enroll_sequence', 'prepare_action'] as const
export type AutomationActionKind = (typeof AUTOMATION_ACTION_KINDS)[number]

/** « Préparer l'action Y » — liste fermée, deux gestes que le commercial valide ou passe lui-même. */
export const AUTOMATION_PREPARED_ACTIONS = ['email_to_review', 'call_to_make'] as const
export type AutomationPreparedAction = (typeof AUTOMATION_PREPARED_ACTIONS)[number]

/** Ce qui s'est passé pour UN signal — liste fermée, miroir du CHECK SQL. */
export const AUTOMATION_OUTCOMES = ['enrolled', 'prepared', 'excluded', 'no_contact', 'failed', 'cap_reached'] as const
export type AutomationOutcome = (typeof AUTOMATION_OUTCOMES)[number]

/** Les issues qui comptent comme un déclenchement : la règle a RÉELLEMENT agi. */
const FIRED_OUTCOMES: readonly AutomationOutcome[] = ['enrolled', 'prepared']

export const AUTOMATION_RULE_LIMITS = {
  inactiveDaysMin: 7,
  inactiveDaysMax: 365,
  /** Garde-fou : au plus ce nombre d'actions PAR RÈGLE et PAR PASSAGE du matin. */
  maxPerRun: 20,
  /** Un signal plus vieux que ça n'est plus un « pourquoi maintenant » : il n'est pas repris. */
  signalWindowDays: 7,
  /** La fenêtre du compteur affiché. */
  windowDays: 30,
} as const

/**
 * Le modèle de séquence qui s'applique à chaque signal (lot C, huit modèles).
 * Un seul endroit : les modèles d'automatisation ET le moteur le lisent ici.
 */
const SIGNAL_PLAYBOOK: Record<AutomationSignal, OutreachPlaybookKey> = {
  hiring: 'hiring_signal',
  new_decision_maker: 'new_cio',
  tender: 'tender',
  target_change: 'warm_contact',
  inactive_account: 'win_back',
  mission_end: 'regie_to_forfait',
}

/**
 * L'intention du message qu'une règle « préparer un e-mail » écrit, par signal.
 * Liste fermée de `OUTREACH_INTENTS` : jamais une intention inventée.
 */
export const AUTOMATION_SIGNAL_INTENT: Record<AutomationSignal, OutreachIntent> = {
  hiring: 'open_relationship',
  new_decision_maker: 'open_relationship',
  tender: 'qualify_context',
  target_change: 'open_relationship',
  inactive_account: 'reactivate',
  mission_end: 'follow_up',
}

export function signalPlaybook(signal: AutomationSignal): OutreachPlaybookKey {
  return SIGNAL_PLAYBOOK[signal]
}

export type AutomationTemplate = {
  key: string
  signal: AutomationSignal
  playbook: OutreachPlaybookKey
  /** Seul « compte inactif » porte un délai par défaut. */
  inactiveDays?: number
  /** Un modèle s'active ÉTEINT : le premier geste est celui de l'humain. */
  enabledByDefault: false
}

/** Un modèle d'automatisation par déclencheur, prêt à activer. */
export const AUTOMATION_TEMPLATES: readonly AutomationTemplate[] = AUTOMATION_SIGNALS.map(signal => ({
  key: `automation_${signal}`,
  signal,
  playbook: SIGNAL_PLAYBOOK[signal],
  ...(signal === 'inactive_account' ? { inactiveDays: 60 } : {}),
  enabledByDefault: false as const,
}))

/**
 * Le coût annoncé d'UNE préparation. Il vient de la grille de crédits : une
 * grille qui change change l'annonce, jamais un chiffre dupliqué ici.
 */
export function automationPreparationCost(): number {
  return creditCostOf('message_generation')
}

/**
 * Le plafond de crédits d'une règle, sur la fenêtre de 30 jours. `cap: null` =
 * pas de plafond. Une préparation gratuite ne dépense rien : elle ne peut pas
 * dépasser un plafond (même de zéro).
 */
export function automationCreditVerdict(input: {
  cap: number | null
  spent: number
  cost: number
}): 'allowed' | 'cap_reached' {
  if (input.cap === null || input.cost <= 0) return 'allowed'
  return input.spent + input.cost > input.cap ? 'cap_reached' : 'allowed'
}

/**
 * Le nombre de déclenchements des 30 derniers jours. `null` = NON MESURÉ : la
 * règle n'a jamais tourné (`lastRunAt` absent), on ne sait rien — jamais « 0 ».
 * Une fois qu'elle a tourné, 0 est une vraie mesure.
 */
export function countAutomationFirings(
  firings: readonly { outcome: AutomationOutcome; fired_at: string }[],
  lastRunAt: string | null,
  now: Date,
): number | null {
  if (!lastRunAt) return null
  const since = now.getTime() - AUTOMATION_RULE_LIMITS.windowDays * 86_400_000
  return firings.filter(
    firing => FIRED_OUTCOMES.includes(firing.outcome) && new Date(firing.fired_at).getTime() >= since,
  ).length
}

/* --------------------------------- requêtes --------------------------------- */

const ruleShape = {
  signal: automationSignalSchema,
  action_kind: z.enum(AUTOMATION_ACTION_KINDS),
  playbook_key: z.enum(OUTREACH_PLAYBOOK_KEYS).nullish(),
  prepared_action: z.enum(AUTOMATION_PREPARED_ACTIONS).nullish(),
  inactive_days: z
    .number()
    .int()
    .min(AUTOMATION_RULE_LIMITS.inactiveDaysMin)
    .max(AUTOMATION_RULE_LIMITS.inactiveDaysMax)
    .nullish(),
  /** Plafond de crédits sur 30 jours ; absent = pas de plafond. */
  credit_cap: z.number().int().min(0).max(100_000).nullish(),
}

/** La cohérence de la phrase : chaque nature d'action porte SON paramètre, pas l'autre. */
function checkGrammar(
  rule: {
    signal: AutomationSignal
    action_kind: AutomationActionKind
    playbook_key?: string | null
    prepared_action?: string | null
    inactive_days?: number | null
  },
  ctx: z.RefinementCtx,
): void {
  if (rule.action_kind === 'enroll_sequence') {
    if (!rule.playbook_key) {
      ctx.addIssue({ code: 'custom', path: ['playbook_key'], message: 'Choisis la séquence où inscrire le contact.' })
    }
    if (rule.prepared_action) {
      ctx.addIssue({
        code: 'custom',
        path: ['prepared_action'],
        message: 'Une inscription ne prépare pas d’autre action.',
      })
    }
  } else {
    if (!rule.prepared_action) {
      ctx.addIssue({ code: 'custom', path: ['prepared_action'], message: 'Choisis l’action à préparer.' })
    }
    if (rule.playbook_key) {
      ctx.addIssue({
        code: 'custom',
        path: ['playbook_key'],
        message: 'Une préparation n’inscrit pas dans une séquence.',
      })
    }
  }
  const needsDays =
    AUTOMATION_SIGNAL_SOURCES[rule.signal].type === 'reader' && 'parameter' in AUTOMATION_SIGNAL_SOURCES[rule.signal]
  if (needsDays && (rule.inactive_days === null || rule.inactive_days === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['inactive_days'], message: 'Indique après combien de jours d’inactivité.' })
  }
  if (!needsDays && rule.inactive_days !== null && rule.inactive_days !== undefined) {
    ctx.addIssue({ code: 'custom', path: ['inactive_days'], message: 'Ce signal n’a pas de délai.' })
  }
}

export const createAutomationRuleRequestSchema = z
  .object({ ...ruleShape, template_key: z.string().max(80).nullish() })
  .superRefine(checkGrammar)
export type CreateAutomationRuleRequest = z.infer<typeof createAutomationRuleRequestSchema>

/** Mise à jour : l'interrupteur et le plafond seuls — changer la phrase, c'est une autre règle. */
export const updateAutomationRuleRequestSchema = z
  .object({
    enabled: z.boolean().optional(),
    credit_cap: ruleShape.credit_cap,
  })
  .refine(patch => patch.enabled !== undefined || patch.credit_cap !== undefined, {
    message: 'Rien à modifier.',
  })
export type UpdateAutomationRuleRequest = z.infer<typeof updateAutomationRuleRequestSchema>

/**
 * Théo C automations-editeur.N2/N3 — LE BROUILLON d'une règle : la phrase entière, plus un nom. Modifier une règle ne
 * touche JAMAIS celle qui tourne : le brouillon se teste, puis s'active en devenant la version suivante.
 */
export const saveAutomationRuleDraftRequestSchema = z
  .object({ ...ruleShape, name: z.string().trim().min(1).max(120).nullish() })
  .superRefine(checkGrammar)
export type SaveAutomationRuleDraftRequest = z.infer<typeof saveAutomationRuleDraftRequestSchema>

/** Un essai lit les vraies données et ne crée rien. `ok` = la source a été lue ; `failed` = elle ne l'a pas été. */
export const AUTOMATION_TRIAL_OUTCOMES = ['ok', 'failed'] as const
export type AutomationTrialOutcome = (typeof AUTOMATION_TRIAL_OUTCOMES)[number]

/** Ce qu'un essai éprouve : la règle qui tourne (`live`) ou son brouillon (`draft`). */
export const AUTOMATION_TRIAL_TARGETS = ['live', 'draft'] as const
export type AutomationTrialTarget = (typeof AUTOMATION_TRIAL_TARGETS)[number]

export type AutomationTrialView = {
  id: string
  rule_id: string | null
  /** Le nom de la règle au moment de l'essai : il survit à l'archivage de la règle. */
  rule_name: string
  signal: AutomationSignal
  target: AutomationTrialTarget
  outcome: AutomationTrialOutcome
  /** Situations lues ; `null` quand la source n'a pas pu l'être (« non mesuré », jamais 0). */
  situations_read: number | null
  /** Les comptes concernés, par leur nom. */
  situation_labels: string[]
  /** Ce que la règle aurait fait ; `null` quand l'essai a échoué. */
  would_act: number | null
  /** Pourquoi l'essai a échoué, nommé. */
  reason: string | null
  created_at: string
}

/** Le brouillon posé sur une règle, tel que l'éditeur le relit. */
export type AutomationRuleDraftView = {
  name: string | null
  signal: AutomationSignal
  action_kind: AutomationActionKind
  playbook_key: OutreachPlaybookKey | null
  prepared_action: AutomationPreparedAction | null
  inactive_days: number | null
  credit_cap: number | null
  /** `true` quand un essai a eu lieu APRÈS le dernier enregistrement du brouillon : seul cas où l'activer est permis. */
  tested: boolean
}

/**
 * #2399.6 / #2399.7 — la PHRASE d'une version, telle qu'on la compare : les sept champs qu'une bascule peut changer.
 * Le brouillon et la version qui tourne se lisent par la même forme.
 */
export type AutomationVersionPhrase = {
  name?: string | null
  signal: AutomationSignal
  action_kind: AutomationActionKind
  playbook_key?: OutreachPlaybookKey | null
  prepared_action?: AutomationPreparedAction | null
  inactive_days?: number | null
  credit_cap?: number | null
}

export const AUTOMATION_VERSION_FIELDS = [
  'name',
  'signal',
  'action_kind',
  'playbook_key',
  'prepared_action',
  'inactive_days',
  'credit_cap',
] as const
export type AutomationVersionField = (typeof AUTOMATION_VERSION_FIELDS)[number]

export type AutomationVersionDifference = {
  field: AutomationVersionField
  before: string | number | null
  after: string | number | null
}

/**
 * Ce qui change entre la version qui tourne et la suivante, champ par champ — et SEULEMENT ce qui change.
 * `undefined` et `null` sont la même absence ; un nom absent du brouillon garde celui de la règle (comme à l'activation).
 */
export function diffAutomationVersions(
  current: AutomationVersionPhrase,
  next: AutomationVersionPhrase,
): AutomationVersionDifference[] {
  const differences: AutomationVersionDifference[] = []
  for (const field of AUTOMATION_VERSION_FIELDS) {
    const before = current[field] ?? null
    const after = next[field] ?? null
    if (field === 'name' && after === null) continue
    if (before !== after) differences.push({ field, before, after })
  }
  return differences
}

/** Une version conservée : la phrase qui a tourné, et quand elle a cessé de tourner. On archive, on ne supprime pas. */
export type AutomationRuleVersionSnapshot = AutomationVersionPhrase & {
  version: number
  replaced_at: string
}

/**
 * #2399.7 — l'impact d'une bascule : combien de situations la nouvelle version toucherait ce matin. Mesuré en LECTURE
 * SEULE ; une source qu'on n'a pas pu lire se NOMME (`measured: false` + la raison), jamais « 0 » (GA-18 / GA-19).
 */
export type AutomationSwitchImpact =
  | { measured: true; situations_read: number; would_act: number }
  | { measured: false; reason: string }

/** Ce qu'il advient de ce qui est déjà en cours : les déclenchements consignés par l'ancienne version restent tels quels. */
export type AutomationSwitchMigration = {
  /** Déclenchements déjà consignés pour cette règle : ils ne sont ni rejoués ni effacés. */
  engaged_firings: number
  /** La nouvelle version écoute un autre signal : les éléments déjà pris l'ont été sous l'ancien. */
  signal_changes: boolean
}

/** La comparaison rendue AVANT la bascule : ancienne / nouvelle version, différences, migration, impact. */
export type AutomationSwitchPreviewView = {
  rule_id: string
  from_version: number
  to_version: number
  current: AutomationVersionPhrase
  next: AutomationVersionPhrase
  differences: AutomationVersionDifference[]
  migration: AutomationSwitchMigration
  impact: AutomationSwitchImpact
}

/* ----------------------------------- vue ------------------------------------ */

/** D'où vient la ligne : une règle d'automatisation neuve, une routine planifiée, un workflow Action OS. */
export type AutomationRowOrigin = 'rule' | 'routine' | 'workflow'

export type AutomationRuleView = {
  id: string
  signal: AutomationSignal
  action_kind: AutomationActionKind
  playbook_key: OutreachPlaybookKey | null
  prepared_action: AutomationPreparedAction | null
  inactive_days: number | null
  enabled: boolean
  credit_cap: number | null
  /** Coût annoncé par préparation, issu de la grille de crédits. */
  credit_cost: number
  /** Déclenchements sur 30 jours : `null` = non mesuré (jamais 0). */
  firings_30d: number | null
  /** Ce qui a été écarté sur 30 jours (exclusions, contact introuvable), `null` = non mesuré. */
  skipped_30d: number | null
  /** Crédits dépensés par la règle sur 30 jours ; `null` = non mesuré. */
  credits_spent_30d: number | null
  last_run_at: string | null
  template_key: string | null
  created_at: string
  /**
   * Théo C automations-editeur — les trois champs de l'éditeur sont FACULTATIFS dans le type : l'API les envoie toujours,
   * mais une fixture, un écran voisin ou une version plus ancienne de la réponse ne les connaît pas (additif).
   * Le nom ; `null` = jamais nommée (l'écran la lit alors à sa phrase).
   */
  name?: string | null
  /** La version qui tourne : 1 à la création, +1 à chaque brouillon activé (absente = 1). */
  version?: number
  /** Le brouillon en attente de test / d'activation, `null` ou absent quand il n'y en a pas. */
  draft?: AutomationRuleDraftView | null
}
