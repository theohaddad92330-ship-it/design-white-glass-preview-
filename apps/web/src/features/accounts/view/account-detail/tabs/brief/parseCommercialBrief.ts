import { commercialBriefSchema, type CommercialBrief } from '@bellum/contracts'

/**
 * Brief commercial « Ce que je sais » : lu dans `raw_analysis.commercial_brief`,
 * tel que le semis démo ou le pipeline IA l'écrit (le dossier arrive entier au
 * web, aucune liste blanche de clés côté API).
 *
 * Absent OU invalide → `null`, et l'onglet n'apparaît pas : on n'affiche pas ce
 * qu'on n'a pas (doctrine). Jamais de brief « à moitié lu » — le contrat est
 * fermé, un brief qui ne le respecte pas ne s'affiche pas du tout.
 */
export function parseCommercialBrief(rawAnalysis: Record<string, unknown> | null | undefined): CommercialBrief | null {
  const candidate = rawAnalysis?.['commercial_brief']
  if (candidate === undefined || candidate === null) return null
  const parsed = commercialBriefSchema.safeParse(candidate)
  if (!parsed.success) return null
  // #3712.6 (DEC-4036 Q9, Louis 19/10 : « c'est parasite ») — la fiche compte ne NOMME plus les
  // limites du brief. Les briefs déjà écrits (base, semis démo) portent encore la rubrique : elle
  // tombe ici. Un brief qui ne disait QUE ses limites n'a rien à montrer : pas d'onglet.
  const whatIKnow = parsed.data.what_i_know.filter(row => !isLimitRubric(row.rubric))
  return whatIKnow.length > 0 ? { ...parsed.data, what_i_know: whatIKnow } : null
}

/**
 * Une rubrique de LIMITES : « CE QU'ON NE SAIT PAS » (et « CE QUE L'ON… », apostrophe typographique
 * comprise, suffixe « — ACHATS » compris) ou « LIMITES ». Jamais « QUI DÉCIDE » ni une autre rubrique.
 */
function isLimitRubric(rubric: string): boolean {
  const folded = rubric
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[’`]/g, "'")
    .toUpperCase()
    .trim()
  return /^CE QU(?:'|E L'|E )ON NE SAIT PAS\b/.test(folded) || /^LIMITES\b/.test(folded)
}
