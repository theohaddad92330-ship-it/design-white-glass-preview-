import type { CoverageGap, CoverageGapsResponse, CoverageLevel } from '@bellum/contracts'

/**
 * Honest status of one family × level cell.
 *
 *  - `covered`      → the endpoint counted ≥1 contact AT this exact intersection
 *  - `gap`          → the backend explicitly ranked this exact cell as a zone blanche
 *  - `not_priority` → the family is a SUPPORT family (never a breadth target): an
 *                     empty cell there is not a hole to fill, and painting it red
 *                     inflates the zones blanches (maquette p19)
 *  - `empty`        → the family has 0 contact, or the level has 0 contact account-wide
 *  - `partial`      → the family AND the level both have contacts, no gap flagged, and
 *                     the payload carries no cell matrix (pre-`cells` cached response):
 *                     coverage is possible but unproven.
 *
 * `partial` used to be the BEST any cell could reach: the endpoint reported family
 * totals and level totals separately and never their intersection, so a covered
 * cell was unprovable (rapport TF1 p32-33). With `cells` it becomes the legacy
 * fallback only.
 */
export type CoverageCellStatus = 'gap' | 'empty' | 'partial' | 'covered' | 'not_priority'

type CoverageGridCell = {
  level: CoverageLevel
  levelLabel: string
  status: CoverageCellStatus
  /** Contacts AT this intersection — only known when the payload carries `cells`. */
  contactCount: number
  /** The ranked gap behind a `gap` cell — lets the grid stay actionable. */
  gap?: CoverageGap
}

export type CoverageGridRow = {
  family: string
  label: string
  isTarget: boolean
  contactCount: number
  cells: CoverageGridCell[]
  /** L'action recommandée de la LIGNE (maquette p19 : une action au bout de la
   *  ligne qu'elle répare) = la zone blanche la plus prioritaire de cette famille.
   *  Absente quand le backend n'a rangé aucun gap ici — jamais d'action inventée. */
  action?: CoverageGap
}

/** Normalise an entity label for scope matching — same intent as the API side:
 *  deaccent, lower-case, keep alphanumerics only. */
function normEntity(raw: string): string {
  return raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
}

/**
 * Derive the families × levels coverage grid from the `/coverage-gaps` payload.
 * Target families always appear (a missing family IS the information); support
 * families only when the account actually has contacts there.
 *
 * `entity` scopes the grid to ONE entity of the account (maquette p19 : « matrice
 * de couverture par entité, famille et niveau »). Scoped, a cell is `covered` only
 * when a contact of THAT entity sits at the intersection — a family covered at the
 * parent company stops masking the blind spot at the subsidiary. When the payload
 * carries no `entity_cells` (response cached before the field existed), the scope
 * is ignored rather than rendering an all-empty entity: an absence of data is not
 * an absence of coverage.
 */
export function buildCoverageGrid(data: CoverageGapsResponse, entity?: string): CoverageGridRow[] {
  const gapByCell = new Map<string, CoverageGap>()
  for (const gap of data.gaps) gapByCell.set(`${gap.family}:${gap.level}`, gap)

  // Scope entité : ne s'applique que si le serveur a émis la matrice par entité.
  const entityKey = entity ? normEntity(entity) : ''
  const scoped = entityKey.length > 0 && data.entity_cells !== undefined

  // Matrice réelle quand le serveur la fournit. Absente (payload en cache d'avant
  // le champ) ⇒ on retombe sur l'ancien « possible mais non prouvé ».
  const countByCell = new Map<string, number>()
  if (scoped) {
    for (const cell of data.entity_cells ?? []) {
      if (normEntity(cell.entity) !== entityKey) continue
      countByCell.set(`${cell.family}:${cell.level}`, cell.contact_count)
    }
  } else {
    for (const cell of data.cells ?? []) countByCell.set(`${cell.family}:${cell.level}`, cell.contact_count)
  }
  const hasCellTruth = scoped || data.cells !== undefined

  return data.families
    .filter(family => family.is_target || family.covered)
    .map(family => {
      const cells = data.levels.map(level => {
        const key = `${family.family}:${level.level}`
        const gap = gapByCell.get(key)
        const count = countByCell.get(key) ?? 0
        // Un contact PRÉSENT à l'intersection prime : la cellule est couverte, même
        // si le backend avait aussi rangé cette case parmi ses suggestions.
        const status: CoverageCellStatus =
          count > 0
            ? 'covered'
            : !family.is_target
              ? 'not_priority'
              : gap
                ? 'gap'
                : family.contact_count === 0 || level.contact_count === 0
                  ? 'empty'
                  : hasCellTruth
                    ? 'empty'
                    : 'partial'
        return { level: level.level, levelLabel: level.label, status, contactCount: count, ...(gap ? { gap } : {}) }
      })
      // Scopé sur une entité, le compteur de ligne compte les contacts DE CETTE
      // entité — sinon la ligne annoncerait un effectif groupe sur une filiale vide.
      const contactCount = scoped ? cells.reduce((sum, cell) => sum + cell.contactCount, 0) : family.contact_count
      const action = cells
        .flatMap(cell => (cell.gap ? [cell.gap] : []))
        .sort((a, b) => a.priority - b.priority)
        .at(0)
      return {
        family: family.family,
        label: family.label,
        isTarget: family.is_target,
        contactCount,
        cells,
        ...(action ? { action } : {}),
      }
    })
}

/**
 * Cette couverture appelle-t-elle une action immédiate ?
 *
 * La recette finale §33 tranche le sort de l'onglet : « conserver le moteur
 * déterministe de couverture, mais déplacer les informations au bon endroit —
 * compte, contacts et plan d'action. Supprimer l'onglet autonome si aucune action
 * immédiate n'est possible. »
 *
 * La réponse ne se lit pas dans un pourcentage de couverture mais dans les zones
 * blanches RANGÉES par le serveur : un gap priorisé est un nom de rôle à trouver,
 * donc un clic. Une matrice sans gap est une belle image — et un onglet qui ne
 * contient qu'une belle image se paie deux fois, en place dans la barre et en
 * attention du commercial qui l'ouvre pour rien.
 *
 * On ne cache PAS sur un score élevé : un compte couvert à 90 % avec une zone
 * blanche au comité de direction a tout de même quelque chose à faire, et c'est
 * exactement le trou qui coûte l'affaire.
 */
export function coverageOffersAction(data: CoverageGapsResponse | undefined): boolean {
  // Donnée absente, en cours de chargement ou en erreur : on GARDE l'onglet.
  // « Pas encore su » n'est pas « rien à faire » — masquer sur une réponse qui
  // n'est pas arrivée ferait disparaître un onglet au rechargement de la page,
  // puis réapparaître, ce qui se lit comme un bug et non comme une décision.
  if (!data) return true
  return data.gaps.length > 0
}
