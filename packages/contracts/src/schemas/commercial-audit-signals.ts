import { z } from 'zod'
import { ACTIVITY_MEASURES, funnelBreak, type ActivityFunnelInput } from './onboarding/answers-mesures.js'
import { DOSSIER_CONTINUITY_BREAKS, DOSSIER_CONTINUITY_PRACTICES } from './onboarding/answers-routines.js'
import { PROTECTED_SLOT_CAPACITY, WEEKLY_SALES_TIME_BANDS, WORKLOAD_VARIABILITY } from './onboarding/answers-temps.js'
import { auditFrontsBudgetSignalSchema, frontsBudget } from './onboarding/fronts-budget.js'
// #2066.19/.27 — le catalogue VERBATIM des canaux d'entrée déclarés
// (`go_to_market_channels`). Importé depuis `profile-questionnaire.ts`, pas
// `onboarding.ts` (celui-là créerait le cycle que le docblock ci-dessous
// refuse déjà pour `EsnAnswers`) — `profile-questionnaire.ts` n'importe rien
// de ce module ni de `commercial-audit-context.ts`, donc aucun cycle.
import { PROFILE_QUESTION_OPTIONS } from './profile-questionnaire.js'

/**
 * LES SIGNAUX DÉCLARÉS DE L'AUDIT — #2042.15 · #2043.10 · #2049.15 · #2050.14 · #2051.16
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les réponses du Temps 1 étaient collectées, stockées, envoyées au modèle — et
 * l'AUDIT ne les lisait pas : il ne lit que `ProfileContext`, qui est la sortie
 * du Profileur, pas les réponses elles-mêmes. Cinq demandes tombaient dans ce
 * trou, chacune parquée dans un commentaire source (« N'EST PAS ici »,
 * `answers-client-ideal.ts:15`, `answers-interlocuteurs.ts:16`,
 * `answers-mesures.ts:220`, `answers-routines.ts`). Ce module est le chaînon.
 *
 * ⚠️ CE QUI VOYAGE ICI EST DÉCLARÉ, PAS DÉDUIT PAR UN MODÈLE. Ces cinq signaux
 * ne passent DÉLIBÉRÉMENT pas par le Profileur : un fait que la personne a coché
 * elle-même n'a rien à gagner à traverser un modèle qui pourrait le réécrire, et
 * la reformulation d'un fait est indistinguable d'une invention une fois
 * stockée. La dérivation est PURE, testable, et rend le même objet pour les
 * mêmes réponses.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS RÈGLES QUI GOUVERNENT CHAQUE LIGNE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Une valeur absente ne vaut jamais 0.** Chaque signal a un état
 *    `notDeclared` NOMMÉ — et « la liste est vide » n'est pas « rien n'est
 *    suivi », c'est « on n'a pas demandé ». Question posée sur chaque champ :
 *    *si cette valeur est absente, « 0 » est-il VRAI ?*
 * 2. **Aucune probabilité.** Pas un pourcentage, pas un taux de conversion, pas
 *    de « chance ». `funnelBreak` NOMME l'étape où la trace s'arrête ; il ne
 *    remplit aucun trou par une moyenne (doctrine `c26_probabilite`, refusée six
 *    fois).
 * 3. **Ce qui se compte se compte jusqu'au dénominateur.** `trackedStages` et
 *    `untrackedStages` s'ADDITIONNENT jusqu'aux onze unités du catalogue : on
 *    dit de quoi la part est la part, ou on n'en dit pas.
 *
 * ⚠️ **Aucun critère protégé** n'entre ici — ni âge, ni genre, ni origine, ni
 * photo, ni adresse : ce module ne lit que des réponses sur l'ACTIVITÉ
 * commerciale de l'ESN, et rien de ce qu'il transporte ne classe une personne.
 *
 * ⚠️ **Aucun libellé n'est inventé** : tout ce qui sort d'ici est VERBATIM une
 * valeur des catalogues du questionnaire (`ACTIVITY_MEASURES`,
 * `DOSSIER_CONTINUITY_BREAKS`, `DOSSIER_CONTINUITY_PRACTICES`,
 * `WEEKLY_SALES_TIME_BANDS`…). Le TEXTE d'écran vit en i18n, aux deux langues.
 *
 * Appelants : `apps/web/src/features/commercial-audit/lib/build-audit.ts`
 * (`buildCommercialAuditContext`, champs `funnel` et `declaredSignals`), lui-même
 * appelé par `useCommercialAudit()` puis rendu par `AuditDeclaredSignals.tsx`.
 */

