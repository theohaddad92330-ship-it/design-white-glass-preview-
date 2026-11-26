/**
 * LES VUES DE L'ONGLET ORGANIGRAMME — le réglage, à UN seul endroit.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE LISTE EST UN FICHIER, ET PAS UN `useState` DANS L'ONGLET
 * ─────────────────────────────────────────────────────────────────────────
 * Cinq vues, un défaut, et un ordre : trois décisions. Écrites dans le JSX du
 * sélecteur, elles seraient recopiées le jour où quelqu'un ajoute un raccourci
 * ailleurs — et les deux listes divergeraient. « Un réglage vit à un seul
 * endroit » (GA-26) : la liste, l'ordre et le défaut sont ici, et le sélecteur
 * comme le routage de rendu les LISENT.
 *
 * ⚠️ **L'ORDRE est la décision, pas seulement le contenu.** `hierarchy` (l'arbre)
 * est en tête ET c'est le défaut depuis le 23/10/2026 (Louis, refonte Théo). Le
 * FINAL du 27/08 avait tranché pour la vue focale ; elle reste commutable, plus
 * première.
 */
export const ORG_VIEW_MODES = ['hierarchy', 'focal', 'group', 'edit', 'system'] as const

export type OrgViewMode = (typeof ORG_VIEW_MODES)[number]

/**
 * L'écran d'arrivée. ⚠️ Renversement ASSUMÉ et daté du 23/10/2026 (Louis, refonte Théo) de la décision 3 du FINAL du
 * 27/08 : l'organigramme est un vrai sous-onglet plein écran, EN ARBRE — la Hiérarchie arrive en tête, la vue focale
 * reste à un clic. Rien n'est supprimé : les cinq vues et leurs gestes sont intacts.
 */
export const DEFAULT_ORG_VIEW_MODE: OrgViewMode = 'hierarchy'

/**
 * #2121.2 — LE SÉLECTEUR NE PROPOSE QUE TROIS VUES : Influence / Hiérarchie /
 * Entités. QCM Louis 15/09/2026 (revirement assumé du 31/08) : « édition » et
 * « système » sortent du SÉLECTEUR, mais restent des `OrgViewMode` valides —
 * leurs gestes vivent ailleurs, ils ne disparaissent pas :
 *
 *   · `edit` — le tiroir de correction (`OrgCorrectionDrawer`) est déjà
 *     accroché à chaque carte des trois vues restantes (`PERSON_GESTURES`,
 *     `FocalOrgView.tsx`) : un onglet dédié à la même action était la même
 *     chose deux fois (GA-26) ;
 *   · `system` — la carte structurelle du groupe entier reste à un clic,
 *     depuis le bouton « Voir l'influence sur tout le groupe »
 *     (`focal.systemView`) DANS la vue Influence, pas depuis un onglet de plus.
 *
 * `ORG_VIEW_MODES` reste la liste COMPLÈTE des états valides (le routage de
 * `TabOrganigramme` les gère tous) ; `ORG_VIEW_TABS` est le sous-ensemble
 * ORDONNÉ que le sélecteur affiche — un seul endroit pour les deux listes
 * (GA-26), la seconde dérivée de la première, jamais recopiée ailleurs.
 */
export const ORG_VIEW_TABS = ORG_VIEW_MODES.filter(
  (mode): mode is Exclude<OrgViewMode, 'edit' | 'system'> => mode !== 'edit' && mode !== 'system',
)
