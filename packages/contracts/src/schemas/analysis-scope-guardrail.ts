import type { AnalysisScopeMode } from './analysis.js'

/**
 * #3260.8/.9 (BEL-SC-231) — le garde-fou de périmètre avant un lancement à
 * l'aveugle. « Analyse Société Générale », sans plus de précision, ne doit
 * jamais partir en silence sur le GROUPE ENTIER quand l'entité est une
 * GRANDE ENTREPRISE au sens du registre (`size_class: 'GE'`,
 * `companySuggestionSchema` — donnée publiée, jamais devinée).
 *
 * ⚠️ Ceci ne réintroduit PAS la carte de confirmation que `c84_analyse_
 * recherche_enrichissement_partent_sans_carte` a supprimée (22/09/2026,
 * #2723) : on ne BLOQUE rien. La suggestion voyage dans le MÊME message que
 * l'annonce du coût (`_analysis_card`, `apps/ia/app/services/chat_tools.py`)
 * — Laura la NOMME, elle ne pose une question que si la réponse changerait
 * réellement l'analyse (c84 le permet déjà explicitement pour ce cas).
 *
 * `null` = rien à dire : un périmètre a déjà été précisé par l'appelant, ou
 * la taille n'est pas mesurée — jamais un `'GE'` inventé pour l'occasion
 * (GA-18/GA-19, « non mesuré » ≠ 0).
 */
export interface AnalysisScopeGuardrail {
  suggestedScopeMode: AnalysisScopeMode
  reason: string
}

const GE_HEADCOUNT_FLOOR = 5000

/** Le MINIMUM de la tranche publiée (« 5 000 à 9 999 salariés » → 5000). Illisible → faux. */
function headcountFloorReachesGe(label: string | null | undefined): boolean {
  const first = /\d[\d\s\u00a0\u202f]*/.exec(label ?? '')?.[0]
  const floor = first ? Number(first.replace(/\D/g, '')) : NaN
  return Number.isFinite(floor) && floor >= GE_HEADCOUNT_FLOOR
}

export function analysisScopeGuardrailFor(
  input: {
    sizeClass?: string | null
    /** Libellé INSEE publié (« 5 000 à 9 999 salariés ») — jamais estimé. */
    headcountLabel?: string | null
    /** #3434 — effectif MINIMUM publié par le chemin Pappers (`employees_min`), jamais estimé. */
    employeesMin?: number | null
    requestedScopeMode?: AnalysisScopeMode | null
  },
  locale: 'fr' | 'en' = 'fr',
): AnalysisScopeGuardrail | null {
  if (input.requestedScopeMode) return null
  const isGe = (input.sizeClass ?? '').trim().toUpperCase() === 'GE'
  const pappersFloorReachesGe =
    typeof input.employeesMin === 'number' &&
    Number.isFinite(input.employeesMin) &&
    input.employeesMin >= GE_HEADCOUNT_FLOOR
  if (!isGe && !headcountFloorReachesGe(input.headcountLabel) && !pappersFloorReachesGe) return null
  return {
    suggestedScopeMode: 'business_unit',
    reason:
      locale === 'en'
        ? 'This is a large group (5,000+ employees) — analyzing the whole parent company risks missing the precise scope you actually need. Narrow to a business unit, a subsidiary, or a site?'
        : 'C’est une grande entreprise (5 000 salariés et plus) — analyser tout le groupe risque de manquer le périmètre précis qui t’intéresse. Se concentrer sur une business unit, une filiale ou un site ?',
  }
}
