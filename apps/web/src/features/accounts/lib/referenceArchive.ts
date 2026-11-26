/** `2026-09-30` → `30/09` (jour/mois) et l'année à part, sans passer par `Date` : pas de fuseau à deviner. */
function parts(iso: string): { day: string; month: string; year: string } {
  const [year = '', month = '', day = ''] = iso.split('-')
  return { day, month, year }
}

/** Théo A comptes-fiche-reference.N4 — « 30/09–01/10/2026 » : la période d'un dossier de référence. */
export function formatArchivePeriod(from: string, to: string): string {
  if (from === to) {
    const d = parts(from)
    return `${d.day}/${d.month}/${d.year}`
  }
  const a = parts(from)
  const b = parts(to)
  if (a.year === b.year) return `${a.day}/${a.month}–${b.day}/${b.month}/${b.year}`
  return `${a.day}/${a.month}/${a.year}–${b.day}/${b.month}/${b.year}`
}
