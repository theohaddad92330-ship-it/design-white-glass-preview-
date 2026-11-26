/**
 * #1951.2 / #1951.3 / #1910.6 / #2589 — les six natures de dossier précis que
 * `ScopeDialog` propose. Isolée de `ScopeDialog.tsx` pour deux raisons :
 *
 * - `react-refresh/only-export-components` : un fichier de COMPOSANT
 *   n'exporte que des composants, sinon le Fast Refresh du dev server
 *   réinitialise l'état à chaque sauvegarde d'un fichier qui exporte aussi
 *   une constante.
 * - #2589 — la garde `ScopeDialog.test.tsx` (« chaque genre de PRECISE_KINDS
 *   a son panneau ») ITÈRE cette même liste : un genre ajouté ici sans son
 *   panneau (`data-testid="scope-panel-<genre>"` dans `ScopeDialog.tsx`) fait
 *   rougir la CI, exactement le défaut qui a laissé l'onglet « opportunité »
 *   mort — six onglets rendus, cinq panneaux branchés.
 *
 * L'ORDRE suit le CYCLE du produit — un besoin devient une mission, un
 * consultant y est affecté — et la mission arrive en dernier parce qu'elle
 * est la dernière des quatre à avoir été livrée : réordonner ferait bouger
 * sous les doigts l'onglet que tout le monde vise déjà.
 *
 * Théo L1 — sélecteur avancé — l'offre d'emploi s'ajoute EN FIN, pour la même
 * raison : un signal de recrutement repéré chez un compte (décision Louis 22/10).
 */
export type PreciseKind = 'account' | 'consultant' | 'need' | 'mission' | 'contact' | 'opportunity' | 'job_offer'

export const PRECISE_KINDS: readonly PreciseKind[] = [
  'account',
  'consultant',
  'need',
  'mission',
  'contact',
  'opportunity',
  'job_offer',
]
