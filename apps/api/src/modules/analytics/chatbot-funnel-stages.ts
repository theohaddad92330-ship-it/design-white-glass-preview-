import { MIN_DISTINCT_SESSIONS_FOR_A_METRIC, hasEnoughSessionsToPublish } from '@bellum/contracts'

/**
 * #1659 — le tunnel de Laura tel que l'opérateur le lit :
 *
 *   Visiteurs → Widget ouvert → Conversation → Qualification atteinte → RDV pris
 *
 * avec le taux de passage entre chaque étape, et la médiane du score.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE DEUXIÈME DÉRIVATION À CÔTÉ DE `buildChatbotFunnel`
 * ─────────────────────────────────────────────────────────────────────────────
 * Ce n'est PAS le même tunnel. Celui de `@bellum/contracts` part du widget VU
 * (`chat_widget_viewed`) et va jusqu'au rendez-vous TENU ; celui-ci part des
 * visiteurs du SITE et s'arrête au rendez-vous PRIS. Les deux premières étapes
 * et la dernière diffèrent, et surtout ce tunnel-ci porte deux choses que
 * l'autre n'a pas : la médiane du score et le SEUIL D'AGRÉGATION MINIMALE.
 *
 * Ce qui n'est pas refait : la règle « un taux sans dénominateur vaut `null` »
 * et le vocabulaire de l'absence. Ils sont repris tels quels.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SEUIL NE SE RECOPIE PAS, IL SE LIT (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * `MIN_DISTINCT_SESSIONS_FOR_A_METRIC` vit dans `@bellum/contracts`
 * (`product-analytics-privacy.ts`, doctrine `c64_analytique_produit` ratifiée le
 * 07/09/2026). On l'IMPORTE. Le recopier ici ferait deux valeurs le jour où l'on
 * en change une — et un écran qui publie à 3 pendant qu'un autre masque à 5
 * désigne quelqu'un sur le premier.
 *
 * Le seuil porte sur les SESSIONS DISTINCTES, jamais sur les occurrences : dix
 * clics d'une même session restent une seule session. C'est pour cela que ce
 * module reçoit DEUX tables de Plausible — `events` (occurrences, ce qui
 * s'affiche) et `visitors` (visiteurs uniques, ce qui autorise à publier un
 * taux).
 *
 * ⚠️ Un taux retenu par le seuil ne vaut PAS zéro et ne s'affiche pas « — » sans
 * raison : il porte `kind: 'below_threshold'` avec le compte et le seuil, pour
 * que l'écran écrive la phrase exacte (« moins de N sessions — pas encore de
 * quoi en tirer une mesure »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * AUCUNE DONNÉE NOMINATIVE, PAR CONSTRUCTION
 * ─────────────────────────────────────────────────────────────────────────────
 * Rien de ce fichier ne manipule autre chose que des NOMBRES et des identifiants
 * d'étape appartenant à une union fermée. Il n'y a pas de champ libre où un nom
 * ou une adresse pourrait se glisser : l'unité d'analyse est l'ÉTAPE, jamais la
 * personne. Le balayage qui le vérifie sur la réponse ENTIÈRE vit dans
 * `chatbot-funnel.service.spec.ts`.
 */

/** Les cinq étapes, dans l'ordre où un visiteur les franchit. */
export const CHATBOT_STAGES = ['visitors', 'widget_opened', 'conversation', 'qualified', 'booked'] as const

/** En-fichier seulement : knip refuse un type exporté que seul son propre fichier consomme. */
type ChatbotStageId = (typeof CHATBOT_STAGES)[number]

/**
 * Pourquoi une étape n'a pas de compte. Trois causes, trois gestes :
 *
 *  - `source_unavailable` — Plausible n'a pas répondu. On répare la mesure.
 *  - `not_instrumented`   — rien, dans le produit, n'émet le fait. Aucune clé
 *    d'API n'y changera quoi que ce soit ; il faut instrumenter.
 */
type StageUnmeasured = 'source_unavailable' | 'not_instrumented'

/**
 * Le taux de passage depuis l'étape précédente — et c'est une UNION, pas un
 * `number | null`.
 *
 * ⚠️ La raison est celle du gabarit `analyses-heatmap.logic.ts` (#1650) : un
 * champ nullable oblige chaque lecteur à écrire `rate ?? 0` après avoir pourtant
 * déjà écarté le cas d'absence — deux occurrences de plus au cliquet GA-19 pour
 * un repli qui, le jour où il tirerait, écrirait « 0 % de passage » là où l'on
 * ne sait rien. L'union retire le MOYEN d'écrire ce zéro.
 */
