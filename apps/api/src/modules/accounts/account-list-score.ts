/**
 * #4016.91 (18/10) — la LISTE des comptes parle la langue de la FICHE : le /25 de l'évaluation, pas le
 * `priority_score` /10. Même lecture que `readAccountScore25` côté web (racine, puis `plan.evaluation`, puis
 * `evaluation_compte`, la première qui porte un nombre), même bornes. Un dossier sans /25 lisible rend `null` :
 * la liste retombe alors sur le /10 NOMMÉ comme tel, jamais sur un « 0 ».
 */
export function readListScore25(raw: {
  root?: string | null
  plan?: string | null
  compte?: string | null
}): number | null {
  for (const text of [raw.root, raw.plan, raw.compte]) {
    const trimmed = text?.trim()
    if (!trimmed) continue
    const value = Number(trimmed)
    if (Number.isFinite(value)) return Math.max(0, Math.min(25, Math.round(value)))
  }
  return null
}
