/**
 * Le TAMPON DE VERSION — la seule façon de savoir, depuis le plugin, si le
 * fichier Figma correspond encore au code : la CI ne peut pas écrire dans
 * Figma (l'API REST ne crée pas de nœuds), donc `generated/version.json`
 * (écrit par `extract`) est ce que la maquette peut comparer à elle-même.
 *
 * PUR à dessein (aucun import Node) : `foundations.ts` importe
 * `describeVersionChange` en VALEUR pour le dessiner dans le cadre
 * « Version » — un import Node ici casserait le bundle du plugin (voir
 * `version-git.ts`, qui porte `readShortSha` et le seul appel à `git`).
 */
export interface VersionStamp {
  /** Sha court du HEAD au moment de l'extraction, ex. `a1b2c3d`. */
  sha: string
  /** Date ISO 8601 (UTC) de l'extraction. */
  date: string
  /** `PAGES.length` au moment de l'extraction. */
  specCount: number
}

export function buildVersionStamp(specCount: number, sha: string, now: Date = new Date()): VersionStamp {
  return { sha, date: now.toISOString(), specCount }
}

/**
 * Le message que le plugin montre en comparant le tampon qu'il s'apprête à
 * écrire au tampon PRÉSENT (lu sur le cadre « Version » de la page Cover, via
 * `getPluginData`) — jamais un écrasement silencieux : l'utilisateur voit
 * D'OÙ il synchronise et VERS OÙ.
 */
export function describeVersionChange(previous: VersionStamp | null, next: VersionStamp): string {
  if (!previous) return `Version ${next.sha} (${next.specCount} specs) — première synchronisation.`
  if (previous.sha === next.sha && previous.specCount === next.specCount) {
    return `Version ${next.sha} (${next.specCount} specs) — déjà à jour.`
  }
  return `Version ${previous.sha} → ${next.sha} (${previous.specCount} → ${next.specCount} specs).`
}
