import { PERCENT_MIN_BASE } from '@bellum/contracts'

/**
 * L'évolution d'un chiffre d'un mois à l'autre — LA dérivation, pour tout le
 * produit.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE VIT ICI
 * ─────────────────────────────────────────────────────────────────────────────
 * Le calcul juste existait à UN endroit du dépôt : la tuile du cockpit manager,
 * qui refusait déjà d'afficher un pourcentage sans base de comparaison. Partout
 * ailleurs, une tendance se recodait — et se recodait mal, parce que le piège
 * n'est pas la division, c'est ce qu'on affiche quand elle n'a pas de sens.
 *
 * Une dérivation vit à un seul endroit (GA-26). La voici.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * QUATRE ÉTATS, ET LE QUATRIÈME EST LE PLUS FACILE À PERDRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  · `delta` — les deux termes sont mesurés et la base n'est pas nulle. Seul
 *    cas où un POURCENTAGE existe.
 *  · `noBaseline` — le mois dernier valait **zéro, et on le sait**. « +100 % »
 *    ou « +∞ % » serait un chiffre fabriqué : on écrit « rien le mois
 *    précédent », qui est la mesure.
 *  · `none` — les deux mois valent zéro. Il n'y a pas de variation à décrire.
 *  · `noSnapshot` — **on n'a PAS de mesure du mois dernier.** C'est l'état des
 *    indicateurs de STOCK avant leur première photo, et il ne se confond pas
 *    avec `noBaseline` : « rien le mois précédent » AFFIRME un zéro. Un mois
 *    qu'on n'a pas photographié n'est pas un mois à zéro — c'est exactement la
 *    règle « non mesuré n'est jamais mesuré à zéro », appliquée au temps.
 *
 * Et un cinquième cas qui n'est pas un état : `current` non mesuré rend `null`.
 * L'écran affiche déjà « non lu » pour la valeur elle-même ; y ajouter une
 * phrase sur son évolution serait parler d'un chiffre qu'on n'a pas.
 */

type TrendDescription =
  | { kind: 'noSnapshot' }
  | { kind: 'none' }
  | { kind: 'noBaseline'; current: number }
  | { kind: 'absolute'; current: number; change: number; direction: 'up' | 'down' }
  | { kind: 'delta'; current: number; percent: number; direction: 'up' | 'down' }

export function describeTrend(
  current: number | null | undefined,
  previous: number | null | undefined,
  keepPercentUnderSmallBase = false,
  /** Un STOCK compté (contacts sans adresse…) : toujours un écart absolu, jamais un pourcentage. */
  absoluteOnly = false,
): TrendDescription | null {
  if (current === null || current === undefined || !Number.isFinite(current)) return null
  if (previous === null || previous === undefined || !Number.isFinite(previous)) return { kind: 'noSnapshot' }
  if (current === 0 && previous === 0) return { kind: 'none' }
  if (previous === 0) return { kind: 'noBaseline', current }
  // Recette 14/10 : « +2612 % » sur 8 → 217. Contre une base < 10 le pourcentage ne
  // veut rien dire : le delta ABSOLU parle, jamais un pourcentage. /team garde
  // son affichage d'avant (décision Louis 14/10) : `keepPercentUnderSmallBase`.
  if (absoluteOnly || (!keepPercentUnderSmallBase && Math.abs(previous) < PERCENT_MIN_BASE)) {
    return {
      kind: 'absolute',
      current,
      change: Math.abs(current - previous),
      direction: current >= previous ? 'up' : 'down',
    }
  }

  const ratio = (current - previous) / previous
  return {
    kind: 'delta',
    current,
    // La valeur ABSOLUE : le signe voyage à part, pour que l'affichage puisse
    // le rendre lisible sans couleur (« −20 % » et non « -20 % » colorié).
    // #3544.1 : tant qu'il reste quelque chose ce mois-ci, le pourcentage ne
    // s'arrondit pas à 100 (« 6 ce mois-ci · −100 % » se contredit).
    percent:
      current > 0 && current < previous
        ? Math.min(99, Math.abs(Math.round(ratio * 100)))
        : Math.abs(Math.round(ratio * 100)),
    direction: current >= previous ? 'up' : 'down',
  }
}

/**
 * Ce que la variation veut dire pour CET indicateur.
 *
 * Sans cette question, la couleur ment une fois sur deux : « contacts sans
 * adresse : +40 % » n'est pas une bonne nouvelle, et le même vert que « vivier
 * disponible : +40 % » le ferait lire comme telle. Le défaut serait invisible
 * en revue — les deux tuiles ont le même code.
 *
 * `neutral` est le défaut : un chiffre dont on ne sait pas dire si monter est
 * bon ne se colore pas.
 */
export type TrendSense = 'moreIsBetter' | 'lessIsBetter' | 'neutral'

/**
 * Le TON d'une variation — `good`, `bad`, ou rien.
 *
 * Rendu séparément du calcul pour qu'il soit testable seul : c'est la moitié
 * qui se trompe silencieusement.
 */
export function trendTone(direction: 'up' | 'down', sense: TrendSense): 'good' | 'bad' | 'neutral' {
  if (sense === 'neutral') return 'neutral'
  const good = sense === 'moreIsBetter' ? direction === 'up' : direction === 'down'
  return good ? 'good' : 'bad'
}

/**
 * CE QU'UN COMPTEUR A LE DROIT DE DIRE DE SON ÉVOLUTION.
 *
 * Deux lots parallèles du 28/08/2026 ont chacun extrait une primitive de
 * tendance — l'un pour retirer quatre tendances FAUSSES du tableau de bord,
 * l'autre pour livrer la photo mensuelle des stocks. Chacun portait un état
 * que l'autre n'avait pas. Les voici réunis : deux rendus auraient divergé en
 * trois semaines, ce qui est exactement le défaut qu'ils corrigeaient.
 *
 *  · `measured` — deux fenêtres de la MÊME population, comptées par la MÊME
 *    dérivation. C'est le seul état où un pourcentage peut exister.
 *  · `stock` — l'état courant écrase l'ancien et RIEN ne le photographie :
 *    aucune fenêtre ne retrouvera le mois dernier, jamais. On le DIT plutôt
 *    que d'afficher un zéro qui se lirait « stable ».
 *  · `silent` — le chiffre lui-même n'a pas été compté. Promettre une
 *    évolution de ce qu'on n'a pas compté serait la même faute d'un cran plus
 *    haut.
 *
 * ⚠️ `stock` et le `noSnapshot` de {@link describeTrend} ne sont PAS la même
 * chose, et les confondre serait perdre le sens des deux : `noSnapshot` dit
 * « on n'a pas encore la photo du mois dernier » (elle viendra), `stock` dit
 * « il n'y en aura jamais ».
 */
export type TrendDisplay =
  | { state: 'measured'; current: number | null | undefined; previous: number | null | undefined }
  | { state: 'stock' }
  | { state: 'silent' }
