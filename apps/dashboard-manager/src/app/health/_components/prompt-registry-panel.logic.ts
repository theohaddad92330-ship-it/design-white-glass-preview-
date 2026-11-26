/**
 * #2445.1 (épopée #2766) — le libellé de version d'UN prompt du registre.
 * `null` (nom non enregistré, ne devrait pas arriver depuis ce endpoint mais
 * le contrat l'autorise) rendu comme un mot, jamais une cellule vide qui se
 * lirait comme une donnée manquante — même convention que
 * `model-routing-panel.logic.ts#libelleModele`.
 */
export function libelleVersion(version: string | null): string {
  return version ?? 'non enregistré'
}

/**
 * #2445.1 (épopée #2766) — le texte du diff entre deux refs, tel qu'affiché
 * sous le registre. Une chaîne vide (git ne rend rien) dit deux refs
 * IDENTIQUES sur ce prompt — un mot, jamais une zone vide qui se lirait comme
 * un diff introuvable ou une panne.
 */
export function libelleDiff(diff: string): string {
  return diff === '' ? 'Aucune différence entre ces deux références.' : diff
}
