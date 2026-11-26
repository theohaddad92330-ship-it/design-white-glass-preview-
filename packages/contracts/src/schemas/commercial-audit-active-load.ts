import { z } from 'zod'
import { PROTECTED_SLOT_CAPACITY, WEEKLY_SALES_TIME_SLOTS } from './onboarding/answers-temps.js'
import { declaredEntryDoors, type AuditFrontsBudgetSignal, type AuditSignalsInput } from './commercial-audit-signals.js'
import { PROFILE_QUESTION_OPTIONS, worksThroughPartners } from './profile-questionnaire.js'

/**
 * L'ARBITRAGE DE LA CHARGE ACTIVE — #2067.2 · #2067.4 · #2067.5 · #2067.6
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI MANQUAIT, ET POURQUOI CE N'EST PAS UN CÂBLAGE
 * ─────────────────────────────────────────────────────────────────────────────
 * #2067 demande de recommander six repères de charge active. Deux avaient un
 * champ réel (#2067.1 comptes actifs, #2067.3 volume de suivi :
 * `coachingInsights.kpiTargets`, rendus par `AuditConsequences`). Les quatre
 * autres — partenaires, créneaux, réserve, éléments à reporter — n'avaient
 * AUCUN moteur, et le registre du 18/09 les laissait `retenu` : aucun champ du
 * profileur ne les mesure. Ce module tranche d'où chacun se DÉRIVE, à partir des
 * seules réponses DÉCLARÉES, et ce qui reste « non établi » (décision de
 * conception, lot H26 du 18/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS INTERDITS
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **Aucun appel au modèle.** Chaque grandeur est une dérivation PURE et
 *    déterministe des réponses, que l'on peut relire, tester et faire dire NON.
 *    Un chiffre écrit par un modèle ne se distingue plus d'un chiffre inventé
 *    une fois stocké.
 * 2. **« Non établi » n'est jamais 0** (GA-18 / GA-19). Quand une réponse manque,
 *    la grandeur rend `answerMissing` et NOMME la question à laquelle répondre
 *    (`missingAnswers`) — jamais un chiffre de repli, jamais un budget par
 *    défaut. Le contrat le refuse structurellement : les formes « non établie »
 *    sont `.strict()`, elles ne peuvent PAS porter de nombre.
 * 3. **Aucune probabilité, aucun taux, aucun critère protégé.** Rien ici n'est
 *    une chance, une conversion ou un prévisionnel pondéré (refusé six fois) ;
 *    rien ne lit l'âge, le genre, l'origine ou l'adresse d'une personne — seules
 *    entrent des réponses sur l'ACTIVITÉ commerciale.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE SOCLE COMMUN : LE BUDGET DE FRONTS (#2050.14), LU, JAMAIS RECALCULÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * « Moins de temps = moins de dossiers simultanés, pas davantage
 * d'automatisation. » Le budget `maxFronts` existe déjà : il est tiré du temps
 * PROTÉGÉ déclaré (`weekly_sales_time_protected`, `onboarding/answers-temps.ts:98`,
 * l'annoncé `:95` à défaut) par la table `AUDIT_MAX_FRONTS_BY_WEEKLY_BAND`
 * (`commercial-audit-signals.ts:261`). Ce module le REÇOIT
 * (`buildAuditDeclaredSignals(…).frontsBudget`) — une seconde table serait un
 * second moteur (GA-26).
 *
 * L'HYPOTHÈSE, dite à l'écran avec la règle : **chaque porte d'entrée que la
 * personne tient ouverte compte pour UN front.** Les portes sont
 * `go_to_market_channels` (`onboarding/answers-profil.ts:40`), lues par
 * `declaredEntryDoors` — la MÊME lecture que la combinaison de voies (#2066.27,
 * « une combinaison LIMITÉE, pas tout garder actif »).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES QUATRE GRANDEURS — ENTRÉES, RÈGLE, CE QUI LES REND « NON ÉTABLIES »
 * ─────────────────────────────────────────────────────────────────────────────
 * #2067.2 — PARTENAIRES À TRAVAILLER · règles `partnerDoorsDeclared` /
 *   `regularPartnersDeclared`
 *   Entrées : `go_to_market_channels` (`answers-profil.ts:40`), porte partenaire
 *   reconnue par `worksThroughPartners` (`profile-questionnaire.ts`, le prédicat
 *   qui ouvre déjà `partner_relationship`) ; puis `partners_regular_count` et
 *   `partners_occasional_count` (`answers-profil.ts`, fin du bloc), la question
 *   « avec combien de partenaires travailles-tu réellement aujourd'hui ? »
 *   AJOUTÉE par décision de Louis du 18/09/2026 — le lot H26 avait montré
 *   qu'aucune réponse ne permettait d'établir ce nombre sans l'inventer.
 *   - aucune porte partenaire parmi des portes toutes nommées → `noPartnerDoor` :
 *     aucun partenaire dans la charge active, et on dit pourquoi ;
 *   - une porte partenaire ET un nombre de réguliers déclaré → `regularPartners` :
 *     les partenaires RÉGULIERS forment la charge active (verbatim du catalogue,
 *     « 0 » compris : un zéro déclaré est vrai) ; les PONCTUELS sont cités hors
 *     d'elle, activés au besoin — jamais additionnés aux réguliers ;
 *   - une porte partenaire SANS nombre de réguliers (question passée, « Je ne
 *     sais pas », valeur hors catalogue) → `answerMissing:
 *     ['partners_regular_count']` : la question est NOMMÉE, jamais devinée ;
 *   - portes absentes, ou « Mixte » (qui peut cacher un partenaire) →
 *     `answerMissing: ['go_to_market_channels']`.
 *
 * #2067.4 — CRÉNEAUX · règle `declaredTimeSlots`
 *   Entrées : `weekly_sales_time_slots` (`answers-temps.ts:105`, catalogue
 *   `WEEKLY_SALES_TIME_SLOTS` `:47`) ; `protected_slot_capacity` (`:111`), cité.
 *   Les créneaux à tenir sont les plages où le temps tombe DÉJÀ, verbatim, dans
 *   l'ordre du catalogue — aucune plage n'est proposée à la place de la
 *   personne. « Au fil de l'eau » n'est jamais un créneau (`noRegularSlot`) ;
 *   une valeur hors catalogue ne se devine pas. Rien de déclaré →
 *   `answerMissing: ['weekly_sales_time_slots']`.
 *
 * #2067.5 — RÉSERVE · règle `budgetMinusDoors`
 *   `réserve = maxFronts − portes ouvertes`, en fronts laissés LIBRES — c'est
 *   eux qui absorbent l'imprévu, à condition de ne pas les remplir. Portes ≥
 *   budget → `noReserve`, jamais un nombre négatif. Les réponses qui érodent le
 *   temps (`protected_slot_capacity`, `workload_variability`, `answers-temps.ts:
 *   109-111`) sont CITÉES à côté, jamais converties en malus : la règle du
 *   budget (`AUDIT_TIME_EROSION_ANSWERS`, `commercial-audit-signals.ts:271`) le
 *   dit déjà, et un malus caché serait un second barème.
 *   Budget non déclaré → `answerMissing: ['weekly_sales_time_protected']` ;
 *   portes absentes ou non comptables → `… 'go_to_market_channels'`.
 *
 * #2067.6 — ÉLÉMENTS À REPORTER · règle `doorsMinusBudget`
 *   `à reporter = portes ouvertes − maxFronts` : COMBIEN reporter, et PARMI
 *   QUELLES portes (toutes celles déclarées). LESQUELLES reste le choix de la
 *   personne : aucune réponse ne dit quelle porte rapporte le plus, et en
 *   choisir une serait un classement inventé. « Aucune heure » est un zéro
 *   DÉCLARÉ (budget 0) : tout ce qui est ouvert se reporte. Mêmes absences que
 *   la réserve.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUI N'ENTRE PAS, À DESSEIN
 * ─────────────────────────────────────────────────────────────────────────────
 * - `competing_workloads` (`answers-temps.ts:107`, les responsabilités qui
 *   prennent le reste du temps) : elles sont DÉJÀ dans le temps protégé que la
 *   personne déclare. Les retrancher une seconde fois serait un malus inventé.
 * - `portfolio_size` (`answers-profil.ts:31`) : une bande, pas un compte ; une
 *   réserve de COMPTES tirée d'une bande moins un objectif mensuel écrit par le
 *   modèle mélangerait un déclaré et un généré — le chiffre faux par excellence.
 *
 * Appelants : `apps/web/src/features/commercial-audit/lib/build-audit.ts`
 * (`buildCommercialAudit` → `activeLoad` et `unestablished`), rendu par
 * `AuditActiveLoad.tsx` ; la parité démo exécute cette même fonction
 * (`apps/api/src/modules/demo/demo-audit-active-load-coverage.spec.ts`).
 */