type PassRate =
  /** Mesuré. `ratio` est une part de 1, jamais un pourcentage déjà multiplié. */
  | { kind: 'measured'; ratio: number }
  /** Première étape du tunnel : il n'y a pas d'étape précédente. */
  | { kind: 'no_previous' }
  /** Le numérateur ou le dénominateur n'est pas mesuré — un taux sans
   *  dénominateur mesuré n'existe pas. */
  | { kind: 'unmeasured' }
  /** Sous le seuil d'agrégation minimale : la mesure existe et ne se publie pas. */
  | { kind: 'below_threshold'; sessions: number; minSessions: number }

/** Une étape, dans l'un de ses deux états. L'union rend le zéro impossible. */
export type ChatbotStageReading =
  | {
      stage: ChatbotStageId
      measured: true
      /** Occurrences observées. Zéro y est une VRAIE mesure. */
      count: number
      /** Sessions distinctes derrière ce compte — ce qui autorise (ou non) à
       *  publier le taux de l'étape SUIVANTE. */
      sessions: number
      passRate: PassRate
      shareOfEntry: PassRate
    }
  | {
      stage: ChatbotStageId
      measured: false
      unmeasured: StageUnmeasured
      passRate: PassRate
      shareOfEntry: PassRate
    }

/**
 * La médiane du score de qualification.
 *
 * ⚠️ `not_instrumented` est l'état RÉEL au 07/09/2026, et c'est un fait du
 * dépôt, pas un choix de ce module : le score existe (`scoreLead`, routage du
 * chatbot du site) et il ne SORT jamais du serveur qui le calcule — aucun des
 * dix-huit événements de `CHATBOT_ANALYTICS_EVENTS` ne le porte, ni en valeur ni
 * en tranche. Le publier demanderait d'ajouter un événement à cette énumération
 * FERMÉE, qui vit dans `@bellum/contracts`.
 *
 * On le NOMME donc au lieu de le deviner. Une médiane approchée depuis
 * `qualification_completed` (« quatre axes renseignés ») serait une autre
 * grandeur portant le même nom.
 */
export type MedianScore =
  | { kind: 'measured'; value: number; sessions: number }
  | { kind: 'below_threshold'; sessions: number; minSessions: number }
  | { kind: 'source_unavailable' }
  | { kind: 'not_instrumented' }

/** Ce que la mesure d'audience a rendu, mis en forme pour ce module. */
export type StageMeasurementInput = {
  /** La source a-t-elle répondu ? L'appelant le sait, et lui seul. */
  sourceAvailable: boolean
  /** Visiteurs uniques du SITE sur la période. `null` = non mesuré, jamais 0. */
  siteVisitors: number | null
  /** Occurrences par nom d'événement. */
  events: Readonly<Record<string, number>>
  /** Visiteurs DISTINCTS par nom d'événement — le dénominateur du seuil. */
  visitors: Readonly<Record<string, number>>
}

/**
 * Les événements qui alimentent chaque étape.
 *
 * `visitors` n'en a aucun et ce n'est pas un oubli : les visiteurs du site ne
 * sont pas un événement personnalisé, ils sont l'agrégat du site entier.
 * `qualified` n'en a aucun non plus, et c'est le fait central de ce fichier.
 */
const STAGE_EVENTS: Readonly<Record<ChatbotStageId, readonly string[]>> = {
  visitors: [],
  widget_opened: ['chat_opened', 'chat_auto_opened'],
  conversation: ['chat_first_reply'],
  qualified: [],
  booked: ['calendly_clicked'],
}

