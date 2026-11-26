import { isMeetingImminent } from '@bellum/contracts'
import type { BriefingAction } from '@bellum/contracts'

/**
 * #2389.6 — LES QUATRE ÉTIQUETTES DU BRIEF, et pourquoi chaque genre tombe où
 * il tombe.
 *
 * Les définitions viennent du corps de l'issue #2389 (§DISTINCTION), pas d'une
 * opinion posée ici :
 *   URGENT        deadline ou perte immédiate ;
 *   IMPORTANT     impact fort sans urgence immédiate ;
 *   OPPORTUNITÉ   action à potentiel ;
 *   ADMINISTRATIF à traiter mais ne doit pas écraser le commercial.
 *
 * `kind` (huit valeurs, `daily-briefing.ts`) est déjà ce que le serveur classe ;
 * cette table ne le recalcule pas, elle le LIT sous l'angle de l'urgence :
 *
 *  - `conflict` (deux rendez-vous qui se chevauchent MAINTENANT) et
 *    `mission_end` (une échéance) sont une perte immédiate par construction ;
 *  - `meeting_prep`/`follow_up`/`reply` pèsent sur la relation commerciale
 *    sans échéance fixe : IMPORTANT, sauf si `expiresAt` tombe dans l'heure
 *    (`isMeetingImminent`, même horizon que la préparation de rendez-vous) —
 *    une échéance qui approche fait basculer N'IMPORTE QUEL genre en URGENT ;
 *  - `account` (signal frais) et `need_stale` (besoin sans shortlist) sont
 *    l'un et l'autre « une action À POTENTIEL » au sens littéral de la
 *    définition ;
 *  - `task` reste ADMINISTRATIF : un genre générique, jamais celui qui pousse
 *    le commercial.
 */
export type BriefingUrgencyTier = 'urgent' | 'important' | 'opportunity' | 'administrative'

