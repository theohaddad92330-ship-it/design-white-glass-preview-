import { INTAKE_STAGES, projectNature, type ProjectReadinessRow } from '@bellum/contracts'

/**
 * #4469 — le sélecteur « Projet de rattachement » ne propose que de VRAIS projets.
 *
 * `GET /projects` rend aussi les lignes que l'analyse a déduites d'un compte (signaux, offres d'emploi, douleurs
 * détectées) : « Guerbet — rien n'y fait ! » n'est pas un projet, c'est un fait qui en annonce peut-être un.
 * Même frontière que la fiche compte et le Pipe : un signal n'est jamais un projet ; une détection encore à
 * l'entrée du pipe n'en devient un qu'une fois travaillée (porteur, prochaine action, montant…) ou saisie à la main.
 */
export function isAttachableProject(row: ProjectReadinessRow): boolean {
  if (row.kind === 'signal') return false
  if (row.kind === 'manual' || row.kind === 'imported') return true
  if (!(INTAKE_STAGES as readonly string[]).includes(row.stage)) return true
  return projectNature(row) === 'worked'
}
