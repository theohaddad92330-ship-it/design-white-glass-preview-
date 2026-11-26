import { z } from 'zod'
import { ONBOARDING_MAX_MULTI } from './limits.js'

/**
 * Client idéal — lot L17 (#2042).
 *
 * `target_company_types` (Temps 1, `cibles.ts`) mélangeait deux axes — taille
 * et type d'entreprise — dans une seule liste plate, et ne disait rien de la
 * maturité, du territoire, de l'accessibilité ni des contraintes du client
 * VISÉ. Neuf colonnes ADDITIVES, toutes optionnelles comme le reste du Temps 1 :
 * une question qui se passe reste absente, jamais devinée (« non mesuré n'est
 * jamais 0 »). `target_company_types` n'est ni retiré ni modifié — ces axes
 * s'ajoutent À CÔTÉ (GA-08 : une taxonomie ne rétrécit jamais).
 *
 * #2042.15 (« l'audit peut recommander un point de départ ≠ de l'ambition »)
 * EST BRANCHÉE depuis le 16/09/2026 : le moteur de comparaison vit dans
 * `../commercial-audit-signals.ts` (`buildAuditDeclaredSignals`), il lit
 * `ideal_client_current_state` et `ideal_client_accessibility` ci-dessous, et il
 * est appelé par `buildCommercialAuditContext` puis rendu par
 * `AuditDeclaredSignals.tsx`. _Avant : « N'EST PAS ici — la donnée qu'un tel
 * moteur consommerait le jour où il existe. »_
 */
export const CLIENT_IDEAL_ANSWER_FIELDS = {
  // #2042.1 — taille, distincte du type (ex-mélange de `target_company_types`).
  ideal_client_size: z.array(z.string()).max(ONBOARDING_MAX_MULTI).optional(),
  // #2042.2 / #2042.3 — type/structure : groupe, filiale, PME indépendante,
  // secteur public. Les valeurs « groupe »/« filiale » manquaient au catalogue
  // existant.
  ideal_client_structure: z.array(z.string()).max(ONBOARDING_MAX_MULTI).optional(),
  // #2042.4 — maturité du CLIENT visé (à ne pas confondre avec
  // `esn_maturity_situation`, qui décrit l'ESN elle-même).
  ideal_client_maturity: z.array(z.string()).max(ONBOARDING_MAX_MULTI).optional(),
  // #2042.5 — territoire du CLIENT. Distinct de `geo_zones`, qui est la zone de
  // chasse du VENDEUR (voir le commentaire de `cibles.ts`).
  ideal_client_territory: z.array(z.string()).max(ONBOARDING_MAX_MULTI).optional(),
  // #2042.6 — à quel point ce client est atteignable aujourd'hui.
  ideal_client_accessibility: z.string().nullable().optional(),
  // #2042.7 — cycle TOLÉRABLE, distinct d'`avg_sales_cycle` qui est le cycle
  // CONSTATÉ (Temps 2).
  ideal_client_max_sales_cycle: z.string().nullable().optional(),
  // #2042.8 — panier MINIMUM accepté, distinct d'`avg_deal_size` qui est une
  // moyenne (profil progressif).
  ideal_client_min_deal_size: z.string().nullable().optional(),
  // #2042.9
  ideal_client_referencement_constraints: z.array(z.string()).max(ONBOARDING_MAX_MULTI).optional(),
  // #2042.11 / #2042.12 / #2042.13 / #2042.14 — quatre états NOMMÉS, non
  // exclusifs (un client peut être à la fois « déjà connu » et « rentable ») :
  // ce que l'utilisateur observe DÉJÀ dans son portefeuille actuel au regard du
  // profil qu'il vient de décrire. Jamais un score, jamais une probabilité —
  // quatre constats qu'on coche ou pas.
  ideal_client_current_state: z.array(z.string()).max(ONBOARDING_MAX_MULTI).optional(),
}
