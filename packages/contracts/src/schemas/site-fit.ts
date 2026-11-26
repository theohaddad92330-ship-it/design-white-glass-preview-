import type { OfferPortfolio } from './offer-portfolio.js'
import type { Site } from './account-entity.js'

/**
 * Ce site correspond-il à ce que ce vendeur cherche ? (addendum Stelya §8.2)
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS ÉTATS, ET LE TROISIÈME EST LE PLUS IMPORTANT
 * ─────────────────────────────────────────────────────────────────────────────
 * `fits` / `below` / `unknown`. « Je ne sais pas » n'est PAS « non » : un site
 * dont l'effectif n'est pas renseigné n'est pas un petit site, et l'écarter
 * comme tel ferait perdre exactement les sites qu'on n'a pas encore qualifiés —
 * c'est-à-dire tous ceux qui viennent d'arriver.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * UNE PRÉFÉRENCE, PAS UNE RÈGLE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le retour bêta est explicite : « le seuil de 100 est une préférence Stelya,
 * pas une règle universelle du produit ». Un site SOUS le seuil rend donc
 * `below` — pas `excluded` — et l'appelant décide. La différence n'est pas
 * cosmétique : elle laisse passer un site de 80 qui porte un programme CAPEX.
 *
 * Et un effectif dont personne ne dit d'où il vient (`headcount_confidence`
 * absente) ne tranche RIEN : il est rendu avec sa réserve, parce que décider
 * d'aller ou non sur un site en se fondant sur un chiffre non sourcé est
 * exactement ce que le §8.1 interdit.
 */
export type SiteFitVerdict = 'fits' | 'below' | 'unknown'

export interface SiteFit {
  verdict: SiteFitVerdict
  /** La raison, en une phrase, dans les mots que l'écran peut afficher tels quels. */
  reason: string
}

export function siteFit(site: Site, portfolio: OfferPortfolio | null | undefined): SiteFit {
  const policy = portfolio?.target_site
  if (!policy || (policy.types.length === 0 && policy.min_headcount === null)) {
    return { verdict: 'unknown', reason: "aucune politique de site n'est déclarée" }
  }

  // Le TYPE d'abord : il est catégorique là où l'effectif est graduel. Un
  // entrepôt reste un entrepôt, quel que soit le nombre de personnes dedans.
  if (policy.types.length > 0) {
    if (!site.site_type) {
      return { verdict: 'unknown', reason: "le type de ce site n'est pas renseigné" }
    }
    if (!policy.types.includes(site.site_type)) {
      return { verdict: 'below', reason: `type « ${site.site_type} », hors des types recherchés` }
    }
  }

  if (policy.min_headcount !== null) {
    if (site.headcount === null) {
      return { verdict: 'unknown', reason: "l'effectif de ce site n'est pas renseigné — à vérifier" }
    }
    if (site.headcount < policy.min_headcount) {
      return {
        verdict: 'below',
        reason: `${site.headcount} personnes sur site, sous le seuil de ${policy.min_headcount} — un signal fort peut le rattraper`,
      }
    }
    // Un chiffre dont personne ne dit d'où il vient ne tranche rien : il est
    // rendu AVEC sa réserve plutôt que compté comme une mesure.
    if (!site.headcount_confidence) {
      return {
        verdict: 'unknown',
        reason: `${site.headcount} personnes sur site, mais sans source — à confirmer`,
      }
    }
  }

  return { verdict: 'fits', reason: siteFitReason(site, policy.min_headcount) }
}

function siteFitReason(site: Site, minHeadcount: number | null): string {
  const parts: string[] = []
  if (site.site_type) parts.push(site.site_type)
  if (minHeadcount !== null && site.headcount !== null) parts.push(`${site.headcount} personnes sur site`)
  return parts.length > 0 ? parts.join(', ') : 'correspond à la politique de site'
}
