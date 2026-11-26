/**
 * Les deux A/B du chatbot public — « A/B tests du premier message » et « A/B
 * tests du timing 8 s / 15 s / scroll » (§11, P1 du rapport du 17/08/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS DÉCISIONS, ET LEUR RAISON
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **L'affectation est CALCULÉE, pas tirée.** Un `Math.random()` par
 *    chargement donnerait au même visiteur une variante différente à chaque
 *    page : il verrait Laura s'ouvrir à 8 s puis à 15 s, et la mesure
 *    compterait deux expositions pour une personne. On hache donc
 *    `expérience:visiteur` — même visiteur, même variante, sans rien stocker
 *    côté serveur et sans un seul aller-retour réseau.
 *
 * 2. **Le seuil de lecture est NOMMÉ et rendu avec le résultat.** Un A/B lu trop
 *    tôt est pire que pas d'A/B : il fige une décision sur du bruit, avec
 *    l'autorité d'un chiffre. Tant qu'une seule variante est sous le seuil,
 *    le verdict est « non concluant » — et l'écran affiche combien
 *    d'expositions il manque, pour que l'attente soit une information et non un
 *    silence.
 *
 * 3. **Aucune probabilité n'est exposée.** Ni p-value, ni « 87 % de chances que
 *    B gagne ». La doctrine du dépôt refuse d'afficher une probabilité (elle a
 *    été refusée six fois), et un chiffre de confiance sur un tableau de bord
 *    commercial se lit comme une promesse. Ce qui est rendu : les taux
 *    OBSERVÉS, leurs dénominateurs, et le seuil. Le mot « gagnant » n'apparaît
 *    nulle part — `bestObserved` se lit « meilleur taux observé ».
 */

import type { ChatbotAnalyticsEvent } from './chatbot-funnel.js'

export type ChatbotExperimentId = 'first_message' | 'open_timing'

export type ChatbotExperiment = {
  id: ChatbotExperimentId
  /**
   * Les variantes, la RÉFÉRENCE en premier.
   *
   * L'ordre porte une garantie : c'est la variante rendue quand on ne sait pas
   * à qui on parle (pas d'identifiant de visiteur, stockage local refusé). Un
   * visiteur non identifiable voit donc le comportement historique, jamais une
   * variante expérimentale choisie par défaut.
   */
  variants: readonly string[]
  /** Les événements qui comptent le DÉNOMINATEUR. */
  exposure: readonly ChatbotAnalyticsEvent[]
  /** L'événement qui compte le NUMÉRATEUR. */
  success: ChatbotAnalyticsEvent
}

export const CHATBOT_EXPERIMENTS: readonly ChatbotExperiment[] = [
  {
    id: 'first_message',
    // `warm` est le message d'accueil historique ; `concrete` ouvre sur ce que
    // le produit change, sans question. Deux variantes et pas trois : à trois,
    // il faut 50 % d'échantillon en plus pour la même lecture.
    variants: ['warm', 'concrete'],
    exposure: ['chat_opened', 'chat_auto_opened'],
    // Le bon succès d'un premier message est que le visiteur RÉPONDE. Compter
    // les démos mesurerait la suite de la conversation, pas la phrase testée.
    success: 'chat_first_reply',
  },
  {
    id: 'open_timing',
    variants: ['at8s', 'at15s', 'onScroll'],
    // Tout visiteur qui voit le widget est affecté, qu'il finisse ou non par
    // voir une ouverture : les pages silencieuses (mentions légales, tarifs
    // d'exception) diluent les trois variantes à l'identique, donc la
    // comparaison reste juste. Compter l'exposition à l'OUVERTURE, elle,
    // reviendrait à comparer trois variantes sur leur propre effet.
    exposure: ['chat_widget_viewed'],
    success: 'chat_first_reply',
  },
]

export function chatbotExperiment(id: ChatbotExperimentId): ChatbotExperiment | null {
  return CHATBOT_EXPERIMENTS.find(experiment => experiment.id === id) ?? null
}

/**
 * Le seuil de lecture, par variante.
 *
 * 200 n'est pas un chiffre rond choisi pour faire sérieux. C'est la taille
 * d'échantillon d'une comparaison de deux proportions à 5 % de risque bilatéral
 * et 80 % de puissance, pour distinguer 10 % de 20 % :
 *
 *   n = ( 1,96·√(2·p̄·(1−p̄)) + 0,84·√(p₁(1−p₁) + p₂(1−p₂)) )² / (p₂−p₁)²
 *     = ( 1,96·√0,255 + 0,84·√0,25 )² / 0,01
 *     = ( 0,990 + 0,420 )² / 0,01  ≈ 199
 *
 * Autrement dit : sous 200 expositions par variante, un doublement du taux de
 * réponse peut parfaitement ne pas se voir — et l'écart qu'on croit lire est du
 * bruit. Le chiffre est rendu avec chaque lecture, pour qu'il se discute au lieu
 * de se subir.
 */
