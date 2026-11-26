import { SIMILAR_SEED_FLOOR, type SimilarAccountSuggestion } from '@bellum/contracts'

/**
 * Sur quoi la carte « Comptes proches de ta cible » est réellement bâtie (D24).
 *
 * Le moteur s'amorce sur les comptes analysés de l'espace, jusqu'à trois
 * secteurs distincts — et **un seul suffisait** à remplir la carte. Avec une
 * seule amorce, ce qui est proposé n'est pas un voisinage de portefeuille : ce
 * sont d'autres sociétés du secteur du seul compte qu'on a regardé. La
 * proposition reste utile ; c'est son titre qui promettait davantage.
 *
 * On ne bloque rien, on ne met rien à zéro : on NOMME la base quand elle est
 * mince. Même règle que « non mesuré n'est pas mesuré à zéro », appliquée à une
 * recommandation plutôt qu'à un chiffre.
 *
 * `null` quand il n'y a rien à dire — au plafond, ou sur une réponse antérieure
 * au champ. Une mention affichée sans raison serait du bruit permanent, et un
 * bandeau permanent cesse d'être lu en trois jours.
 */
export function similarSeedCount(suggestions: readonly SimilarAccountSuggestion[]): number | null {
  for (const suggestion of suggestions) {
    // La valeur est identique sur toutes : la première renseignée fait foi.
    if (typeof suggestion.seed_count === 'number' && Number.isFinite(suggestion.seed_count)) {
      return suggestion.seed_count
    }
  }
  return null
}

/** Faut-il nommer la base ? Seulement sous le plancher, et seulement si on la connaît. */
export function shouldNameSeedBase(seedCount: number | null): seedCount is number {
  return typeof seedCount === 'number' && seedCount > 0 && seedCount < SIMILAR_SEED_FLOOR
}
