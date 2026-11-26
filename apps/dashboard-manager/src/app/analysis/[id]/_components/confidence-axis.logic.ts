/**
 * #4595.3 — un axe de « Fiabilité du dossier » que l'analyse n'a pas rendu n'est pas « 0/100 » (ce serait un verdict
 * STOP inventé) : il est « non évalué », sans teinte de verdict. Un vrai 0 reste 0/100.
 */
export function confidenceAxisBadge(raw: unknown): { text: string; tone: 'GO' | 'PRUDENT' | 'STOP' | null } {
  const v = raw === null || raw === undefined || raw === '' ? Number.NaN : Number(raw)
  if (!Number.isFinite(v)) return { text: 'non évalué', tone: null }
  return { text: `${v}/100`, tone: v >= 70 ? 'GO' : v >= 40 ? 'PRUDENT' : 'STOP' }
}