/** Les quatre réponses que l'arbitrage peut NOMMER comme manquantes — aucune autre. */
export const AUDIT_ACTIVE_LOAD_ANSWER_KEYS = [
  'weekly_sales_time_protected',
  'weekly_sales_time_slots',
  'go_to_market_channels',
  // #2067.2 — décision Louis du 18/09/2026.
  'partners_regular_count',
] as const
type AuditActiveLoadAnswerKey = (typeof AUDIT_ACTIVE_LOAD_ANSWER_KEYS)[number]

/** « Non établi » : la liste NON VIDE des questions auxquelles répondre, et rien d'autre. */
const answerMissingSchema = z
  .object({
    kind: z.literal('answerMissing'),
    missingAnswers: z.array(z.enum(AUDIT_ACTIVE_LOAD_ANSWER_KEYS)).min(1),
  })
  .strict()

const doorList = z.array(z.string().min(1)).min(1)
const frontCount = z.number().int().min(0)

const auditActiveLoadPartnersSchema = z.discriminatedUnion('kind', [
  answerMissingSchema,
  z.object({ kind: z.literal('noPartnerDoor'), rule: z.literal('partnerDoorsDeclared'), doors: doorList }).strict(),
  z
    .object({
      kind: z.literal('regularPartners'),
      rule: z.literal('regularPartnersDeclared'),
      /** Le nombre de partenaires RÉGULIERS déclaré, verbatim du catalogue (« 0 » compris). */
      regular: z.string().min(1),
      /** Les PONCTUELS, cités hors de la charge active — `null` s'ils ne sont pas dits. */
      occasional: z.string().min(1).nullable(),
      partnerDoors: doorList,
    })
    .strict(),
])

