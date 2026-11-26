// Client for the API's four internal product-analytics endpoints
// (GET /internal/analytics/product-{screens,journeys,friction,demand}, guarded
// by InternalSecretGuard). Server-side only — the internal secret never reaches
// the browser. Mirrors src/lib/retention.ts.
//
// #1683/#1684/#1687/#1688 — LA LECTURE existe côté API depuis
// `product-analytics-read.service.ts` ; ce fichier n'en est que le CLIENT, il
// ne recalcule rien. Les formes ci-dessous sont un MIROIR des types exportés
// par ce service (`RapportEcrans`, `RapportParcours`, `RapportFriction`,
// `RapportDemande`) — même convention que `retention.ts` pour
// `CohorteRetention`/`RapportRetention` : les deux applications se déploient
// séparément, donc un import direct entre elles n'existe pas.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

/**
 * Les neuf natures du flux comportemental — miroir de `BEHAVIORAL_EVENT_NAMES`
 * côté API. ⚠️ Mesuré le 09/09/2026 : SEPT de ces neuf émetteurs n'ont AUCUN
 * appelant de production (seuls `screen_viewed`/`screen_left` sont câblés,
 * depuis `apps/web/src/router.tsx`). C'est la raison d'être de ce fichier et
 * de l'écran `/produit` : dire LEQUEL est instrumenté, jamais deviner.
 */
export type ProductEventName =
  | 'screen_viewed'
  | 'screen_left'
  | 'tab_opened'
  | 'action_started'
  | 'action_completed'
  | 'action_abandoned'
  | 'filter_applied'
  | 'search_performed'
  | 'error_shown'

/** Une nature d'événement, et si elle a DÉJÀ été écrite une fois — jamais si
 *  elle l'a été SUR LA FENÊTRE demandée. `false` veut dire « aucun émetteur
 *  n'a jamais écrit cette nature, tous horizons confondus » : ses agrégats
 *  sont `not_instrumented`, jamais `0`. */
export type ProductEventFamily = { event: ProductEventName; instrumented: boolean }

// ⚠️ À partir d'ici, seuls les QUATRE rapports (et les types qu'un autre
// fichier importe VRAIMENT — `ProductEventFamily`, `ProductEventName`,
// `MesureOuAbsence`, `Rate`, `MedianDuration`, `DistinctWorkspaces`) sont
// exportés. Leurs « briques » (`ScreenUsage`, `ScreenExit`…) ne sont
// consommées que dans CE fichier, TypeScript les infère très bien à travers
// les rapports — les exporter serait du bruit que `pnpm lint:exports:types`
// (knip) refuse. Même règle, même raison que côté API
// (`product-analytics-read.service.ts`, tout en haut de son bloc de types).

/** Ce que le balayage a réellement couvert. */
type Coverage = {
  windowDays: number
  /** `false` quand la borne de lignes a mordu : la fenêtre demandée n'est pas
   *  celle qui a été lue. */
  complete: boolean
  eventsScanned: number
  maxEventsScanned: number
  oldestEventAt: string | null
}

/** Une mesure publiée, ou la raison NOMMÉE de son absence sous le seuil de
 *  sessions distinctes. Ne porte PAS le cas « jamais instrumenté » — voir
 *  {@link MesureOuAbsence}, qui l'ajoute pour les agrégats qui en ont besoin. */
type PublishedMeasure<T> =
  | { kind: 'measured'; sessions: number; value: T }
  | { kind: 'below_threshold'; sessions: number; minSessions: number }

/** Un agrégat qui peut aussi n'avoir jamais été instrumenté du tout — trois
 *  états, jamais deux. C'est le cas de `interrupted`, `repetitions`, `errors`
 *  et `emptySearches` : chacun dépend d'une nature d'événement qui, au
 *  09/09/2026, n'a aucun appelant de production. */
export type MesureOuAbsence<T> = { kind: 'not_instrumented' } | PublishedMeasure<T>

/** Un taux, avec son DÉNOMINATEUR — un taux sans effectif n'est pas un taux. */
export type Rate = { kind: 'measured'; ratio: number; over: number } | { kind: 'unmeasured' }

/** Une durée médiane : un nombre, la borne haute du traceur (30 min), ou rien. */
export type MedianDuration = { kind: 'measured'; seconds: number } | { kind: 'over_30_min' } | { kind: 'unmeasured' }

/** La colonne « espaces » du flux comportemental — jamais dérivable de ce
 *  flux (`trackBehavioral()` écrit `workspace_id` à `null` inconditionnellement,
 *  règles 4 et 5 de `c64_analytique_produit`). Une seule forme existe
 *  aujourd'hui : ne JAMAIS y substituer un compte ou un nom d'espace. */
