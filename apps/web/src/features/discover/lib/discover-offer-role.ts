import { resolveBuyerRoleFamily, type BuyerRoleFamilyKey } from '@bellum/contracts'

/**
 * #2804 (#2291.2) — « offre : rôles acheteurs », le dernier des 4 types
 * d'entrée restés à 0 occurrence au tri du 24/09. Les tris précédents (25/09,
 * 26/09) concluaient à l'absence de tout référentiel — vrai à leur date, plus
 * aujourd'hui : `BUYER_ROLE_FAMILIES` (`packages/contracts`) a atterri le
 * 23/09 via un chantier distinct (#2635, unification de la famille de
 * contact, D176), et `OfferPortfolio.preferred_buyer_role_families` l'annonçait
 * déjà : « le référentiel de familles arrive avec le lot rôles ; les codes
 * sont donc libres ici et validés par leur CONSOMMATEUR ». Ce fichier est ce
 * consommateur — `resolveBuyerRoleFamily`, pas un second mapping (GA-26).
 *
 * Une seule famille RÉSOLUE alimente le filtre CONTACTS `expertise`
 * (`DiscoverContactFilters`), qui n'accepte qu'UNE clé. Plusieurs familles
 * DISTINCTES déclarées ⇒ `null` : choisir la première serait deviner un ordre
 * de préférence que personne n'a déclaré (même prudence que
 * `SubmissionsService.acceptedForNeed`, jamais un premier deviné).
 */
export function offerTargetBuyerRole(roleFamilies: readonly string[]): BuyerRoleFamilyKey | null {
  const resolved = new Set<BuyerRoleFamilyKey>()
  for (const raw of roleFamilies) {
    const key = resolveBuyerRoleFamily(raw)
    if (key) resolved.add(key)
  }
  return resolved.size === 1 ? [...resolved][0]! : null
}