const auditActiveLoadSlotsSchema = z.discriminatedUnion('kind', [
  answerMissingSchema,
  z
    .object({
      kind: z.literal('slots'),
      rule: z.literal('declaredTimeSlots'),
      slots: z.array(z.string().min(1)).min(1),
      /** Ce que la personne dit de la tenue de ses créneaux, verbatim — `null` si elle ne l'a pas dit. */
      holding: z.string().min(1).nullable(),
    })
    .strict(),
  z.object({ kind: z.literal('noRegularSlot'), rule: z.literal('declaredTimeSlots') }).strict(),
])

const auditActiveLoadReserveSchema = z.discriminatedUnion('kind', [
  answerMissingSchema,
  z
    .object({
      kind: z.literal('reserve'),
      rule: z.literal('budgetMinusDoors'),
      freeFronts: z.number().int().min(1),
      maxFronts: frontCount,
      doorCount: z.number().int().min(1),
      erosionRisks: z.array(z.string()),
    })
    .strict(),
  z
    .object({
      kind: z.literal('noReserve'),
      rule: z.literal('budgetMinusDoors'),
      maxFronts: frontCount,
      doorCount: z.number().int().min(1),
      erosionRisks: z.array(z.string()),
    })
    .strict(),
])

const auditActiveLoadDeferredSchema = z.discriminatedUnion('kind', [
  answerMissingSchema,
  z
    .object({
      kind: z.literal('toDefer'),
      rule: z.literal('doorsMinusBudget'),
      count: z.number().int().min(1),
      maxFronts: frontCount,
      /** TOUTES les portes déclarées : lesquelles reporter reste le choix de la personne. */
      candidates: doorList,
    })
    .strict(),
  z
    .object({
      kind: z.literal('nothingToDefer'),
      rule: z.literal('doorsMinusBudget'),
      maxFronts: frontCount,
      doorCount: z.number().int().min(1),
    })
    .strict(),
])

export const auditActiveLoadSchema = z.object({
  /** #2067.2 */
  partners: auditActiveLoadPartnersSchema,
  /** #2067.4 */
  slots: auditActiveLoadSlotsSchema,
  /** #2067.5 */
  reserve: auditActiveLoadReserveSchema,
  /** #2067.6 */
  deferred: auditActiveLoadDeferredSchema,
})
export type AuditActiveLoad = z.infer<typeof auditActiveLoadSchema>

/** « Je ne sais pas » n'est pas un nombre : l'absence de mesure, jamais 0. */
const PARTNER_COUNT_UNKNOWN = 'Je ne sais pas'
const PARTNER_COUNTS: readonly string[] = PROFILE_QUESTION_OPTIONS.partners_regular_count.filter(
  value => value !== PARTNER_COUNT_UNKNOWN,
)

/** Un nombre de partenaires DÉCLARÉ du catalogue, ou `null` — jamais deviné. */
function partnerCount(value: string | null | undefined): string | null {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return PARTNER_COUNTS.includes(trimmed) ? trimmed : null
}

const NO_REGULAR_SLOT: string = WEEKLY_SALES_TIME_SLOTS[6]
const NAMED_SLOTS: readonly string[] = WEEKLY_SALES_TIME_SLOTS.filter(slot => slot !== NO_REGULAR_SLOT)
const SLOT_HOLDING_ANSWERS: readonly string[] = PROTECTED_SLOT_CAPACITY