// ── L'entrée — structurelle, jamais `EsnAnswers` ────────────────────────────
//
// Même raison que `ActivityFunnelInput` (`answers-mesures.ts`) : ce module est
// importé par le contrat d'audit, et importer `EsnAnswers` depuis `onboarding.ts`
// ferait un cycle. Les clés sont celles du questionnaire, à l'octet près.
export type AuditSignalsInput = ActivityFunnelInput & {
  // #2042.11 → #2042.14 — ce que la personne OBSERVE aujourd'hui.
  ideal_client_current_state?: readonly string[] | null
  // #2042.6 — à quel point le client visé est atteignable aujourd'hui.
  ideal_client_accessibility?: string | null
  // #2043.5 — le niveau où les réponses arrivent RÉELLEMENT.
  real_response_level?: string | null
  // #2050.11 / #2050.12 — deux faits distincts, jamais fondus.
  weekly_sales_time_declared?: string | null
  weekly_sales_time_protected?: string | null
  // #2050.9 / #2050.10 — ce qui érode le créneau, déclaré.
  workload_variability?: string | null
  protected_slot_capacity?: string | null
  // #2050.2 → #2067.4 — les plages où ce temps tombe réellement : les
  // créneaux de la charge active (`commercial-audit-active-load.ts`).
  weekly_sales_time_slots?: readonly string[] | null
  // #2067.2 — avec combien de partenaires, réguliers puis ponctuels (décision
  // Louis du 18/09/2026) : l'arbitrage de la charge active les lit.
  partners_regular_count?: string | null
  partners_occasional_count?: string | null
  // #2051.10 → #2051.15 / #2051.1 → #2051.9
  dossier_continuity_breaks?: readonly string[] | null
  dossier_continuity_practices?: readonly string[] | null
  // #2066.19/.27 — les portes d'entrée déclarées, verbatim du catalogue.
  go_to_market_channels?: readonly string[] | null
  // #2860 (#2045.12-.14, 26/09/2026) — le réseau personnel DÉCLARÉ à
  // l'onboarding (`reseau-comptage.ts`), quatre portes plus les relations
  // chaudes transversales. Même bande VERBATIM que `VIVIER_COUNT_BAND_CHOICES`
  // (`onboarding/answers-vivier.js`) — un deuxième catalogue de bandes
  // divergerait dès le premier ajustement (GA-26).
  former_clients_count_band?: string | null
  former_colleagues_count_band?: string | null
  partners_count_band?: string | null
  referrers_count_band?: string | null
  warm_relations_count_band?: string | null
  // #4422.3 — profil d'espace et portefeuille de métiers : la dispersion
  // sectorielle ne s'applique pas à une spécialisation fonctionnelle au forfait.
  workspace_profile?: unknown
  offer_domains?: readonly string[] | null
}

const cleanList = (values: readonly string[] | null | undefined): string[] => {
  const seen = new Set<string>()
  for (const value of values ?? []) {
    if (typeof value === 'string' && value.trim().length > 0) seen.add(value)
  }
  return [...seen]
}

const cleanValue = (value: string | null | undefined): string | null => {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

// ── #2049.15 — où la chaîne cesse d'être mesurée ────────────────────────────

/**
 * #2049.15 — une étape non mesurée se NOMME, elle ne vaut pas 0 %.
 *
 * Trois états, et le troisième n'est pas le premier : `notDeclared` veut dire
 * « on n'a pas demandé », jamais « rien n'est suivi ». `break` nomme l'étape ET
 * son unité — de quoi écrire « ta trace s'arrête aux réponses obtenues », qui
 * est un CONSTAT, pas une conversion.
 */
export const auditFunnelBreakSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('notDeclared') }),
  z.object({
    kind: z.literal('break'),
    /** L'unité VERBATIM du catalogue où la trace s'arrête. */
    stage: z.string().min(1),
    /** Ce qui y est compté (« réponses », « rendez-vous »…) — jamais un nombre. */
    unit: z.string().min(1),
    /** Les deux seaux S'ADDITIONNENT jusqu'aux onze unités : on dit de quoi la part est la part. */
    trackedStages: z.array(z.string()),
    untrackedStages: z.array(z.string()),
  }),
  z.object({ kind: z.literal('complete'), trackedStages: z.array(z.string()) }),
])
export type AuditFunnelBreakSignal = z.infer<typeof auditFunnelBreakSignalSchema>

