/**
 * #3683.2 — UN BROUILLON D'OPPORTUNITÉ, JAMAIS UNE CRÉATION AU CLIC.
 *
 * Un fait public (un signal de veille) n'est pas une affaire : le bouton ouvre ce brouillon, renseigné
 * de ce que le fait apporte, avec ce qui manque encore DIT, et c'est la validation d'une personne qui
 * crée l'affaire (`CreateProjectDialog`, `POST /projects`). Rien d'autre n'est préparé que ce qu'on sait.
 */
type OpportunityDraftMissing = 'amount' | 'closeOn' | 'owner' | 'contact'

type OpportunityDraft = {
  /** Le nom proposé — le fait lui-même, jamais reformulé. */
  label: string
  /** Ce qu'on cherche à obtenir : la lecture commerciale de l'analyse, ou rien. */
  objective: string | null
  /** Le contexte long : le fait, sa source, sa date, son type — écrit tel qu'observé. */
  detail: string
  /** Ce que le brouillon reprend, déjà formaté pour l'écran (clé de libellé + valeur). */
  facts: { key: 'source' | 'date' | 'type'; value: string }[]
  /** Ce que le brouillon ne sait pas encore : montré, jamais deviné. */
  missing: OpportunityDraftMissing[]
}

export type { OpportunityDraft }

/** Le nom d'une affaire, tel que le serveur le compare pour refuser un doublon (même libellé rogné). */
export function opportunityDraftKey(label: string): string {
  return label.trim().toLowerCase()
}
