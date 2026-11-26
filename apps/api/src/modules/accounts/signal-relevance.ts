import type { AnalysisProfileData, SignalKind } from '@bellum/contracts'

/**
 * #2040.17 — CE QUE LES RÉPONSES CHANGENT À LA NATURE DES SIGNAUX.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE ÇA CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * La Veille rend TOUS les signaux d'achat du portefeuille, classés par score du
 * compte puis par date. Deux ESN aux métiers opposés — l'une qui place des
 * consultants dès qu'un poste s'ouvre, l'autre qui vend du forfait via des
 * partenaires — lisaient donc exactement la même liste dans le même ordre,
 * alors que le questionnaire leur avait demandé, à toutes les deux, comment
 * elles répondent à un besoin.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE MODULE FAIT, ET CE QU'IL NE FAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Il DÉSIGNE les natures de signal (`recent_signals[].type`, l'énumération
 * `SignalKind`) que les réponses rendent décisives, et la Veille les fait
 * remonter. Il ne SUPPRIME rien : un signal d'une autre nature reste dans la
 * liste, derrière — une ESN qui recrute pour ses clients veut voir les postes
 * d'abord, pas être privée des acquisitions.
 *
 * Il n'invente aucune nature : le vocabulaire est exactement celui que
 * l'analyse produit (`signalKindSchema`). Et il ne dit rien quand le
 * questionnaire ne dit rien — profil muet ⇒ ensemble vide ⇒ ordre identique à
 * celui d'avant ce point.
 */

/**
 * Les modes de staffing du questionnaire (`staffing_modes`, options de
 * `ESN_ANSWER_OPTIONS`) et la nature de signal que CHACUN rend décisive.
 *
 * Chaque ligne se justifie en une phrase — c'est la condition pour qu'un jour
 * on puisse la discuter plutôt que la deviner :
 *
 *  - « Recrutement après besoin » : l'ESN recrute UNE FOIS le besoin gagné. Un
 *    poste ouvert chez le client est donc le déclencheur exact de son métier,
 *    et un projet annoncé en est l'amont.
 *  - « Sous-traitance » et « Partenaires » : l'ESN répond par un tiers. Ce qui
 *    la concerne d'abord, ce sont les mouvements d'écosystème autour du compte.
 *  - « Nearshore » : l'ESN vend du volume délocalisé, donc un PROJET, jamais un
 *    poste unitaire.
 *
 * Les clés sont normalisées (minuscules, sans accents) — l'option est un
 * libellé humain, et un libellé se compare normalisé ou pas du tout.
 */
const KINDS_BY_STAFFING_MODE: Readonly<Record<string, readonly SignalKind[]>> = {
  'recrutement apres besoin': ['recrutement', 'projet'],
  'sous traitance': ['partenariat'],
  partenaires: ['partenariat'],
  nearshore: ['projet'],
}

/** Minuscules, sans accents, tout le reste réduit à une espace. Même règle que
 *  `similar-scoring.ts` : un libellé d'option ne se compare pas brut. */
function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * #2040.17 — les natures de signal que LES RÉPONSES rendent décisives, sans
 * doublon et dans un ordre stable (deux réponses qui ouvrent la même nature ne
 * la dupliquent pas et ne déplacent rien).
 *
 * `recruitsForClients` (« recrutez-vous des profils fixes POUR vos clients ? »)
 * ouvre `recrutement` à lui seul : dans ce mode, l'ouverture de poste n'est pas
 * un indice du besoin, elle EST le besoin.
 */
export function decisiveSignalKinds(profile: AnalysisProfileData): SignalKind[] {
  const decisive: SignalKind[] = []
  const add = (kind: SignalKind): void => {
    if (!decisive.includes(kind)) decisive.push(kind)
  }

  if (profile.recruitsForClients === true) add('recrutement')
  for (const mode of profile.staffingModes ?? []) {
    for (const kind of KINDS_BY_STAFFING_MODE[normalize(mode)] ?? []) add(kind)
  }

  return decisive
}

/**
 * #2040.17 — la liste remontée : les natures décisives d'abord, l'ordre
 * existant conservé DANS chaque groupe (partition stable) et entre les autres.
 *
 * Aucune nature décisive ⇒ la liste est rendue telle quelle, sans
 * réordonnancement : un espace qui n'a pas répondu lit exactement la liste
 * d'avant. Un signal dont la nature est absente ou libre n'est jamais remonté —
 * une nature inconnue n'est pas une nature qui matche.
 */
export function orderSignalsByDecisiveKinds<T extends { type?: string | null }>(
  items: readonly T[],
  decisive: readonly SignalKind[],
): T[] {
  if (decisive.length === 0 || items.length === 0) return [...items]
  const wanted = new Set<string>(decisive.map(kind => normalize(kind)))
  const first: T[] = []
  const rest: T[] = []
  for (const item of items) {
    const kind = typeof item.type === 'string' ? normalize(item.type) : ''
    ;(kind.length > 0 && wanted.has(kind) ? first : rest).push(item)
  }
  return [...first, ...rest]
}
