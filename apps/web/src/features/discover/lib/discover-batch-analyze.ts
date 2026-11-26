import type { DiscoverOriginCriteria } from '@bellum/contracts'
import { buildAnalyzeSearch } from './discover-analyze'
import type { DiscoverCandidate } from './discover-types'

/* ------------------------------------------------------------------ */
/*  #2166.56 — lancer une analyse de LOT depuis Découvrir.              */
/*                                                                     */
/*  ⚠️ ACTE PAYANT EN LOT. DÉCISION Louis 17/09 midi (QCM Découvrir) :   */
/*  « file d'analyses : un clic, coût total annoncé (N × 8 crédits),    */
/*  N jobs en file, progression suivie ; rien ne part sans ce clic. »   */
/*                                                                     */
/*  Le coût ANNONCÉ (18/09 soir, suite) n'est plus un prix de grille    */
/*  multiplié par N (`batchAnalysisCost`, retiré) : un candidat DÉJÀ    */
/*  analysé dans l'espace est rouvert par le lanceur SANS débit, et le  */
/*  devis sur-annonçait dans ce cas. Voir `discover-batch-analyze-cost` */
/*  (`exactBatchAnalysisCost`), qui somme `GET /analysis/launch-plan`   */
/*  entreprise par entreprise — même correctif que #2288.4.             */
/*                                                                     */
/*  Le REQUEST BODY réutilise `buildAnalyzeSearch` (même transport de   */
/*  contexte qu'une analyse simple depuis /search) : un seul chemin qui */
/*  dérive `company_name`/`suggestion_id`/`suggestion_reason` d'un      */
/*  candidat, jamais deux qui pourraient diverger.                      */
/* ------------------------------------------------------------------ */

interface BatchAnalyzeRequestBody {
  company_name: string
  siren: string
  suggestion_id: string
  suggestion_reason?: string
  /** #3819 (lot RBB) — les critères Découvrir posés et satisfaits. */
  suggestion_criteria?: DiscoverOriginCriteria
}

/** Le corps de `POST /analysis/start` pour UN candidat de la sélection. */
export function buildBatchAnalyzeRequest(
  candidate: DiscoverCandidate,
  criteria?: DiscoverOriginCriteria,
): BatchAnalyzeRequestBody {
  const { company, suggestionId, suggestionReason, suggestionCriteria } = buildAnalyzeSearch(candidate, criteria)
  return {
    company_name: company,
    siren: candidate.siren,
    suggestion_id: suggestionId,
    ...(suggestionReason ? { suggestion_reason: suggestionReason } : {}),
    ...(suggestionCriteria ? { suggestion_criteria: suggestionCriteria } : {}),
  }
}

/** #4432.3 — le libellé de la zone cherchée qui deviendra le périmètre du dossier, ou `undefined`. */
export function searchedZoneLabel(criteria: DiscoverOriginCriteria | undefined): string | undefined {
  const parts = [criteria?.zone_city, ...(criteria?.zone_departments ?? []), ...(criteria?.zone_regions ?? [])]
  const label = (criteria?.zone_city ? [criteria.zone_city] : parts).filter(Boolean).join(' · ')
  return label || undefined
}

/** #4432.3 — « Élargir à la France » : la zone structurée s'en va, le reste des critères reste. */
export function withoutSearchedZone(criteria: DiscoverOriginCriteria | undefined): DiscoverOriginCriteria | undefined {
  if (!criteria) return criteria
  const { zone_city: _city, zone_departments: _departments, zone_regions: _regions, ...rest } = criteria
  return Object.keys(rest).length > 0 ? rest : undefined
}
