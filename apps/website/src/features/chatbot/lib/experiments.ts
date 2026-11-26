/**
 * Les deux A/B du §11 (P1) — « A/B tests du premier message » et « A/B tests du
 * timing 8 s / 15 s / scroll » — côté navigateur.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER RECOPIE LE CONTRAT AU LIEU DE L'IMPORTER
 * ─────────────────────────────────────────────────────────────────────────────
 * `@bellum/contracts` est une dépendance de DÉVELOPPEMENT du site : elle est
 * lue par les tests, pas embarquée dans le bundle. En faire une dépendance
 * d'exécution pour trois constantes changerait la chaîne de build du site
 * public pour un gain nul.
 *
 * Le risque de la recopie — deux vérités qui divergent — est traité comme le
 * reste du dépôt le traite déjà (`shipped-price-parity.test.ts`,
 * `public-sources.test.ts`) : par une GARDE qui confronte les deux.
 * `contracts-parity.test.ts` vérifie non seulement les listes, mais que les deux
 * implémentations du hachage affectent le MÊME visiteur à la MÊME variante — le
 * seul point où une divergence serait invisible et fausserait la mesure.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE L'AFFECTATION NE FAIT JAMAIS
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle ne tire pas au sort à chaque chargement. Un visiteur qui verrait Laura
 * s'ouvrir à 8 s sur l'accueil puis à 15 s sur les tarifs compterait deux
 * expositions pour une personne, dans deux variantes différentes — l'A/B
 * mesurerait alors sa propre instabilité. L'affectation est CALCULÉE à partir
 * d'un identifiant local et stable.
 */

/** Les variantes du premier message. La RÉFÉRENCE est en tête. */
export const FIRST_MESSAGE_VARIANTS = ['warm', 'concrete'] as const
type FirstMessageVariant = (typeof FIRST_MESSAGE_VARIANTS)[number]

/** Les trois moments d'ouverture du §11. */
export const OPEN_TIMING_VARIANTS = ['at8s', 'at15s', 'onScroll'] as const
export type OpenTimingVariant = (typeof OPEN_TIMING_VARIANTS)[number]

export const CHATBOT_EXPERIMENT_VARIANTS = {
  first_message: FIRST_MESSAGE_VARIANTS,
  open_timing: OPEN_TIMING_VARIANTS,
} as const

type ChatbotExperimentId = keyof typeof CHATBOT_EXPERIMENT_VARIANTS

/** FNV-1a 32 bits — le même que celui du contrat partagé, à l'octet près. */
function fnv1a(value: string): number {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash >>> 0
}

/**
 * La variante de ce visiteur pour cette expérience.
 *
 * Sans identifiant — navigation privée, stockage refusé, tout premier rendu —
 * on rend la variante de RÉFÉRENCE. On ne fait pas participer à une expérience
 * quelqu'un dont on ne peut pas garantir qu'il reverra la même chose : ce
 * visiteur-là fausserait les deux côtés de la comparaison.
 */
export function assignVariant<I extends ChatbotExperimentId>(
  id: I,
  visitorId: string,
): (typeof CHATBOT_EXPERIMENT_VARIANTS)[I][number] {
  const variants = CHATBOT_EXPERIMENT_VARIANTS[id]
  const reference = variants[0] as (typeof CHATBOT_EXPERIMENT_VARIANTS)[I][number]
  if (!visitorId) return reference
  const picked = variants[fnv1a(`${id}:${visitorId}`) % variants.length]
  return (picked ?? reference) as (typeof CHATBOT_EXPERIMENT_VARIANTS)[I][number]
}

/**
 * Un identifiant de visiteur, opaque et local.
 *
 * Il ne quitte JAMAIS le navigateur : il sert à choisir une variante, et rien
 * d'autre. Il vit dans la même clé de stockage que la mémoire de visite, donc
 * avec la même durée de trente jours et la même disparition quand le visiteur
 * vide son navigateur — il n'y a pas une seconde chose à expliquer, ni à purger.
 *
 * La source d'aléa est un PARAMÈTRE : un module qui appellerait `Math.random`
 * lui-même ne serait pas testable, et le seul test qui compte ici est qu'il ne
 * produise pas deux fois le même identifiant.
 */
export function createVisitorId(random: () => number = Math.random): string {
  const chunk = () =>
    Math.floor(random() * 0xffffffff)
      .toString(36)
      .padStart(7, '0')
  return `${chunk()}${chunk()}`.slice(0, 16)
}