function declaredValues(values: readonly string[] | null | undefined): Set<string> {
  return new Set((values ?? []).filter(value => typeof value === 'string').map(value => value.trim()))
}

function missing(...keys: (AuditActiveLoadAnswerKey | null)[]) {
  return {
    kind: 'answerMissing' as const,
    missingAnswers: keys.filter((key): key is AuditActiveLoadAnswerKey => key !== null),
  }
}

/**
 * La SEULE dérivation de l'arbitrage (GA-26). Pure : mêmes réponses, même objet.
 *
 * @param input les réponses du questionnaire ; `null` = aucune n'a pu être lue,
 *   et les quatre grandeurs sont alors non établies — jamais 0.
 * @param frontsBudget le budget DÉJÀ dérivé par `buildAuditDeclaredSignals`
 *   (#2050.14) ; `null`/`notDeclared` = temps protégé non déclaré.
 */
export function buildAuditActiveLoad(
  input: AuditSignalsInput | null | undefined,
  frontsBudget: AuditFrontsBudgetSignal | null | undefined,
): AuditActiveLoad {
  const { doors, countable } = declaredEntryDoors(input ?? {})
  const budget = frontsBudget?.kind === 'measured' ? frontsBudget : null

  // #2067.2 — une porte partenaire nommée suffit à dire « il y a des
  // partenaires » ; seule l'absence CERTAINE (portes toutes nommées) dit « aucun ».
  // #2067.2 (décision Louis du 18/09/2026) — derrière une porte partenaire, le
  // nombre DÉCLARÉ de partenaires réguliers ; sans lui, la question est nommée.
  const partnerDoors = doors.filter(door => worksThroughPartners({ go_to_market_channels: [door] }))
  const regular = partnerCount(input?.partners_regular_count)
  const partners: AuditActiveLoad['partners'] =
    partnerDoors.length > 0
      ? regular !== null
        ? {
            kind: 'regularPartners',
            rule: 'regularPartnersDeclared',
            regular,
            occasional: partnerCount(input?.partners_occasional_count),
            partnerDoors,
          }
        : missing('partners_regular_count')
      : countable
        ? { kind: 'noPartnerDoor', rule: 'partnerDoorsDeclared', doors }
        : missing('go_to_market_channels')

  // #2067.4 — les plages déclarées, verbatim, dans l'ordre du catalogue.
  const declaredSlots = declaredValues(input?.weekly_sales_time_slots)
  const namedSlots = NAMED_SLOTS.filter(slot => declaredSlots.has(slot))
  const holdingAnswer = input?.protected_slot_capacity?.trim() ?? ''
  const slots: AuditActiveLoad['slots'] =
    namedSlots.length > 0
      ? {
          kind: 'slots',
          rule: 'declaredTimeSlots',
          slots: namedSlots,
          holding: SLOT_HOLDING_ANSWERS.includes(holdingAnswer) ? holdingAnswer : null,
        }
      : declaredSlots.has(NO_REGULAR_SLOT)
        ? { kind: 'noRegularSlot', rule: 'declaredTimeSlots' }
        : missing('weekly_sales_time_slots')

  // #2067.5 / #2067.6 — les deux faces de la MÊME soustraction, jamais l'une
  // sans l'autre : ce qui reste du budget, ou ce qui le dépasse.
  if (budget === null || !countable) {
    const absent = missing(
      budget === null ? 'weekly_sales_time_protected' : null,
      countable ? null : 'go_to_market_channels',
    )
    return { partners, slots, reserve: absent, deferred: absent }
  }
  const maxFronts = budget.maxFronts
  const doorCount = doors.length
  const erosionRisks = [...budget.erosionRisks]
  const reserve: AuditActiveLoad['reserve'] =
    maxFronts > doorCount
      ? {
          kind: 'reserve',
          rule: 'budgetMinusDoors',
          freeFronts: maxFronts - doorCount,
          maxFronts,
          doorCount,
          erosionRisks,
        }
      : { kind: 'noReserve', rule: 'budgetMinusDoors', maxFronts, doorCount, erosionRisks }
  const deferred: AuditActiveLoad['deferred'] =
    doorCount > maxFronts
      ? { kind: 'toDefer', rule: 'doorsMinusBudget', count: doorCount - maxFronts, maxFronts, candidates: doors }
      : { kind: 'nothingToDefer', rule: 'doorsMinusBudget', maxFronts, doorCount }
  return { partners, slots, reserve, deferred }
}