const KIND_TIER: Record<BriefingAction['kind'], BriefingUrgencyTier> = {
  conflict: 'urgent',
  mission_end: 'urgent',
  // #2095.7 — un impayé est une perte déjà EN COURS (l'échéance est passée),
  // pas seulement une échéance qui approche : même tier que `conflict` et
  // `mission_end`.
  payment_overdue: 'urgent',
  // #2095.8 — une échéance d'appel d'offres manquée est une perte TOTALE et
  // définitive de l'opportunité : « deadline » au sens littéral de la
  // définition.
  rfp_due: 'urgent',
  meeting_prep: 'important',
  follow_up: 'important',
  reply: 'important',
  account: 'opportunity',
  need_stale: 'opportunity',
  // #2106.6 — un consultant qui se libère bientôt est une action À POTENTIEL
  // (le proposer sur un besoin), même famille que `account`/`need_stale`.
  consultant_available: 'opportunity',
  // #2107.6 — un rappel de fraîcheur de DONNÉE (reconfirmer une disponibilité
  // saisie il y a longtemps), pas une action commerciale : même famille que
  // `task`, jamais celle qui pousse le commercial.
  availability_reconfirm: 'administrative',
  // #2107.8 — un manque de DONNÉE (aucune date de fin saisie), pas une
  // échéance commerciale : même famille que `availability_reconfirm`/`task`.
  mission_no_end_date: 'administrative',
  // #2107.15 — un droit d'écriture retiré empêche D'AGIR (relances, préparation
  // de rendez-vous) sans échéance fixe propre à lui : IMPORTANT, comme
  // `meeting_prep`/`follow_up`/`reply` juste au-dessus — jamais ADMINISTRATIF,
  // qui réserverait un genre générique à un blocage réel.
  connector_broken: 'important',
  // #2107.10 — même échéance que `mission_end` (perte imminente par
  // construction), même famille : URGENT.
  renewal_not_engaged: 'urgent',
  // #2107.4 — un silence client est une action À POTENTIEL (relancer),
  // même famille que `account`/`need_stale`/`consultant_available`.
  submission_no_response: 'opportunity',
  // #2107.14 — même échéance que `rfp_due` (perte immédiate par
  // construction : l'export peut fermer sans que l'exigence soit couverte),
  // même famille : URGENT.
  rfp_requirement_gap: 'urgent',
  // #2107.18 — un manque de DONNÉE (aucun propriétaire assigné), pas une
  // échéance commerciale : même famille que `mission_no_end_date`/
  // `availability_reconfirm`/`task`.
  account_no_owner: 'administrative',
  // #2106.9/#2107.1 (doublon, épopée #2801) — un manque de DONNÉE (aucune
  // tâche encore ouverte rattachée), pas une échéance commerciale : même
  // famille que `account_no_owner`/`mission_no_end_date`.
  project_no_next_action: 'administrative',
  // #2107.2 (épopée #2801) — une affaire vieillissante est une action À
  // POTENTIEL (la relancer, la qualifier, ou décider de la clore), même
  // famille que `account`/`need_stale`/`submission_no_response`.
  project_stale: 'opportunity',
  // #2107.9 — un CRA manquant sur un mois DÉJÀ CLOS est une perte de revenu EN
  // COURS, jamais seulement une échéance qui approche : même famille que
  // `payment_overdue`/`renewal_not_engaged`, doctrine `invoice-readiness.ts`
  // (« le cas le plus coûteux : il ne se signale nulle part, et le mois passe »).
  cra_missing: 'urgent',
  // #2107.11 — un mois prêt à facturer, sans bloqueur restant, est une action
  // À POTENTIEL (préparer la facture) : même famille que `account`/
  // `need_stale`/`submission_no_response`.
  invoice_ready: 'opportunity',
  // #2107.16 — un manque de DONNÉE structurelle (TJM, PO, contact de
  // facturation, date de début, coût chargé), pas une échéance commerciale :
  // même famille que `mission_no_end_date`/`account_no_owner`.
  invoicing_blocked_missing_data: 'administrative',
  // #2095.41 (épopée #2993) — une coordonnée en échec (rebond) est un manque
  // de DONNÉE à corriger, pas une échéance commerciale : même famille que
  // `account_no_owner`/`mission_no_end_date`.
  contact_bounced: 'administrative',
  // #2095.12 (épopée #2993) — un rendez-vous client tenu SANS SUITE écrite
  // pèse sur la relation commerciale sans échéance fixe : même famille que
  // `meeting_prep`/`follow_up`/`reply`/`connector_broken`.
  meeting_no_followup: 'important',
  task: 'administrative',
  // L1 (31/10/2026) — les cinq familles du moteur de cartes.
  // #2095.6 — un mois bloqué est un revenu qui ne part pas : même famille que
  // `cra_missing`.
  invoice_blocked: 'urgent',
  // #2095.10 / #2107.16 / #2095.49 — un manque de DONNÉE, même famille que
  // `invoicing_blocked_missing_data`.
  critical_data_missing: 'administrative',
  // #2095.45 — un démarrage a une date fixe et engage un tiers : comme
  // `meeting_prep`.
  mission_starting: 'important',
  // #2095.45 — un avenant non signé se relance, sans échéance propre.
  mission_amendment_pending: 'important',
  // #2095.41 — un interlocuteur parti est une relation à reprendre.
  contact_left: 'important',
}

export function briefingActionUrgencyTier(
  action: Pick<BriefingAction, 'kind' | 'expiresAt'>,
  now: Date,
): BriefingUrgencyTier {
  // Une échéance qui approche prime sur le genre : c'est la définition même
  // d'URGENT (« deadline ou perte immédiate »), quel que soit ce que la carte
  // raconte par ailleurs.
  if (isMeetingImminent(action.expiresAt, now)) return 'urgent'
  return KIND_TIER[action.kind]
}
