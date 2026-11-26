import { angleThemeTokens, type AnalysisProfileData, type SellerScoringContext } from '@bellum/contracts'

/**
 * Lot 758 (CONTACTS 4/6) — l'OFFRE de l'ESN, lue sur son profil, pour les deux calculs qui
 * jugent un contact :
 *  - le score de pertinence servi (`computeContactScore`, axe « rôle face à votre offre ») ;
 *  - le classement du chemin recommandé (`rankAccountContacts`, axe `offer`) quand le
 *    commercial n'a CHOISI aucune offre.
 *
 * Avant, ni l'un ni l'autre ne la lisaient : le score était calculé sans contexte vendeur et
 * l'axe `offer` du classement restait « aucune offre choisie ». Pour une ESN data, rien ne
 * distinguait donc un Head of Data d'un chef de l'architecture, et la joignabilité tranchait
 * (Julien, appel du 30/10). Ce qui est lu : les offres DÉCLARÉES (`offers`) et les libellés du
 * portefeuille (`offerPortfolioNames`) — jamais une offre devinée. Rien de déclaré ⇒
 * `undefined` / ensemble vide, et les deux calculs restent EXACTEMENT ceux d'avant.
 */
type OfferProfile = Pick<AnalysisProfileData, 'offers' | 'offerPortfolioNames'> | null | undefined

function declaredOffers(profile: OfferProfile): string[] {
  return [...(profile?.offers ?? []), ...(profile?.offerPortfolioNames ?? [])]
    .map(offer => (typeof offer === 'string' ? offer.trim() : ''))
    .filter(offer => offer.length > 0)
}

/** Le contexte vendeur du score de pertinence ; `undefined` sans offre déclarée. */
export function sellerScoringContextFrom(profile: OfferProfile): SellerScoringContext | undefined {
  const offers = declaredOffers(profile)
  return offers.length > 0 ? { focusThemes: offers } : undefined
}

/** Les mots distinctifs de l'offre déclarée, pour l'axe `offer` du classement. */
export function profileOfferTokens(profile: OfferProfile): Set<string> {
  return angleThemeTokens(declaredOffers(profile).map(title => ({ title })))
}
