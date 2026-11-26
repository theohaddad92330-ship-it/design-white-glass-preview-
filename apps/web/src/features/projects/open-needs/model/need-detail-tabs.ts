/**
 * #2175.1-.6, .41 — RÉDUIRE LES SIX ONGLETS DE LA FICHE BESOIN À QUATRE
 * FAMILLES VISIBLES, SANS PERDRE LES CINQ DEEP LINKS HISTORIQUES.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI UNE SEULE DÉRIVATION (GA-26)
 * ─────────────────────────────────────────────────────────────────────────────
 * `NeedDetailPage.tsx` portait six clés d'onglet (`overview`, `matching`,
 * `positioning`, `activity`, `documents`, `history`) en `useState` LOCAL —
 * aucun lien direct ne pouvait viser un onglet précis (#2175.2-.6). La demande
 * réduit la barre VISIBLE à quatre familles (Synthèse / Profils &
 * positionnements / Avancement / Documents & historique) tout en gardant les
 * cinq anciens noms comme valeurs valides de `?tab=` — ils ouvrent la famille
 * qui les contient désormais.
 *
 * Cette fonction est la SEULE table de correspondance ancien-nom → famille :
 * `NeedDetailPage.tsx` la lit pour dériver la famille active depuis
 * `Route.useSearch().tab`, personne ne la recopie.
 */
export const NEED_DETAIL_FAMILIES = ['synthese', 'profiles', 'progress', 'documents'] as const
export type NeedDetailFamily = (typeof NEED_DETAIL_FAMILIES)[number]

/** Les six anciennes clés d'onglet, conservées comme valeurs de `?tab=` valides. */
export const NEED_DETAIL_LEGACY_TABS = [
  'overview',
  'matching',
  'positioning',
  'activity',
  'documents',
  'history',
] as const
type NeedDetailLegacyTab = (typeof NEED_DETAIL_LEGACY_TABS)[number]

type NeedDetailTabParam = NeedDetailFamily | NeedDetailLegacyTab

/**
 * `undefined` (aucun `?tab=`, lien entrant nu) et `overview` ouvrent tous
 * deux Synthèse — c'est le comportement d'avant ce lot, celui qu'un lien déjà
 * collé quelque part doit continuer de voir.
 */
export function needDetailFamilyOf(tab: NeedDetailTabParam | undefined): NeedDetailFamily {
  switch (tab) {
    case 'matching':
    case 'positioning':
    case 'profiles':
      return 'profiles'
    // Refonte Théo (projects-besoin-fiche) — l'historique daté vit sous « Avancement ».
    case 'activity':
    case 'progress':
    case 'history':
      return 'progress'
    case 'documents':
      return 'documents'
    case 'overview':
    case 'synthese':
    default:
      return 'synthese'
  }
}