export type DistinctWorkspaces = { kind: 'not_derivable'; reason: string }

type ScreenUsage = {
  /** Le MOTIF de route, jamais un chemin concret. */
  route: string
  label: { fr: string; en: string }
  nature: 'produit' | 'public' | 'technique'
  views: number
  /** Sessions DISTINCTES ayant ouvert cet écran. Toujours rendu. */
  sessions: number
  measures:
    | { kind: 'below_threshold'; minSessions: number }
    | {
        kind: 'measured'
        viewsPerWeek: number
        medianDuration: MedianDuration
        bounceRate: Rate
        actionRate: Rate
      }
}

export type RapportEcrans = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  distinctWorkspaces: DistinctWorkspaces
  screens: ScreenUsage[]
  unresolvedPaths: number
  notes: string[]
}

type ScreenExit = {
  route: string
  label: { fr: string; en: string }
  exits: number
  sessions: number
  detail:
    | { kind: 'below_threshold'; minSessions: number }
    | {
        kind: 'measured'
        destinations: Array<{ route: string; label: { fr: string; en: string }; exits: number }>
        closeRate: Rate
        idleRate: Rate
      }
}

type Sequence = {
  routes: string[]
  labels: Array<{ fr: string; en: string }>
  sessions: number
}

type InterruptedAction = {
  action: string
  sessions: number
  startedSessions: number
  interruptionRate: Rate
}

export type RapportParcours = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  exits: PublishedMeasure<ScreenExit[]>
  sequences: PublishedMeasure<Sequence[]>
  interrupted: MesureOuAbsence<InterruptedAction[]>
  notes: string[]
}

type RepetitionFriction = { action: string; sessions: number }

type RoundTripFriction = {
  from: string
  to: string
  fromLabel: { fr: string; en: string }
  toLabel: { fr: string; en: string }
  sessions: number
}

type ErrorSeen = {
  route: string
  label: { fr: string; en: string }
  errorCode: string
  occurrences: number
  sessions: number
}

export type RapportFriction = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  repetitions: MesureOuAbsence<RepetitionFriction[]>
  roundTrips: PublishedMeasure<RoundTripFriction[]>
  errors: MesureOuAbsence<ErrorSeen[]>
  notes: string[]
}

type EmptySearch = {
  route: string
  label: { fr: string; en: string }
  searches: number
  emptySearches: number
  sessions: number
  emptyRate: Rate
}

export type RapportDemande = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  emptySearches: MesureOuAbsence<EmptySearch[]>
  notes: string[]
}

type PreparedActionChain = {
  action: string
  prepared: number
  validated: number
  executed: number
  corrected: number
  abandoned: number
  sessions: number
  executionRate: Rate
  correctionRate: Rate
}

/** #2130.73 — LA VALEUR : amorce, réponses jugées, brouillons repris, chaîne
 *  d'action, suites — miroir de `RapportValeur`
 *  (`product-analytics-read.service.ts`). Route `product-value` déjà montée
 *  côté API (#1946) : ce fichier n'en était pas le CLIENT avant ce lot, les
 *  trois autres écrans de `/produit` n'en avaient jamais eu besoin.
 *  `resultatMetier` n'est JAMAIS dérivable de ce flux (`trackBehavioral()`
 *  écrit `workspace_id` à `null` inconditionnellement, règle 5 de
 *  `c64_analytique_produit`) : nommé absent, jamais un zéro qui se lirait
 *  « ça ne produit rien ». */
export type RapportValeur = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  amorce:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{
        firstQuestionSessions: number
        firstUsefulResultSessions: number
        usefulRate: Rate
        medianTimeToUseful: MedianDuration
      }>
  reponses:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{
        judged: number
        utileRate: Rate
        generiqueRate: Rate
        inexacteRate: Rate
        dejaFaitRate: Rate
        pasMaintenantRate: Rate
        mauvaisePrioriteRate: Rate
      }>
  brouillons:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{ reused: number; telQuelRate: Rate; retoucheRate: Rate; reecritRate: Rate }>
  priorites:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{
        viewed: number
        accepted: number
        snoozed: number
        rejected: number
        corrected: number
        treatedRate: Rate
        refusalRate: Rate
      }>
  actions: { kind: 'not_instrumented' } | PublishedMeasure<PreparedActionChain[]>
  suites:
    | { kind: 'not_instrumented' }
    | PublishedMeasure<{
        suggestionClicks: number
        redirectsFollowed: number
        interventions: number
        interventionIgnoredRate: Rate
        memoriesAdded: number
        /** #4595 — mesure ARRÊTÉE le 25/10/2026 (#4513) : l'API ne l'agrège plus. Une
         *  valeur n'existe que si un ancien flux la porte encore. */
        connectorsEnabledAfterHint?: number | null
      }>
  resultatMetier: { kind: 'not_derivable'; reason: 'behavioral_flow_carries_no_workspace' }
  notes: string[]
}

