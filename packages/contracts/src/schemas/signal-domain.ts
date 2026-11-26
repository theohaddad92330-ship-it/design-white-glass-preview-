import { OFFER_DOMAINS } from './onboarding.js'
import type { OfferDomain } from './onboarding.js'

/**
 * #3978 — les domaines d'offre qu'un signal, un pain ou un enjeu peut porter
 * (`recent_signals[].domain_code`, `pains[].domain_code`, `it_challenges[].domain_code`),
 * puis `opportunities.primary_domain_code` une fois matérialisés.
 *
 * Le vocabulaire est celui des PACKS (`OFFER_DOMAINS`) : c'est celui que l'écran
 * compare au pack de l'espace (`ownDomainCodes`, `AccountOpportunityScreen`).
 * `generic` n'en fait pas partie — c'est le fourre-tout, et classer un signal
 * « autre » dedans ferait « toucher l'expertise » de tout vendeur générique : un
 * signal que le modèle ne sait pas classer reste SANS domaine (« non mesuré »).
 *
 * Miroir Python : `apps/ia/app/services/offer_domains/signal_domain.py` — dérivé de
 * `PACK_PRIORITY`, dont la parité avec `OFFER_DOMAINS` est déjà gardée.
 */
export const SIGNAL_DOMAIN_CODES: readonly OfferDomain[] = OFFER_DOMAINS.filter(code => code !== 'generic')
