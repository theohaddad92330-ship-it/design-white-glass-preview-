/**
 * #4433.9 — UN SEUL ENDROIT pour « libellé + compte » (GA-26).
 *
 * Une absence ne fait aucune ligne et n'écrit jamais « 0 » (GA-18 / GA-19) : « Actives · 0 » ou « En veille (0) » dit
 * « on a regardé, il y en a zéro » là où l'écran veut seulement ne rien annoncer. Un compte nul, absent ou illisible
 * rend donc le libellé SEUL ; un compte positif se lit à côté, au style de la surface (`dot` ou `paren`).
 */
export function labelWithCount(label: string, count: number | undefined, style: 'dot' | 'paren'): string {
  if (count === undefined || !Number.isFinite(count) || count < 1) return label
  return style === 'dot' ? `${label} · ${count}` : `${label} (${count})`
}