export const CHATBOT_EXPERIMENT_MIN_EXPOSURES = 200

/**
 * FNV-1a 32 bits.
 *
 * Choisi pour trois raisons : il tient en huit lignes, il est identique dans
 * tous les langages (l'affectation se recalcule à l'identique côté navigateur
 * comme côté back-office), et il ne demande aucune API de plateforme —
 * `crypto.subtle` est asynchrone et absent en contexte non sécurisé, ce qui
 * ferait clignoter le widget pendant l'attente.
 */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * Quelle variante ce visiteur voit-il ?
 *
 * `visitorId` vide (navigation privée, stockage refusé, premier rendu serveur)
 * rend la variante de référence : on ne fait pas participer à une expérience
 * quelqu'un dont on ne peut pas garantir qu'il verra la même chose au prochain
 * clic. Compter ce visiteur-là dans l'A/B fausserait les deux côtés.
 */
export function assignChatbotVariant(id: ChatbotExperimentId, visitorId: string): string {
  const experiment = chatbotExperiment(id)
  if (!experiment || !experiment.variants.length) return ''
  const reference = experiment.variants[0]!
  if (!visitorId) return reference
  return experiment.variants[fnv1a(`${id}:${visitorId}`) % experiment.variants.length] ?? reference
}

export type ChatbotVariantReading = {
  variant: string
  /** `null` = la source n'a pas répondu. `0` = mesuré à zéro. */
  exposures: number | null
  successes: number | null
  /** `null` dès que le dénominateur est nul ou inconnu. Jamais « 0 % ». */
  rate: number | null
  /** Combien d'expositions manquent avant de pouvoir lire. `0` = seuil atteint. */
  shortfall: number | null
}

/** `unmeasured` : on ne sait rien. `inconclusive` : on sait, et c'est trop tôt. */
export type ChatbotExperimentVerdict = 'unmeasured' | 'inconclusive' | 'readable'

export type ChatbotExperimentReading = {
  id: ChatbotExperimentId
  verdict: ChatbotExperimentVerdict
  /** Le seuil, rendu avec le résultat : une règle qu'on ne voit pas se conteste mal. */
  minExposures: number
  variants: ChatbotVariantReading[]
  /** Le MEILLEUR TAUX OBSERVÉ, jamais « le gagnant ». `null` tant que le verdict
   *  n'est pas lisible, et `null` à égalité. */
  bestObserved: string | null
}

export type ChatbotExperimentInput = {
  sourceAvailable: boolean
  exposures: Readonly<Record<string, number>>
  successes: Readonly<Record<string, number>>
}

function readCount(source: Readonly<Record<string, number>>, key: string): number {
  const value = source[key]
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 0
}

export function readChatbotExperiment(
  id: ChatbotExperimentId,
  input: ChatbotExperimentInput,
): ChatbotExperimentReading {
  const experiment = chatbotExperiment(id)
  const variants = experiment?.variants ?? []

  if (!input.sourceAvailable) {
    return {
      id,
      verdict: 'unmeasured',
      minExposures: CHATBOT_EXPERIMENT_MIN_EXPOSURES,
      variants: variants.map(variant => ({
        variant,
        exposures: null,
        successes: null,
        rate: null,
        shortfall: null,
      })),
      bestObserved: null,
    }
  }

  const readings: ChatbotVariantReading[] = variants.map(variant => {
    const exposures = readCount(input.exposures, variant)
    const successes = readCount(input.successes, variant)
    return {
      variant,
      exposures,
      successes,
      rate: exposures > 0 ? successes / exposures : null,
      shortfall: Math.max(0, CHATBOT_EXPERIMENT_MIN_EXPOSURES - exposures),
    }
  })

  const ready = readings.length >= 2 && readings.every(reading => reading.shortfall === 0)
  if (!ready) {
    return {
      id,
      verdict: 'inconclusive',
      minExposures: CHATBOT_EXPERIMENT_MIN_EXPOSURES,
      variants: readings,
      bestObserved: null,
    }
  }

  // Le meilleur taux observé — et personne à égalité parfaite. Départager deux
  // taux identiques par l'ordre de déclaration donnerait au hasard l'apparence
  // d'un résultat.
  let best: ChatbotVariantReading | null = null
  let tied = false
  for (const reading of readings) {
    if (reading.rate === null) continue
    if (!best || best.rate === null || reading.rate > best.rate) {
      best = reading
      tied = false
    } else if (reading.rate === best.rate) {
      tied = true
    }
  }

  return {
    id,
    verdict: 'readable',
    minExposures: CHATBOT_EXPERIMENT_MIN_EXPOSURES,
    variants: readings,
    bestObserved: tied || !best ? null : best.variant,
  }
}
