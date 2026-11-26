import { OPPORTUNITY_LEARNING_PROMPT_MAX_ROWS, type ProjectLearningRow } from '@bellum/contracts'

/**
 * Boucle d'apprentissage (restitution V2 §6 — « chaque analyse améliore la base
 * globale »).
 *
 * Le graphe enregistrait déjà ce que chaque analyse PRODUIT. Ce qui manquait,
 * c'est le retour : ce que l'équipe en a fait, et que la prochaine analyse
 * devrait savoir. Ce module rend ce retour en un bloc de texte déterministe,
 * envoyé au service IA avec le run.
 *
 * Trois règles tiennent tout :
 *
 *  1. **Rien d'inventé** — chaque ligne est un comptage de cycles de vie
 *     déplacés à la main par un commercial. Aucun score, aucune prédiction,
 *     aucune extrapolation d'un cas unique.
 *  2. **Vide = silence** — aucune transition dans le workspace ⇒ chaîne vide ⇒
 *     la clé est omise du wire ⇒ le prompt de l'IA est **byte-identique** à
 *     avant la feature. Une équipe qui débute n'est pas conseillée par un
 *     apprentissage qui n'existe pas.
 *  3. **C'est un PRIOR sur l'ESN, jamais un fait sur la cible** — le bloc dit ce
 *     qui a converti CHEZ CETTE ESN ; il ne dit rien de l'entreprise analysée,
 *     et le prompt l'écrit noir sur blanc.
 */

/** Une cellule ne pèse que si elle a un résultat à raconter. */
function totalMoves(row: ProjectLearningRow): number {
  return row.converted + row.transformed + row.obsolete
}

/**
 * Les cellules les plus DOCUMENTÉES d'abord (converties, puis transformées,
 * puis obsolètes). Une cellule sans aucun mouvement n'apporte rien et sort.
 */
function rank(rows: ProjectLearningRow[]): ProjectLearningRow[] {
  return rows
    .filter(row => totalMoves(row) > 0)
    .sort(
      (a, b) =>
        b.converted - a.converted ||
        b.transformed - a.transformed ||
        b.obsolete - a.obsolete ||
        (a.offer ?? '').localeCompare(b.offer ?? ''),
    )
    .slice(0, OPPORTUNITY_LEARNING_PROMPT_MAX_ROWS)
}

/** « Secteur · Offre » — chaque axe seulement s'il est connu. */
function describeCell(row: ProjectLearningRow): string {
  const axes = [row.sector, row.offer].filter((value): value is string => !!value && value.trim().length > 0)
  return axes.length > 0 ? axes.join(' · ') : 'sans secteur ni offre rattachés'
}

/** « 3 convertis, 1 transformé en action, 2 obsolètes » — que ce qui est non nul. */
function describeOutcome(row: ProjectLearningRow): string {
  const parts: string[] = []
  if (row.converted > 0) parts.push(`${row.converted} converti${row.converted > 1 ? 's' : ''}`)
  if (row.transformed > 0) parts.push(`${row.transformed} transformé${row.transformed > 1 ? 's' : ''} en action`)
  if (row.obsolete > 0)
    parts.push(`${row.obsolete} déclaré${row.obsolete > 1 ? 's' : ''} obsolète${row.obsolete > 1 ? 's' : ''}`)
  return parts.join(', ')
}

/**
 * Le bloc envoyé à l'IA, ou `''` quand l'équipe n'a rien déplacé.
 *
 * Chaîne vide ⇒ l'appelant omet la clé du wire ⇒ prompt byte-identique.
 */
export function renderWorkspaceLearning(rows: ProjectLearningRow[]): string {
  const kept = rank(rows)
  if (kept.length === 0) return ''
  return kept.map(row => `- ${describeCell(row)} : ${describeOutcome(row)}`).join('\n')
}
