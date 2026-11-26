/**
 * Ce que `AdminModule` FOURNIT au calcul de santé client, sous forme de jeton
 * (#1652 — même gabarit que `business-metrics/module-tokens.ts`, #1645).
 *
 * POURQUOI UN JETON PLUTÔT QU'UN SERVICE INJECTÉ
 * GA-07 (`module-boundaries.spec.ts`) est un CLIQUET, et il est AU PLAFOND :
 * 253 imports service → service pour un plafond de 254, et **124 fichiers pour
 * un plafond de 124**. Un fichier NEUF qui importerait `PlanCatalogService`
 * ferait donc tomber la garde sur son second compteur, quoi qu'il arrive au
 * premier. Le relever demanderait un arbitrage écrit — et il n'y a rien à
 * arbitrer : la santé d'un espace n'a pas besoin du catalogue d'offres, elle a
 * besoin de TROIS dictionnaires (le prix du palier, le prix d'un siège, le
 * nombre de sièges inclus) et du libellé à afficher.
 *
 * La composition se fait donc dans `admin.module.ts`, la couche prévue pour ça
 * et que GA-07 exempte explicitement, et le service ne connaît que la FORME de
 * ce qu'il reçoit.
 *
 * Corollaire volontaire, repris mot pour mot de #1645 : **les prix ne sont
 * JAMAIS recopiés ici.** Une grille recopiée diverge le jour où l'opérateur
 * change un tarif, et l'écran se mettrait à afficher un MRR mesuré sur une
 * grille morte.
 */

/** Le jeton d'injection. Une chaîne, pour rester lisible dans une erreur Nest. */
export const CLIENT_PLAN_GRIDS = 'ADMIN_CLIENT_HEALTH_PLAN_GRIDS'

/**
 * Les quatre vues du catalogue dont l'écran a besoin, indexées par clé de plan.
 *
 * ⚠️ Une clé ABSENTE de `priceCents` n'est pas un plan à zéro euro : c'est un
 * plan qu'on ne sait pas tarifer. Le service en fait un MRR `null`, jamais un 0.
 */
export interface ClientPlanGrids {
  /** `clé de plan → prix mensuel en centimes`. */
  priceCents: Record<string, number>
  /** `clé de plan → prix mensuel d'UN siège supplémentaire, en centimes`. */
  seatCents: Record<string, number>
  /** `clé de plan → sièges INCLUS dans le palier`. */
  seats: Record<string, number>
  /** `clé de plan → libellé affiché`. Le back-office montre « Growth », pas `growth`. */
  labels: Record<string, string>
}

/** Ce que le module fournit sous {@link CLIENT_PLAN_GRIDS}. */
export type ClientPlanGridsReader = () => Promise<ClientPlanGrids>