type SectionFrequency = { tab: string; opens: number; sessions: number }

/**
 * #2130.71 — quelles sections du dossier compte sont ouvertes, et à quelle
 * fréquence — miroir de `RapportSectionsDossier`
 * (`product-analytics-read.service.ts`). Route `product-account-sections`
 * montée côté API dans le même lot : `tab_opened` porte déjà `{screen, tab}`
 * mais rien ne l'agrégeait avant (constat du corps de #3000).
 */
export type RapportSectionsDossier = {
  generatedAt: string
  coverage: Coverage
  families: ProductEventFamily[]
  sections: { kind: 'not_instrumented' } | PublishedMeasure<SectionFrequency[]>
  /** #2130.69 — délai médian jusqu'à la PREMIÈRE section ouverte (le premier
   *  signe observable d'exploration du dossier, pas un jalon « compréhension »
   *  inventé) — miroir de `RapportSectionsDossier.comprehension`. */
  comprehension: { kind: 'not_instrumented' } | PublishedMeasure<{ medianTimeToComprehension: MedianDuration }>
  /** #2130.74 — taux de passage Synthèse → action, parmi les vues dont la
   *  PREMIÈRE section ouverte est la Synthèse — miroir de
   *  `RapportSectionsDossier.synthesisToAction`. */
  synthesisToAction: { kind: 'not_instrumented' } | PublishedMeasure<{ conversionRate: Rate }>
  /** #2130.72 — nombre de corrections d'identité soumises (`EntityResolutionPanel.tsx`)
   *  sur le dossier compte — miroir de `RapportSectionsDossier.corrections`. */
  corrections: { kind: 'not_instrumented' } | PublishedMeasure<{ submitted: number }>
  /** #2130.75 — part des sessions du dossier qui ont engagé un contact recommandé
   *  (`contact_selected`) — miroir de `RapportSectionsDossier.engagedContacts`. */
  engagedContacts: { kind: 'not_instrumented' } | PublishedMeasure<{ engagedRate: Rate }>
  notes: string[]
}

function endpoint(path: string, days?: number): string {
  const query = typeof days === 'number' ? `?days=${days}` : ''
  return `${REAL_BASE}/internal/analytics/${path}${query}`
}

async function getJson<T>(path: string, days?: number): Promise<T> {
  const res = await fetch(endpoint(path, days), {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`${path} endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as T
}

/** #1683 — l'usage écran par écran : vues, sessions, durée, rebond, action. */
export function fetchProductScreens(days?: number): Promise<RapportEcrans> {
  return getJson<RapportEcrans>('product-screens', days)
}

/** #1684 — sorties par écran, parcours les plus fréquents, parcours interrompus. */
export function fetchProductJourneys(days?: number): Promise<RapportParcours> {
  return getJson<RapportParcours>('product-journeys', days)
}

/** #1687 — répétition, aller-retour, erreur vue. */
export function fetchProductFriction(days?: number): Promise<RapportFriction> {
  return getJson<RapportFriction>('product-friction', days)
}

/** #1688 — les recherches sans résultat, par écran. Jamais le texte cherché. */
export function fetchProductDemand(days?: number): Promise<RapportDemande> {
  return getJson<RapportDemande>('product-demand', days)
}

/**
 * #2130.73 (corrigé 23/09/2026, réfuté sur la prod 7e7105fb7) — la VALEUR :
 * amorce, réponses jugées, brouillons repris, chaîne d'action, suites.
 * La route existait côté API depuis #1946 (`product-analytics-read
 * .service.ts:1291-1292` calcule déjà `generiqueRate`/`inexacteRate`) mais
 * AUCUN appelant front ne l'atteignait — du code juste, jamais appelé.
 */
export function fetchProductValue(days?: number): Promise<RapportValeur> {
  return getJson<RapportValeur>('product-value', days)
}

/** #2130.71 — les sections du dossier compte, par fréquence d'ouverture. */
export function fetchProductAccountSections(days?: number): Promise<RapportSectionsDossier> {
  return getJson<RapportSectionsDossier>('product-account-sections', days)
}

/**
 * #4595 — la dernière valeur connue d'une mesure ARRÊTÉE, ou `null`. Une mesure
 * sans émetteur n'a plus de « 0 » à dire : absente, `null` ou 0 (le zéro d'un
 * ancien flux, indistinguable d'un « rien n'est compté ») ne sont pas une valeur
 * connue (gardes GA-18 / GA-19).
 */
export function derniereValeurConnue(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}
