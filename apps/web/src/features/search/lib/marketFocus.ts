import type { MarketPreview } from '@bellum/contracts'
import { matchingExpertises } from '@bellum/contracts'

/**
 * #1591.1 / #1592.2 — CE QUE LA MÉMOIRE MARCHÉ CHANGE À L'ÉCRAN DE LANCEMENT.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE FICHIER DÉRIVE, IL N'AFFICHE PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * Toute la décision — quelle expertise est recommandée, quel périmètre se
 * conseille, et surtout QUAND on ne dit rien — vit ici, pure et testée. Les
 * composants rendent ce qu'on leur donne. C'est le même découpage que
 * `accountsPortfolioTiles.ts`, et pour la même raison : une condition glissée
 * dans du JSX est la façon exacte dont une observation redevient une
 * affirmation.
 *
 * ⚠️ L'APPARIEMENT NE VIT PAS ICI. `matchingExpertises` est le même code que
 * celui du portefeuille (`@bellum/contracts`) : il a été DÉPLACÉ depuis l'API
 * pour ce lot, pas recopié. Un second appariement écrit côté web aurait
 * ré-appris que `C#` et `Go` sont des noms courts et pas des mots vides.
 */

/** Une expertise déclarée du Profil ESN, et si le corpus la retrouve ici. */
type FocusSuggestion = {
  readonly label: string
  /** Vrai seulement si un compte est sélectionné ET que la mémoire le retrouve. */
  readonly recommended: boolean
}

/**
 * Les expertises déclarées, marquées de ce que le corpus retrouve sur CE compte.
 *
 * ⚠️ **Sans preview, rien n'est recommandé** — et ce n'est pas une précaution,
 * c'est le sens du mot. Une expertise marquée « Recommandé » sur la seule foi
 * du profil déclaré ferait lire une préférence de l'ESN comme une observation
 * de marché : exactement l'inversion que #1589.2 interdit ailleurs (« jamais
 * *Travaille avec* sans preuve actuelle »).
 *
 * L'ordre déclaré est conservé : la liste doit rester celle que l'utilisateur
 * a saisie, pour qu'il reconnaisse ce qu'on marque.
 */
export function focusSuggestions(
  declared: readonly string[],
  preview: MarketPreview | null | undefined,
): FocusSuggestion[] {
  const observed = preview ? [...preview.observed_stack, ...preview.role_families] : []
  const matched = new Set(matchingExpertises(observed, declared))
  return declared.map(label => ({ label, recommended: matched.has(label) }))
}

/**
 * #1593.2 — LE DÉPARTAGE DES PREMIERS COMPTES SUGGÉRÉS.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UN DÉPARTAGE, PAS UN SECOND SCORE
 * ─────────────────────────────────────────────────────────────────────────────
 * L'issue énumère cinq critères. Trois d'entre eux — compatibilité au Profil
 * ESN, secteur / cible, proximité avec une référence existante — sont DÉJÀ
 * dans le calcul serveur qui produit ces suggestions. Les recalculer ici ferait
 * vivre la même dérivation à deux endroits, et deux endroits divergent.
 *
 * Ce qui manquait, et que ce lot ajoute, c'est le seul critère que le serveur
 * ne connaissait pas : est-ce que la mémoire marché COUVRE cette entreprise.
 * On ré-ordonne donc une liste déjà classée ; on n'en fabrique pas une autre.
 *
 * ⚠️ Le tri est STABLE à couverture égale : deux suggestions non couvertes
 * gardent l'ordre du serveur. Un `sort` qui les mélangerait ferait bouger
 * l'écran d'accueil à chaque rendu sans qu'aucune information n'ait changé.
 */
type RankedSuggestion<T> = {
  readonly suggestion: T
  /**
   * Parcours observés, ou `null` — non couvert, ambigu, sous le seuil, **ou
   * lecture impossible**. Un écran ne doit rien en conclure d'autre que
   * « je n'affiche pas de raison marché ».
   */
  readonly marketPaths: number | null
}

export function rankByMarketPaths<T>(
  suggestions: readonly T[],
  nameOf: (suggestion: T) => string,
  paths: Readonly<Record<string, number | null>> | undefined,
): RankedSuggestion<T>[] {
  const ranked = suggestions.map(suggestion => ({
    suggestion,
    // `undefined` (pas encore lu, ou lecture en panne) et `null` (lu, non
    // couvert) se rendent pareil ICI — dans les deux cas il n'y a pas de raison
    // marché à afficher. Ce qui ne doit jamais arriver, c'est un `0`.
    marketPaths: paths?.[nameOf(suggestion)] ?? null,
  }))
  // `sort` de JS est stable depuis ES2019 : les non-couvertes gardent l'ordre
  // du serveur, qui porte déjà secteur, cible et proximité.
  return ranked.sort((a, b) => (b.marketPaths ?? -1) - (a.marketPaths ?? -1))
}