function sum(table: Readonly<Record<string, number>>, keys: readonly string[]): number {
  return keys.reduce((total, key) => {
    const value = table[key]
    return total + (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  }, 0)
}

/**
 * Le quotient, ou l'absence NOMMÉE. La seule division du fichier : deux endroits
 * qui la referaient divergeraient sur la question du zéro et du seuil.
 *
 * L'ordre des refus compte. Le seuil d'agrégation passe AVANT le calcul : une
 * mesure qu'on n'a pas le droit de publier ne doit pas exister, même une
 * microseconde, dans une variable qu'on pourrait journaliser ensuite.
 */
function passRate(
  numerator: number | null,
  denominator: { count: number; sessions: number } | null,
  minSessions: number,
): PassRate {
  if (numerator === null || denominator === null) return { kind: 'unmeasured' }
  if (!hasEnoughSessionsToPublish(denominator.sessions)) {
    return { kind: 'below_threshold', sessions: denominator.sessions, minSessions }
  }
  if (denominator.count <= 0) return { kind: 'unmeasured' }
  return { kind: 'measured', ratio: numerator / denominator.count }
}

/**
 * Le tunnel, étape par étape, dans l'ordre de {@link CHATBOT_STAGES}.
 *
 * L'appelant affiche ce qu'il reçoit : ce module ne retrie rien, et l'écran ne
 * recalcule aucun taux.
 */
export function buildChatbotStages(input: StageMeasurementInput): ChatbotStageReading[] {
  const readings: ChatbotStageReading[] = []
  const minSessions = MIN_DISTINCT_SESSIONS_FOR_A_METRIC

  /** L'entrée du tunnel, figée à la première étape mesurée qu'on rencontre. */
  let entry: { count: number; sessions: number } | null = null
  /** L'étape précédente. `null` dès qu'elle n'a pas été mesurée. */
  let previous: { count: number; sessions: number } | null = null
  let first = true

  for (const stage of CHATBOT_STAGES) {
    const measured = measureStage(stage, input)

    if (!measured.ok) {
      readings.push({
        stage,
        measured: false,
        unmeasured: measured.why,
        passRate: first ? { kind: 'no_previous' } : { kind: 'unmeasured' },
        shareOfEntry: first ? { kind: 'no_previous' } : { kind: 'unmeasured' },
      })
      previous = null
      first = false
      continue
    }

    readings.push({
      stage,
      measured: true,
      count: measured.count,
      sessions: measured.sessions,
      passRate: first ? { kind: 'no_previous' } : passRate(measured.count, previous, minSessions),
      shareOfEntry: first ? { kind: 'no_previous' } : passRate(measured.count, entry, minSessions),
    })

    entry ??= { count: measured.count, sessions: measured.sessions }
    previous = { count: measured.count, sessions: measured.sessions }
    first = false
  }

  return readings
}

/**
 * Le compte et les sessions d'une étape, ou la raison NOMMÉE de son absence.
 *
 * ⚠️ L'ordre des deux refus n'est pas indifférent. « Rien ne l'émet » l'emporte
 * sur « la source n'a pas répondu » quand les deux sont vrais : une étape que
 * personne n'instrumente ne deviendra pas mesurable en réparant Plausible, et
 * dire « source indisponible » enverrait chercher une panne qui n'existe pas.
 * C'est la même hiérarchie que `buildChatbotFunnel` applique à `held`.
 */
function measureStage(
  stage: ChatbotStageId,
  input: StageMeasurementInput,
): { ok: true; count: number; sessions: number } | { ok: false; why: StageUnmeasured } {
  if (stage === 'qualified') return { ok: false, why: 'not_instrumented' }
  if (!input.sourceAvailable) return { ok: false, why: 'source_unavailable' }

  if (stage === 'visitors') {
    // Les visiteurs du site SONT des visiteurs uniques : le compte et les
    // sessions sont la même grandeur, et il n'y a rien à additionner.
    if (input.siteVisitors === null) return { ok: false, why: 'source_unavailable' }
    return { ok: true, count: input.siteVisitors, sessions: input.siteVisitors }
  }

  const events = STAGE_EVENTS[stage]
  return { ok: true, count: sum(input.events, events), sessions: sum(input.visitors, events) }
}

/**
 * La médiane du score, ou la raison NOMMÉE de son absence.
 *
 * Le paramètre est une DISTRIBUTION (`score → sessions distinctes`), et non une
 * liste de scores : une liste de scores est une ligne par personne, ce que la
 * doctrine `c64_analytique_produit` interdit de faire voyager. Une distribution
 * agrège par valeur, ce qui est l'unité de mesure du produit et non de la
 * personne.
 *
 * Au 07/09/2026 aucun appelant n'a de distribution à passer — voir le docblock
 * de {@link MedianScore}. La fonction existe pour que l'écran ait UNE forme à
 * lire, et que le jour où l'événement sera émis, seul le client change.
 */
export function readMedianScore(distribution: Readonly<Record<number, number>> | null): MedianScore {
  if (distribution === null) return { kind: 'not_instrumented' }

  const entries = Object.entries(distribution)
    .map(([score, sessions]) => ({ score: Number(score), sessions }))
    .filter(entry => Number.isFinite(entry.score) && Number.isInteger(entry.sessions) && entry.sessions > 0)
    .sort((a, b) => a.score - b.score)

  const sessions = entries.reduce((total, entry) => total + entry.sessions, 0)
  if (!hasEnoughSessionsToPublish(sessions)) {
    return { kind: 'below_threshold', sessions, minSessions: MIN_DISTINCT_SESSIONS_FOR_A_METRIC }
  }

  // La médiane d'une distribution : la valeur de la session du milieu. Sur un
  // effectif pair, la moyenne des deux du milieu — la définition usuelle, écrite
  // une fois.
  const lower = medianAt(entries, Math.floor((sessions - 1) / 2))
  const upper = medianAt(entries, Math.floor(sessions / 2))
  if (lower === null || upper === null) return { kind: 'source_unavailable' }
  return { kind: 'measured', value: (lower + upper) / 2, sessions }
}

function medianAt(entries: readonly { score: number; sessions: number }[], index: number): number | null {
  let seen = 0
  for (const entry of entries) {
    seen += entry.sessions
    if (index < seen) return entry.score
  }
  return null
}
