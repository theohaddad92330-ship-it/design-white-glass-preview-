// #3586 — logique pure de l'écran « Drive interne » du DM (testée sans rendu).

export type StatutFichier = 'indexed' | 'ignored' | 'error' | 'archived'

export type FichierDrive = {
  name: string
  path: string
  status: StatutFichier
  modifiedTime: string
  syncedAt: string | null
  chunkCount: number | null
  errorMessage: string | null
}

const RANG: Record<StatutFichier, number> = { error: 0, ignored: 1, indexed: 2, archived: 3 }

/** Erreurs d'abord, puis ignorés (à comprendre), puis le reste. */
export function trierFichiers(fichiers: readonly FichierDrive[]): FichierDrive[] {
  return [...fichiers].sort((a, b) => RANG[a.status] - RANG[b.status] || a.name.localeCompare(b.name))
}

/** Une valeur absente ne s'affiche jamais « 0 » : « — ». */
export function compter(n: number | null | undefined): string {
  return n == null ? '—' : String(n)
}
