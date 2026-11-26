import { PUBLIC_SOURCE_IDS, type PublicSourceId } from '@bellum/contracts'
import type { LaunchPlan } from '@/features/search/hooks/useLaunchPlan'

/**
 * #2288.4 (c66, 18/09/2026) — LES SOURCES PUBLIQUES QUE LE DEVIS NOMME.
 *
 * `planSources` reste accepté (aujourd'hui toujours vide — le plan de
 * vérification n'annonce plus rien de façon inconditionnelle, voir
 * `planMarketVerification`) pour qu'une future source vraiment ungated puisse
 * s'y ajouter sans changer cette signature.
 *
 * Les TROIS sources publiques (France Travail, BOAMP, DECP) viennent
 * désormais TOUTES du LANCEUR, entreprise par entreprise
 * (`GET /analysis/launch-plan`, lu déjà pour le coût exact) :
 *  - France Travail tourne SANS gate de NAF/pays, mais seulement pour un
 *    lancement RÉEL — un dossier rouvert (`cache_hit`) ne collecte rien,
 *    donc elle ne se nomme que si AU MOINS un candidat sera lancé `fresh` ;
 *  - `publicTenderSources` de chaque réponse — BOAMP/DECP, gatés en PLUS par
 *    l'archétype/le pays, annoncés seulement quand ce lancement-là les
 *    interrogera à coup sûr.
 *
 * Un dossier rouvert (`cache_hit`) ne lance rien : il ne compte pas. Une seule
 * réponse manquante et rien de gaté n'est annoncé — une union partielle se
 * lirait comme complète, comme le coût (`marketVerificationCost.ts`).
 * `tenders` dit pour combien des entreprises LANCÉES, quand ce n'est pas
 * toutes (BOAMP/DECP seulement — France Travail n'a pas cette 2ᵉ gate).
 */
export function announcedPublicSources(input: {
  planSources: readonly PublicSourceId[]
  /** Une réponse du lanceur par candidat, dans l'ordre ; `null` = pas (encore) lue. */
  plans: readonly (LaunchPlan | null)[]
}): { sources: PublicSourceId[]; tenders: { shown: number; launched: number } | null } {
  const announced = new Set<PublicSourceId>(input.planSources)
  let tenders: { shown: number; launched: number } | null = null
  if (input.plans.every(plan => plan !== null)) {
    const launched = input.plans.filter(plan => plan?.scenario === 'fresh')
    // #2288.4 — France Travail suit désormais le lanceur, comme BOAMP/DECP :
    // au moins un lancement RÉEL (pas seulement des dossiers rouverts).
    if (launched.length > 0) announced.add('france-travail')
    const withTenders = launched.filter(plan => (plan?.publicTenderSources ?? []).length > 0)
    for (const plan of withTenders) for (const id of plan?.publicTenderSources ?? []) announced.add(id)
    if (withTenders.length > 0) tenders = { shown: withTenders.length, launched: launched.length }
  }
  return { sources: PUBLIC_SOURCE_IDS.filter(id => announced.has(id)), tenders }
}
