/**
 * LE COÛT DE L'INTERCONTRAT — ce que `long_bench` détecte, chiffré.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CE FICHIER EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * `long_bench` (`laura-detector.ts`) détecte déjà un consultant sans la
 * moindre affectation en cours depuis plus de 30 jours. Le message dit qu'il
 * EST en intercontrat ; il ne disait pas ce que ça COÛTE — le chiffre qui
 * déclenche l'action, pas seulement le constat.
 *
 * Le TJM et la durée sont déjà en base (`consultants.tjm`,
 * `mission_assignments.ends_on`) : ce calcul est une multiplication, à une
 * réserve près.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LE PIÈGE : « NON MESURÉ » N'EST JAMAIS « 0 »
 * ─────────────────────────────────────────────────────────────────────────
 * Un consultant dont le TJM n'a jamais été saisi n'a pas un coût d'intercontrat
 * de 0 € — il a un coût NON MESURABLE. Écrire `0 €` ici serait exactement le
 * zéro qui ment que ce dépôt corrige depuis des mois : un lecteur pressé lirait
 * « ça ne coûte rien », quand la vérité est « on n'a pas de quoi le dire ».
 * Même chose côté durée : un TJM connu sur une durée inconnue ne produit AUCUN
 * montant, jamais un montant sur zéro jour.
 *
 * Chaque cas non mesurable porte sa RAISON — `tjm_missing` ou
 * `duration_unknown` — pour que l'appelant puisse nommer le geste qui débloque
 * la mesure (saisir le TJM du consultant) plutôt que de se taire.
 */

/** Ce qu'il faut pour chiffrer un intercontrat — jamais l'entité complète. */
type BenchCostInput = {
  /** Le TJM en EUROS (`consultants.tjm`). `null` = jamais saisi. */
  tjm: number | null
  /** Le nombre de jours écoulés depuis la fin de la dernière affectation.
   *  `null` = inconnu — ne PAS confondre avec zéro jour, qui est une durée
   *  MESURÉE (le consultant vient tout juste de franchir le seuil). */
  benchDays: number | null
}

export type BenchCostResult =
  | { measurable: true; amountCents: number }
  | { measurable: false; reason: 'tjm_missing' | 'duration_unknown' }

/**
 * Le coût de l'intercontrat, en CENTIMES — l'unité du reste du domaine
 * financier (`loaded_daily_cost_cents`, `target_tjm_cents`), et non en euros
 * comme `tjm` : `tjm` est saisi et lu par tout le monde, ce montant DÉRIVÉ ne
 * l'est pas.
 *
 * Deux gardes, dans l'ordre du geste qui débloque le plus souvent le calcul :
 * un TJM absent OU CORROMPU (zéro, négatif — une donnée qui ne peut pas être
 * un tarif réel) rend `tjm_missing` en premier, même quand la durée manque
 * AUSSI — c'est le geste que l'utilisateur peut poser tout de suite. Une durée
 * absente ou négative (horloge désynchronisée, saisie erronée) rend
 * `duration_unknown` : aucun geste utilisateur ne la corrige directement, elle
 * se recalcule d'elle-même à la prochaine mesure.
 */
export function computeBenchCost(input: BenchCostInput): BenchCostResult {
  const { tjm, benchDays } = input
  if (tjm === null || tjm <= 0) return { measurable: false, reason: 'tjm_missing' }
  if (benchDays === null || benchDays < 0) return { measurable: false, reason: 'duration_unknown' }
  return { measurable: true, amountCents: Math.round(tjm * 100 * benchDays) }
}