function buildFunnelBreakSignal(input: AuditSignalsInput): AuditFunnelBreakSignal {
  const result = funnelBreak(input)
  if (result.kind === 'not_declared') return { kind: 'notDeclared' }

  const tracked = new Set(cleanList(input.activity_measures_tracked))
  const ordered = [...ACTIVITY_MEASURES].sort((a, b) => a.funnelRank - b.funnelRank)
  const trackedStages = ordered.filter(m => tracked.has(m.value)).map(m => m.value)
  if (result.kind === 'complete') return { kind: 'complete', trackedStages }

  return {
    kind: 'break',
    stage: result.measure.value,
    unit: result.measure.unit,
    trackedStages,
    untrackedStages: ordered.filter(m => !tracked.has(m.value)).map(m => m.value),
  }
}

// ── #2042.15 — le point de départ peut différer de l'ambition ───────────────

/**
 * Les deux constats qui disent qu'un compte du profil idéal est atteignable
 * AUJOURD'HUI — par opposition à « Correspond au profil théorique », qui décrit
 * l'ambition et rien de plus. Extraits du catalogue de `ideal_client_current_state`.
 */
export const AUDIT_REACHABLE_TODAY_STATES: readonly string[] = ['Accessible dès maintenant', 'Déjà un client connu']

/** La seule réponse d'accessibilité qui ÉLOIGNE le point de départ, verbatim. */
export const AUDIT_COLD_OUTREACH_REQUIRED = 'Hors réseau actuel, prospection à froid nécessaire'

/**
 * #2042.15 — le point de départ RECOMMANDÉ peut ne pas être l'ambition.
 *
 * Aucun score, aucune probabilité : deux constats déclarés se comparent, et
 * l'écart est NOMMÉ avec les réponses qui le fondent. `declaredStates` est
 * toujours porté pour que l'écran puisse citer sa preuve plutôt qu'asséner.
 */
export const auditStartingPointSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('notDeclared') }),
  z.object({
    kind: z.literal('sameAsAmbition'),
    declaredStates: z.array(z.string()),
    reachableToday: z.array(z.string()),
    gaps: z.array(z.string()),
  }),
  z.object({
    kind: z.literal('differsFromAmbition'),
    declaredStates: z.array(z.string()),
    reachableToday: z.array(z.string()),
    gaps: z.array(z.string()),
  }),
])
export type AuditStartingPointSignal = z.infer<typeof auditStartingPointSignalSchema>

function buildStartingPointSignal(input: AuditSignalsInput): AuditStartingPointSignal {
  const declaredStates = cleanList(input.ideal_client_current_state)
  const accessibility = cleanValue(input.ideal_client_accessibility)
  if (declaredStates.length === 0 && accessibility === null) return { kind: 'notDeclared' }

  const reachableToday = declaredStates.filter(state => AUDIT_REACHABLE_TODAY_STATES.includes(state))
  // Un écart ne se transporte que s'il a été DÉCLARÉ : la prospection à froid
  // est cochée par la personne, elle n'est jamais déduite d'un silence.
  const gaps = accessibility === AUDIT_COLD_OUTREACH_REQUIRED ? [accessibility] : []
  const kind = reachableToday.length > 0 && gaps.length === 0 ? 'sameAsAmbition' : 'differsFromAmbition'
  return { kind, declaredStates, reachableToday, gaps }
}

// ── #2043.10 — top-down / bottom-up / multi-thread ──────────────────────────

export const auditEntryAxisValues = ['topDown', 'bottomUp', 'multiThread'] as const
export type AuditEntryAxis = (typeof auditEntryAxisValues)[number]

/**
 * #2043.10 — l'axe se lit sur le niveau où les réponses ARRIVENT (`real_response_level`),
 * pas sur celui qu'on vise : c'est précisément la distinction que la question
 * #2043.5 a été écrite pour capturer.
 *
 * ⚠️ La table est FERMÉE. Une réponse hors catalogue ne se rapproche pas de la
 * plus proche — elle rend `notDeclared`, parce qu'un axe deviné oriente une
 * stratégie entière.
 */
export const AUDIT_ENTRY_AXIS_BY_RESPONSE_LEVEL: Readonly<Record<string, AuditEntryAxis>> = {
  'Niveau exécutif (COMEX / CODIR)': 'topDown',
  'Niveau opérationnel': 'bottomUp',
  // Le management intermédiaire n'ouvre ni le budget ni le besoin seul : il
  // faut tenir plusieurs fils sur le même compte.
  'Niveau management intermédiaire': 'multiThread',
  'Variable selon le compte': 'multiThread',
}

