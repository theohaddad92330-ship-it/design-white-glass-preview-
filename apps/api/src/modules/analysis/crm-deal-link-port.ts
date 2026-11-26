/**
 * Lot 762 P5 (GA-07) — LE PORT DU RATTACHEMENT DES DEALS CRM, côté analyse.
 *
 * L'analyse et l'actualisation rejouent le rattachement deal → compte de l'espace. Importer `CrmReadService` dans
 * `analysis.worker.ts` / `research-followups.ts` ferait monter le cliquet des imports service → service (GA-07) :
 * le service dépend donc d'une interface qu'il POSSÈDE, et `analysis.module.ts` branche l'implémentation (`useFactory`
 * avec le port en type de retour, jamais `useExisting` : la compilation prouve que `CrmReadService` le satisfait).
 * Même idiome que `market-path-axis-source.ts`.
 */

/** Le jeton d'injection du rattachement des deals CRM. */
export const CRM_DEAL_LINK_PORT = Symbol('CRM_DEAL_LINK_PORT')

/** Ce que l'analyse demande au CRM : rejouer le rattachement d'UN espace. `null` = rien à rattacher / indisponible. */
export interface CrmDealLinkPort {
  linkDealsForWorkspace(workspaceId: string | null): Promise<number | null>
}
