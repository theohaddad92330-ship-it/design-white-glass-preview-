/**
 * #2550.1 — « aucun résultat » doit distinguer QUATRE causes et le dire :
 * marché absent · source en panne · filtre trop strict · secteur mal couvert.
 * « Non trouvé / non mesuré » n'est JAMAIS zéro, et « source indisponible » ne
 * devient jamais zéro résultat en silence.
 *
 * « Source en panne » est déjà porté par `DiscoverUnverifiable` (#1766,
 * `nothingCouldBeVerified` dans `Discover.tsx`) — un chemin DISTINCT, décidé
 * avant celui-ci. « Filtre trop strict » (`filtersNarrow`) est lui aussi
 * décidé AILLEURS, pour une raison précise (#3878.1, voir plus bas) : cette
 * fonction tranche les DEUX AUTRES, avec des données déjà mesurées, jamais un
 * heuristique inventé :
 *
 *  - `sectorUnsupported` — le registre a refusé d'exprimer `sector`/`nafCode`
 *    (`degraded[].fields`, déjà lu par `unappliedFilters`, `discover-capability.ts`).
 *    Ce n'est pas « aucune entreprise ne correspond », c'est « le critère n'a
 *    pas pu être posé » — le cas le plus proche de « secteur mal couvert » que
 *    l'écran puisse honnêtement nommer sans fabriquer une mesure de densité
 *    de registre par secteur, qui n'existe nulle part dans le contrat.
 *  - `inconsistentFilters` — une incohérence RÉELLEMENT détectée entre deux
 *    critères (`detectInconsistentFilters`, `discover-filters.ts`) : un
 *    secteur à la fois coché et exclu, ou un CA minimum au-dessus du maximum.
 *    Ces combinaisons ne peuvent STRUCTURELLEMENT rendre aucun candidat —
 *    c'est un fait sur la requête, jamais une supposition sur le marché.
 *  - `noMatch` — le repli : rien d'inexprimé, aucune incohérence détectée.
 *    C'est le seul cas où « aucune entreprise ne correspond » se lit
 *    honnêtement (ce n'est jamais un fait de marché CERTAIN — juste la
 *    meilleure lecture disponible avec ce qu'on a cherché).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI `filtersNarrow` N'EST PLUS RENDU PAR CETTE FONCTION (#3878.1)
 * ─────────────────────────────────────────────────────────────────────────
 * RÉFUTÉ en recette le 08/10/2026 (retour client BEL-DEC-1008-006) : cette
 * fonction choisissait `filtersNarrow` dès que PLUS D'UN critère était actif
 * (`activeFilterCount > 1`), sans jamais vérifier qu'un de ces critères
 * explique le zéro observé — « deux filtres actifs » ne prouve RIEN sur le
 * zéro qu'a rendu la source. Ce diagnostic est pourtant honnête ailleurs : à
 * l'endroit où les résultats EXISTENT et où les affinages d'écran (fit,
 * famille, classe…) les masquent tous (`visible.length === 0` alors que
 * `candidates.length > 0`, voir `Discover.tsx`), c'est un FAIT certain, pas
 * une déduction, et `reason="filtersNarrow"` y reste posé en dur. C'est ICI,
 * à l'endroit où la source elle-même a rendu zéro ligne, que le comptage
 * inventait une cause.
 */
export type DiscoverEmptyReason =
  | 'sectorUnsupported'
  | 'inconsistentFilters'
  | 'filtersNarrow'
  | 'allSetAside'
  | 'noCapitalIncrease'
  | 'skillsNoMatch'
  | 'needsFilter'
  | 'noMatch'

const SECTOR_FIELDS = new Set(['sector', 'nafCode'])

export function discoverEmptyReason(params: {
  /** Champs d'écran (`sector`, `city`…) qu'AUCUNE source n'a su appliquer —
   *  les clés de `unappliedFilters(...)`. */
  unappliedFields: ReadonlySet<string>
  /** #3878.1 — une incohérence RÉELLEMENT détectée entre deux critères
   *  (`detectInconsistentFilters`, `discover-filters.ts`), jamais déduite du
   *  seul nombre de critères actifs. */
  hasInconsistentFilters: boolean
  /** #3941.5 (R41) — « Augmentation de capital » est le seul critère de signal : le zéro se dit en toutes lettres. */
  capitalOnly?: boolean
  /** #4317.2 — une compétence est posée : le zéro nomme CETTE cause, jamais le message nu. */
  hasSkills?: boolean
}): DiscoverEmptyReason {
  for (const field of params.unappliedFields) {
    if (SECTOR_FIELDS.has(field)) return 'sectorUnsupported'
  }
  if (params.hasInconsistentFilters) return 'inconsistentFilters'
  if (params.capitalOnly) return 'noCapitalIncrease'
  if (params.hasSkills) return 'skillsNoMatch'
  return 'noMatch'
}

/**
 * #4627 — la cause d'une liste VIDE alors que des comptes ont été trouvés. « Trop de filtres empilés » n'est vrai
 * que si des filtres retirent ce qui restait : quand la recherche a ramené des comptes que la qualification écarte
 * TOUS (hors zone, personne physique, doublon…) ou que l'utilisateur a masqués, `kept` est vide alors que `crossed`
 * ne l'est pas — aucun filtre d'écran n'y est pour rien, et le dire détournait de la vraie cause.
 * `crossed` = comptes après les contraintes du rail ; `kept` = après exclusion et masquages.
 */
export function emptyListReason(params: { crossed: number; kept: number }): 'allSetAside' | 'filtersNarrow' {
  return params.crossed > 0 && params.kept === 0 ? 'allSetAside' : 'filtersNarrow'
}