export const auditEntryAxisSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('notDeclared') }),
  z.object({
    kind: z.literal('measured'),
    axis: z.enum(auditEntryAxisValues),
    /** La réponse VERBATIM dont l'axe est tiré — jamais une déduction muette. */
    declaredResponseLevel: z.string().min(1),
    /** L'axe VISÉ (`ProfileContext.idealAccountProfile.entryStrategy`). `null` = non établi. */
    aimedEntryStrategy: z.string().nullable(),
    /** `true` seulement quand les DEUX sont connus et différents. */
    divergesFromAim: z.boolean(),
  }),
])
export type AuditEntryAxisSignal = z.infer<typeof auditEntryAxisSignalSchema>

function buildEntryAxisSignal(input: AuditSignalsInput, aimedEntryStrategy: string | null): AuditEntryAxisSignal {
  const declaredResponseLevel = cleanValue(input.real_response_level)
  if (declaredResponseLevel === null) return { kind: 'notDeclared' }
  const axis = AUDIT_ENTRY_AXIS_BY_RESPONSE_LEVEL[declaredResponseLevel]
  if (axis === undefined) return { kind: 'notDeclared' }
  const aim = cleanValue(aimedEntryStrategy)
  return {
    kind: 'measured',
    axis,
    declaredResponseLevel,
    aimedEntryStrategy: aim,
    // Un écart entre un fait connu et un fait INCONNU n'est pas un écart.
    divergesFromAim: aim !== null && aim !== axis,
  }
}

// ── #2050.14 — peu de temps ⇒ moins de fronts, pas plus d'outils ────────────
//
// #2067 — décision Louis du 18/09/2026 : UN SEUL calcul du budget de fronts,
// pour l'audit ET la relecture d'onboarding. Il vit dans une feuille sans
// dépendance (`onboarding/fronts-budget.ts`, raison du déménagement dans son
// en-tête) ; ce module le ré-expose sous les mêmes noms.
export {
  AUDIT_MAX_FRONTS_BY_WEEKLY_BAND,
  AUDIT_TIME_EROSION_ANSWERS,
  auditFrontsBudgetSignalSchema,
  frontsBudget,
  type AuditFrontsBudgetSignal,
} from './onboarding/fronts-budget.js'

// ── #2051.16 — les routines se configurent à partir de ces ruptures ─────────

/** La réponse HONNÊTE qui n'est ni une rupture ni un silence. */
export const AUDIT_BREAK_NOT_LOCATED_YET = 'Je ne sais pas encore où ça décroche'

/**
 * #2051.16 — chaque rupture déclarée cite l'habitude du catalogue qui la
 * tiendrait. Les DEUX côtés sont verbatim : la rupture vient de
 * `DOSSIER_CONTINUITY_BREAKS`, l'habitude de `DOSSIER_CONTINUITY_PRACTICES`.
 *
 * ⚠️ « Un besoin est mal qualifié au départ » N'EST PAS dans cette table, et
 * c'est délibéré : aucune des dix habitudes du catalogue ne tient une
 * qualification de besoin. Elle ressort donc `unrouted`, NOMMÉE — inventer une
 * routine pour elle serait promettre ce que le produit ne fait pas.
 */
export const AUDIT_PRACTICE_BY_CONTINUITY_BREAK: Readonly<Record<string, string>> = {
  'Une information connue n’est pas suivie': 'Un suivi tenu à jour dans le CRM',
  'Un candidat n’est pas sécurisé à temps': 'Une mise à jour régulière du vivier',
  'Un compte reste sans prochaine action': 'Une prochaine action datée sur chaque compte',
  'Une activité s’interrompt sans qu’on le voie': 'Une revue hebdomadaire du portefeuille',
  'Un retour client ou candidat n’est pas capturé': 'Un compte rendu écrit après chaque entretien candidat',
}

export const auditRoutineSeedSchema = z.object({
  /** La rupture DÉCLARÉE, verbatim (`DOSSIER_CONTINUITY_BREAKS`). */
  breakDeclared: z.string().min(1),
  /** L'habitude qui la tiendrait, verbatim (`DOSSIER_CONTINUITY_PRACTICES`). */
  practice: z.string().min(1),
  /** `true` quand la personne a DÉCLARÉ tenir déjà cette habitude. */
  alreadyHeld: z.boolean(),
})
export type AuditRoutineSeed = z.infer<typeof auditRoutineSeedSchema>

export const auditRoutineSeedsSignalSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('notDeclared') }),
  /** La personne a DIT qu'elle ne sait pas encore — un fait, pas un vide. */
  z.object({ kind: z.literal('notLocatedYet') }),
  z.object({
    kind: z.literal('measured'),
    seeds: z.array(auditRoutineSeedSchema),
    /** Les ruptures qu'aucune habitude du catalogue ne tient — nommées, pas comblées. */
    unrouted: z.array(z.string()),
  }),
])
export type AuditRoutineSeedsSignal = z.infer<typeof auditRoutineSeedsSignalSchema>

function buildRoutineSeedsSignal(input: AuditSignalsInput): AuditRoutineSeedsSignal {
  const declaredBreaks = cleanList(input.dossier_continuity_breaks)
  if (declaredBreaks.length === 0) return { kind: 'notDeclared' }
  const located = declaredBreaks.filter(value => value !== AUDIT_BREAK_NOT_LOCATED_YET)
  if (located.length === 0) return { kind: 'notLocatedYet' }

  const held = new Set(cleanList(input.dossier_continuity_practices))
  const seeds: AuditRoutineSeed[] = []
  const unrouted: string[] = []
  for (const breakDeclared of located) {
    const practice = AUDIT_PRACTICE_BY_CONTINUITY_BREAK[breakDeclared]
    if (practice === undefined) unrouted.push(breakDeclared)
    else seeds.push({ breakDeclared, practice, alreadyHeld: held.has(practice) })
  }
  return { kind: 'measured', seeds, unrouted }
}

// ── L'agrégat — ce que l'audit LIT ─────────────────────────────────────────

export const auditDeclaredSignalsSchema = z.object({
  /** #2049.15 */
  funnelBreak: auditFunnelBreakSignalSchema,
  /** #2042.15 */
  startingPoint: auditStartingPointSignalSchema,
  /** #2043.10 */
  entryAxis: auditEntryAxisSignalSchema,
  /** #2050.14 */
  frontsBudget: auditFrontsBudgetSignalSchema,
  /** #2051.16 */
  routineSeeds: auditRoutineSeedsSignalSchema,
})
export type AuditDeclaredSignals = z.infer<typeof auditDeclaredSignalsSchema>

/**
 * La SEULE porte par laquelle les réponses du questionnaire entrent dans
 * l'audit. Une dérivation vit à un endroit (GA-26) : aucun écran ne refait ces
 * cinq lectures.
 *
 * @param aimedEntryStrategy l'axe VISÉ, tel que `ProfileContext.idealAccountProfile.entryStrategy`
 *   le porte. `null` quand le profil n'a pas été établi — et un écart avec un
 *   inconnu n'est jamais un écart.
 */
export function buildAuditDeclaredSignals(
  input: AuditSignalsInput,
  aimedEntryStrategy: string | null = null,
): AuditDeclaredSignals {
  return {
    funnelBreak: buildFunnelBreakSignal(input),
    startingPoint: buildStartingPointSignal(input),
    entryAxis: buildEntryAxisSignal(input, aimedEntryStrategy),
    frontsBudget: frontsBudget(input),
    routineSeeds: buildRoutineSeedsSignal(input),
  }
}

// ── #2066.19/.27 — voies stratégiques : LA COMBINAISON DÉJÀ DÉCLARÉE ────────

/**
 * `'Mixte'` répond « un peu de tout » — ce n'est pas une voie qu'on peut
 * PRIORISER, comparer un choix à lui-même n'aide personne (même défaut que
 * #2086.31/.32 : ne jamais nommer ce que tout partage). Elle ne compte donc
 * jamais comme une des 2 à 5 options.
 */
const STRATEGIC_OPTION_EXCLUDED_ANSWERS: readonly string[] = ['Mixte']

/**
 * Les portes d'entrée DÉCLARÉES, nommées une à une, dans l'ordre du catalogue
 * du questionnaire — la SEULE lecture de `go_to_market_channels` de l'audit
 * (GA-26) : la combinaison de voies ci-dessous et l'arbitrage de la charge
 * active (#2067.2 / .5 / .6, `commercial-audit-active-load.ts`) la partagent.
 *
 * `countable` dit si ce nombre de portes est un COMPTE : `false` dès qu'une
 * réponse ne se nomme pas — « Mixte » (« un peu de tout ») ou une valeur hors
 * catalogue. Compter les seules portes nommées sous-estimerait alors les
 * fronts ouverts, et tout ce qui en dérive (réserve, éléments à reporter) serait
 * faux sans le dire.
 */
