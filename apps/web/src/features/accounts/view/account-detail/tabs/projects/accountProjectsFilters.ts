import { isPipelineStage, type ProjectRow } from '@bellum/contracts'

/**
 * #1889 — RETROUVER UN PROJET QUAND UN COMPTE EN PORTE VINGT ET UN.
 *
 * « pouvoir filtrer, chercher, importer des projets, ajouter de la profondeur
 * dans cette page ». Le besoin derrière la phrase n'est pas « des filtres » :
 * c'est de retrouver une ligne dans une liste que l'analyse remplit toute
 * seule, et de voir ce qui appelle un geste.
 *
 * Le filtre vit ici, en fonction PURE, et pas dans le composant : c'est la
 * même raison qui a fait naître `filterContacts` à côté de l'onglet Contacts.
 * Deux mécanismes de filtre sur le même objet divergent au premier changement
 * de règle.
 */

/**
 * Sans accents ni casse — « Référencement » se trouve en tapant « referencement ».
 *
 * ⚠️ `toLowerCase()` SEUL ne suffit pas, et c'est une leçon déjà payée dans ce
 * dépôt : la casse se plie, les diacritiques non. Un commercial qui tape vite
 * ne met pas les accents.
 */
function fold(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
}

/** La NATURE d'une ligne, telle que l'entête du bloc la nomme déjà. */
export type AccountProjectNature = 'projects' | 'signals'

export type AccountProjectFilters = {
  query: string
  /** `null` = les deux — c'est l'état d'arrivée, et il montre tout. */
  nature: AccountProjectNature | null
  /** Les cinq étapes du pipe. Un `detected` n'a encore été regardé par personne. */
  inPipe: boolean
  /**
   * Aucune tâche ouverte sur la ligne.
   *
   * ⚠️ TRIVALENT au contrat, et la nuance décide : `undefined` veut dire que
   * l'API n'a pas dit (une réponse antérieure au champ, pendant un
   * déploiement), `null` veut dire « aucune tâche ouverte ». Compter les deux
   * ensemble ferait annoncer « sans prochaine action » sur des projets qui en
   * ont peut-être une — un reproche fabriqué par un déploiement.
   */
  withoutNextAction: boolean
}

export const emptyAccountProjectFilters = (): AccountProjectFilters => ({
  query: '',
  nature: null,
  inPipe: false,
  withoutNextAction: false,
})

/** Vrai dès qu'un critère resserre la liste — ce qui autorise à dire « filtrée ». */
export function isNarrowed(filters: AccountProjectFilters): boolean {
  return filters.query.trim().length > 0 || filters.nature !== null || filters.inPipe || filters.withoutNextAction
}

/**
 * Ce que la recherche LIT sur une ligne.
 *
 * ⚠️ Pas `company_name` : toutes les lignes de cet onglet appartiennent au MÊME
 * compte, donc le nom de l'entreprise ne départage rien — il ferait seulement
 * répondre « tout » à la moitié des frappes. C'est la différence avec le pipe
 * global, où le compte est justement le premier critère.
 */
function haystack(project: ProjectRow): string {
  return [project.label, project.detail, project.offer].filter(Boolean).join(' ')
}

/**
 * #2119.2 — GÉNÉRIQUE SUR LA LIGNE, et pas sur `ProjectRow` figé : l'appelant
 * lit désormais `ProjectReadRow` (la ligne AVEC son niveau de preuve), et un
 * retour `ProjectRow[]` reperdrait le champ exactement là où le typage l'avait
 * déjà effacé une fois. Le filtre ne lit que des colonnes de `ProjectRow` — il
 * n'a pas à connaître ce que l'appelant transporte en plus.
 */
export function filterAccountProjects<Row extends ProjectRow>(
  projects: readonly Row[],
  filters: AccountProjectFilters,
): Row[] {
  const needle = fold(filters.query.trim())
  return projects.filter(project => {
    if (filters.nature === 'signals' && project.kind !== 'signal') return false
    if (filters.nature === 'projects' && project.kind === 'signal') return false
    if (filters.inPipe && !isPipelineStage(project.stage)) return false
    // `=== null` et jamais `!project.next_action` : `undefined` veut dire que
    // l'API ne l'a pas dit, pas qu'il n'y en a pas.
    if (filters.withoutNextAction && project.next_action !== null) return false
    if (needle.length === 0) return true
    return fold(haystack(project)).includes(needle)
  })
}
