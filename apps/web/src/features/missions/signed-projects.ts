import type { ProjectReadRow } from '@bellum/contracts'

/**
 * #4291.8 / #4270.4 — en espace « forfait / conseil », un projet SIGNÉ est suivi en planification À LA PLACE d'une
 * mission (il n'y a pas de consultant à staffer). `/projects` compte les « Signés » ; la planification les liste
 * donc aussi, avec les seuls faits que le projet porte : son titre, son client et la date de signature SI elle est
 * connue. Aucune date de début ni de fin n'est inventée — une frise ne se dessine pas sur des dates que personne
 * n'a saisies.
 */
type SignedProjectEntry = {
  id: string
  label: string
  companyName: string | null
  /** `YYYY-MM-DD` de la signature, `null` = non saisie. */
  signedOn: string | null
}

export function signedProjectsForPlanning(rows: readonly ProjectReadRow[]): SignedProjectEntry[] {
  return rows
    .filter(row => row.stage === 'won')
    .map(row => ({
      id: row.id,
      label: row.label,
      companyName: row.company_name?.trim() || null,
      signedOn: row.closed_at && !Number.isNaN(Date.parse(row.closed_at)) ? row.closed_at.slice(0, 10) : null,
    }))
    .sort((a, b) => (b.signedOn ?? '').localeCompare(a.signedOn ?? ''))
}
