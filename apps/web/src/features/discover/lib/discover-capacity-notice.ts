import type { EsnAnswers } from '@bellum/contracts'

/**
 * #2804 (#2291.2) — « capacité » (livraison/montée en charge), le 4ᵉ type
 * d'entrée de Découvrir resté à 0 occurrence. Tri du 25/09 : source réelle
 * inutilisée (`ramp_up_capacity`, `available_consultants_band`), mais AUCUNE
 * spécification de ce qu'un filtre ferait à la liste de résultats — l'écrire
 * sans décision aurait inventé le comportement produit, pas seulement la
 * donnée.
 *
 * LOT j3 26/09 — tranché sans Louis : « avertir » plutôt qu'exclure/
 * réordonner (moins de perte de résultats, réversible). Cette fonction ne
 * FILTRE ni ne RÉORDONNE donc jamais les comptes : elle rend le constat
 * DÉCLARÉ, verbatim, jamais interprété en bas/moyen/haut — cette lecture
 * existe déjà côté prompt IA (`sales_context.py::_bench_band`) et la
 * recopier ici dupliquerait un réglage qui vit à UN seul endroit (GA-26).
 *
 * `null` = rien de déclaré sur AUCUN des deux axes : « on n'affiche pas ce
 * qu'on n'a pas » (doctrine). Un seul axe déclaré ne rend QUE cet axe — dans
 * une liste, une absence ne fait aucune ligne (gardes GA-18/GA-19).
 */
export interface DiscoverCapacityNotice {
  rampUpCapacity?: string
  availableConsultantsBand?: string
}

export function discoverCapacityNotice(
  answers: Pick<EsnAnswers, 'ramp_up_capacity' | 'available_consultants_band'> | null | undefined,
): DiscoverCapacityNotice | null {
  const rampUpCapacity = answers?.ramp_up_capacity ?? undefined
  const availableConsultantsBand = answers?.available_consultants_band ?? undefined
  if (!rampUpCapacity && !availableConsultantsBand) return null

  const notice: DiscoverCapacityNotice = {}
  if (rampUpCapacity) notice.rampUpCapacity = rampUpCapacity
  if (availableConsultantsBand) notice.availableConsultantsBand = availableConsultantsBand
  return notice
}
