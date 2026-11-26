// Client for the API's chatbot-funnel endpoint (GET /internal/analytics/chatbot-funnel,
// guarded by InternalSecretGuard). Server-side only: the internal secret must
// never reach the browser. Mirrors src/lib/team-kpis.ts.
//
// Chantier n°1 (§11 du rapport « Laura, chatbot commercial du site »,
// 17/08/2026) : « les 14 événements sont ÉMIS et personne ne les lit ». Ce
// fichier ne fait AUCUN calcul — le tunnel, la qualité et les deux A/B sont
// déjà construits côté API (`buildChatbotFunnel` / `buildChatbotQuality` /
// `readChatbotExperiment`, `@bellum/contracts`) avec toute la doctrine
// (« non mesuré n'est jamais 0 », aucune probabilité). Les types ci-dessous
// ne font que redécrire la forme déjà renvoyée — même convention que
// `team-kpis.ts`, qui ne dépend pas non plus de `@bellum/contracts`.

const REAL_BASE = process.env.API_BASE_URL ?? 'http://localhost:3012'
const REAL_SECRET = process.env.INTERNAL_API_SECRET ?? ''

type ChatbotFunnelStep = 'exposed' | 'opened' | 'engaged' | 'demo' | 'booked' | 'held'

/** Les cinq étapes de #1659, dans l'ordre du parcours. */
export type ChatbotStageId = 'visitors' | 'widget_opened' | 'conversation' | 'qualified' | 'booked'

/**
 * Le taux de passage — une UNION, jamais un `number | null`.
 *
 * ⚠️ C'est ce qui rend le zéro impossible à écrire à l'écran. Un champ nullable
 * ferait écrire `taux ?? 0` au premier rendu, c'est-à-dire « 0 % de passage »
 * là où l'on ne sait rien (GA-19). Chaque branche porte de quoi écrire une
 * phrase VRAIE : « moins de N sessions », « dénominateur non mesuré », « pas
 * d'étape précédente ».
 */
export type PassRate =
  | { kind: 'measured'; ratio: number }
  | { kind: 'no_previous' }
  | { kind: 'unmeasured' }
  | { kind: 'below_threshold'; sessions: number; minSessions: number }

/** Une étape du tunnel : mesurée, ou non mesurée AVEC sa raison. */
export type ChatbotStageReading =
  | {
      stage: ChatbotStageId
      measured: true
      count: number
      sessions: number
      passRate: PassRate
      shareOfEntry: PassRate
    }
  | {
      stage: ChatbotStageId
      measured: false
      /** `not_instrumented` = rien ne l'émet, aucune clé n'y changera rien. */
      unmeasured: 'source_unavailable' | 'not_instrumented'
      passRate: PassRate
      shareOfEntry: PassRate
    }

/** La médiane du score, ou la raison NOMMÉE de son absence. */
export type MedianScore =
  | { kind: 'measured'; value: number; sessions: number }
  | { kind: 'below_threshold'; sessions: number; minSessions: number }
  | { kind: 'source_unavailable' }
  | { kind: 'not_instrumented' }

export type ChatbotFunnelReading = {
  step: ChatbotFunnelStep
  /** `null` = non mesuré. JAMAIS un zéro de remplissage. */
  count: number | null
  rateFromPrevious: number | null
  rateFromEntry: number | null
  /** `source_unavailable` = la source n'a pas répondu ; `not_observable` = rien
   *  sur le site ne peut voir cette étape (le cas de « rendez-vous tenu »). */
  unmeasured: 'source_unavailable' | 'not_observable' | null
}

type ChatbotQualityReading = {
  conversations: number | null
  handoffRate: number | null
  refusalRate: number | null
  abandonRate: number | null
}

type ChatbotVariantReading = {
  variant: string
  exposures: number | null
  successes: number | null
  rate: number | null
  /** Combien d'expositions manquent avant de pouvoir lire. `0` = seuil atteint. */
  shortfall: number | null
}

export type ChatbotExperimentReading = {
  id: 'first_message' | 'open_timing'
  /** `unmeasured` : on ne sait rien. `inconclusive` : on sait, et c'est trop
   *  tôt. `readable` : le seuil est atteint. */
  verdict: 'unmeasured' | 'inconclusive' | 'readable'
  minExposures: number
  variants: ChatbotVariantReading[]
  /** Le MEILLEUR TAUX OBSERVÉ, jamais « le gagnant » — jamais de probabilité. */
  bestObserved: string | null
}

type ChatbotFunnelOverview = {
  generatedAt: string
  /** `false` = `PLAUSIBLE_API_KEY` / `PLAUSIBLE_SITE_ID` absentes côté API :
   *  la mesure n'est pas branchée, distinct de « branchée et à zéro ». */
  configured: boolean
  period: string
  /** Le tunnel de #1659 — celui que l'écran dessine en `SegmentBar`. */
  stages: ChatbotStageReading[]
  /** La médiane du score de qualification (#1659). */
  medianScore: MedianScore
  funnel: ChatbotFunnelReading[]
  quality: ChatbotQualityReading
  experiments: ChatbotExperimentReading[]
}

export async function fetchChatbotFunnel(period?: string): Promise<ChatbotFunnelOverview> {
  const query = period ? `?period=${encodeURIComponent(period)}` : ''
  const res = await fetch(`${REAL_BASE}/internal/analytics/chatbot-funnel${query}`, {
    headers: { 'x-internal-secret': REAL_SECRET },
    cache: 'no-store',
  })
  if (!res.ok) {
    throw new Error(`Chatbot-funnel endpoint returned ${res.status} ${res.statusText}`)
  }
  return (await res.json()) as ChatbotFunnelOverview
}
