/**
 * Le tunnel de conversion du chatbot public — §9 du rapport « Laura, chatbot
 * commercial du site » (17/08/2026), et la ligne « Dashboard : page →
 * conversation → démo → Calendly → rendez-vous » de sa checklist P1.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * Les événements du §9 sont émis depuis le navigateur depuis le premier jour, et
 * PERSONNE ne les lisait : aucune occurrence de `chat_` dans le back-office. Un
 * levier qu'on ne mesure pas est un levier qu'on règle au hasard — et les cinq
 * autres chantiers du §11 (les deux A/B, la bibliothèque d'objections vivante,
 * la disponibilité humaine, la conversation qui prépare l'espace) se pilotent
 * tous depuis ce tableau-là.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUI PORTE TOUT LE MODULE
 * ─────────────────────────────────────────────────────────────────────────────
 * **Un taux sans dénominateur vaut `null`, jamais 0 %.** Et « la source n'a pas
 * répondu » n'est pas « il ne s'est rien passé ». Les deux se ressemblent à
 * l'écran et appellent des gestes opposés :
 *
 *   · « 0 % des conversations vont à la démo » → on change le message.
 *   · « on ne sait pas » → on répare la mesure.
 *
 * D'où trois états distincts, jamais deux :
 *   1. `count: number` — mesuré, y compris quand la mesure vaut zéro ;
 *   2. `count: null, unmeasured: 'source_unavailable'` — la source n'a pas
 *      répondu, on ne sait rien ;
 *   3. `count: null, unmeasured: 'not_observable'` — le site ne PEUT pas
 *      l'observer, et aucune clé d'API n'y changera rien.
 *
 * Le troisième cas a un titulaire : **« rendez-vous tenu »**. Le site voit le
 * clic vers la prise de rendez-vous ; il ne voit ni la réservation, ni la
 * présence. Le compter zéro afficherait « 0 rendez-vous tenu » à une équipe qui
 * en tient chaque semaine.
 */

/**
 * L'énumération FERMÉE des événements de mesure.
 *
 * Elle vit ici, et non dans le site seul, parce qu'elle a désormais deux
 * lecteurs : le navigateur qui les émet et le back-office qui les lit. Une
 * chaîne libre des deux côtés produirait un tableau de bord qui compte des
 * événements que plus personne n'émet — sans jamais le dire.
 */
export const CHATBOT_ANALYTICS_EVENTS = [
  'chat_widget_viewed',
  'chat_opened',
  'chat_auto_opened',
  'chat_returning_visitor',
  'chat_first_reply',
  'intent_detected',
  'qualification_started',
  'qualification_completed',
  'demo_clicked',
  'calendly_clicked',
  'lead_created',
  'human_handoff',
  'pricing_answered',
  'integration_answered',
  'chat_abandoned',
  'chat_refusal',
  /** Une objection qu'aucune entrée de la bibliothèque ne couvre (§9, « top 20
   *  des objections non couvertes »). Le THÈME voyage en propriété ; la phrase
   *  du visiteur, jamais. */
  'objection_uncovered',
  /** Le visiteur a demandé que la conversation prépare son espace. */
  'prefill_accepted',
] as const

export type ChatbotAnalyticsEvent = (typeof CHATBOT_ANALYTICS_EVENTS)[number]

/** Les étapes du tunnel, dans l'ordre où un visiteur les franchit. */
export const CHATBOT_FUNNEL_STEPS = ['exposed', 'opened', 'engaged', 'demo', 'booked', 'held'] as const

export type ChatbotFunnelStep = (typeof CHATBOT_FUNNEL_STEPS)[number]

/**
 * Quels événements alimentent chaque étape.
 *
 * `opened` en additionne DEUX : une ouverture automatique et un clic sont deux
 * façons d'arriver au même endroit, et n'en compter qu'une ferait passer le
 * réglage de l'ouverture automatique (chantier n°2) pour une perte de trafic.
 *
 * `held` n'en a AUCUN, et c'est le fait le plus important du fichier : une liste
 * vide est ce qui rend l'étape structurellement inconnue plutôt que nulle.
 */
export const CHATBOT_FUNNEL_EVENTS: Readonly<Record<ChatbotFunnelStep, readonly ChatbotAnalyticsEvent[]>> = {
  exposed: ['chat_widget_viewed'],
  opened: ['chat_opened', 'chat_auto_opened'],
  engaged: ['chat_first_reply'],
  demo: ['demo_clicked'],
  booked: ['calendly_clicked'],
  held: [],
}