export function declaredEntryDoors(input: Pick<AuditSignalsInput, 'go_to_market_channels'>): {
  doors: string[]
  countable: boolean
} {
  const declared = cleanList(input.go_to_market_channels)
  const named = new Set(declared.filter(c => !STRATEGIC_OPTION_EXCLUDED_ANSWERS.includes(c)))
  const doors = PROFILE_QUESTION_OPTIONS.go_to_market_channels.filter(channel => named.has(channel))
  return { doors, countable: doors.length > 0 && doors.length === declared.length }
}

/**
 * Une voie stratégique encore SANS potentiel/prérequis/limite/charge mesurés —
 * la forme exacte d'`AuditStrategicOption` (`commercial-audit-context.ts`),
 * répétée ICI en structurel plutôt qu'importée : ce module est importé PAR
 * `commercial-audit-context.ts` (`auditDeclaredSignalsSchema`), l'importer en
 * retour créerait le cycle que le docblock de tête refuse déjà pour `EsnAnswers`.
 */
export type AuditStrategicOptionDraft = {
  label: string
  potential: string | null
  prerequisite: string | null
  limit: string | null
  load: string | null
}

/**
 * #2066.19/.27 — LES 2 À 5 VOIES SONT CELLES QUE LA PERSONNE A DÉJÀ DÉCLARÉES,
 * JAMAIS UN CATALOGUE GÉNÉRIQUE RÉCITÉ POUR TOUT LE MONDE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE N'EST PAS LE CATALOGUE DE `AuditStrategyOptions.tsx` (#2073)
 * ─────────────────────────────────────────────────────────────────────────
 * Un texte de présentation par archétype d'entrée existe déjà à l'écran — il
 * est volontairement générique (une phrase par stratégie, pas un calcul par
 * compte). Le réécrire ici violerait GA-26 (une dérivation, un endroit) et,
 * pire, fabriquerait un `potential`/`prerequisite`/`limit`/`load` qu'aucune
 * mesure ne fonde par ESN — exactement la donnée fictive que la doctrine
 * interdit. Ce que CE module peut dire honnêtement, ce sont les portes
 * d'entrée que la personne a elle-même cochées (`go_to_market_channels`) :
 * verbatim, jamais reformulées, jamais complétées par un jugement inventé —
 * `potential`/`prerequisite`/`limit`/`load` restent donc `null` (#2066.20-23
 * les remplira quand une vraie mesure par voie existera).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA BORNE 2-5 (#2066.27 : « une combinaison LIMITÉE, pas tout garder actif »)
 * ─────────────────────────────────────────────────────────────────────────
 * Sous 2 voies déclarées, il n'y a rien à COMBINER : `null`, jamais une liste
 * à une seule option qui se ferait passer pour un choix (même borne basse que
 * `auditStrategicOptionSchema`). Au-delà de 5, la liste est RÉDUITE à l'ordre
 * du catalogue du questionnaire (`PROFILE_QUESTION_OPTIONS.go_to_market_channels`)
 * — un ordre stable et déjà écrit ailleurs, jamais un tri deviné ici.
 */
export function buildStrategicOptions(input: AuditSignalsInput): AuditStrategicOptionDraft[] | null {
  const ordered = declaredEntryDoors(input).doors
  if (ordered.length < 2) return null
  return ordered.slice(0, 5).map(label => ({ label, potential: null, prerequisite: null, limit: null, load: null }))
}

/**
 * Les catalogues que ce module LIT, ré-exposés pour les gardes : un test qui ne
 * lit rien ne garde rien, et une garde doit pouvoir prouver que son corpus
 * n'est pas vide.
 */
export const AUDIT_SIGNAL_CORPUS = {
  activityMeasures: ACTIVITY_MEASURES,
  continuityBreaks: DOSSIER_CONTINUITY_BREAKS,
  continuityPractices: DOSSIER_CONTINUITY_PRACTICES,
  weeklyBands: WEEKLY_SALES_TIME_BANDS,
  protectedSlotCapacity: PROTECTED_SLOT_CAPACITY,
  workloadVariability: WORKLOAD_VARIABILITY,
  goToMarketChannels: PROFILE_QUESTION_OPTIONS.go_to_market_channels,
} as const