/** Pourquoi une valeur manque. Jamais « une erreur » : les deux causes appellent
 *  deux gestes différents. */
export type ChatbotFunnelUnmeasured = 'source_unavailable' | 'not_observable'

export type ChatbotFunnelReading = {
  step: ChatbotFunnelStep
  /** `null` = non mesuré. JAMAIS un zéro de remplissage. */
  count: number | null
  /** Part de l'étape précédente. `null` dès que le dénominateur est nul,
   *  inconnu, ou qu'il n'y a pas d'étape précédente. */
  rateFromPrevious: number | null
  /** Part de l'entrée du tunnel (les vues du widget). */
  rateFromEntry: number | null
  unmeasured: ChatbotFunnelUnmeasured | null
}

export type ChatbotMeasurementInput = {
  /** Ce que la source a rendu, par nom d'événement. Une clé absente vaut zéro
   *  UNIQUEMENT si `sourceAvailable` est vrai. */
  counts: Readonly<Record<string, number>>
  /**
   * La source a-t-elle répondu ?
   *
   * C'est l'appelant qui le sait, et lui seul : une réponse vide d'une API
   * joignable et une API injoignable se ressemblent une fois les chiffres
   * recopiés dans un objet.
   */
  sourceAvailable: boolean
}

/** Le quotient, ou `null`. La seule division du fichier — deux endroits qui la
 *  referaient divergeraient sur la question du zéro. */
function rate(numerator: number | null, denominator: number | null): number | null {
  if (numerator === null || denominator === null) return null
  if (denominator <= 0) return null
  return numerator / denominator
}

function sumEvents(input: ChatbotMeasurementInput, events: readonly ChatbotAnalyticsEvent[]): number {
  return events.reduce((total, event) => {
    const value = input.counts[event]
    return total + (typeof value === 'number' && Number.isFinite(value) ? value : 0)
  }, 0)
}

/**
 * Le tunnel, étape par étape.
 *
 * L'ordre du tableau rendu est celui de `CHATBOT_FUNNEL_STEPS` : l'écran affiche
 * ce qu'on lui donne, il ne retrie pas.
 */
export function buildChatbotFunnel(input: ChatbotMeasurementInput): ChatbotFunnelReading[] {
  const readings: ChatbotFunnelReading[] = []
  let entry: number | null = null
  let previous: number | null = null
  let first = true

  for (const step of CHATBOT_FUNNEL_STEPS) {
    const events = CHATBOT_FUNNEL_EVENTS[step]

    // L'inobservable gagne sur la panne : une clé d'API ne fera jamais
    // apparaître un rendez-vous tenu dans les événements du navigateur.
    const unmeasured: ChatbotFunnelUnmeasured | null = !events.length
      ? 'not_observable'
      : !input.sourceAvailable
        ? 'source_unavailable'
        : null

    const count = unmeasured === null ? sumEvents(input, events) : null
    if (first) entry = count

    readings.push({
      step,
      count,
      rateFromPrevious: first ? null : rate(count, previous),
      rateFromEntry: rate(count, entry),
      unmeasured,
    })

    previous = count
    first = false
  }

  return readings
}

/**
 * Les lectures de qualité du §9 — « taux de questions résolues sans handoff »,
 * « abandon », « taux de refus/injections ».
 *
 * Toutes rapportées au nombre de CONVERSATIONS et non au nombre de vues : un
 * refus sur mille passages ne dit rien, un refus sur dix conversations dit
 * quelque chose. Le dénominateur est rendu avec les taux pour que l'écran ne
 * puisse pas afficher un pourcentage nu.
 */
export type ChatbotQualityReading = {
  conversations: number | null
  handoffRate: number | null
  refusalRate: number | null
  abandonRate: number | null
}

export function buildChatbotQuality(input: ChatbotMeasurementInput): ChatbotQualityReading {
  if (!input.sourceAvailable) {
    return { conversations: null, handoffRate: null, refusalRate: null, abandonRate: null }
  }

  const conversations = sumEvents(input, ['chat_first_reply'])
  return {
    conversations,
    handoffRate: rate(sumEvents(input, ['human_handoff']), conversations),
    refusalRate: rate(sumEvents(input, ['chat_refusal']), conversations),
    abandonRate: rate(sumEvents(input, ['chat_abandoned']), conversations),
  }
}
