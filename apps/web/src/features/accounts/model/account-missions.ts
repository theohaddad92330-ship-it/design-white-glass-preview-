import { ACTIONABLE_RENEWAL_WINDOWS, type ActiveMissionRow, type MissionRisk } from '@bellum/contracts'

/**
 * #2124.24 — LES RISQUES D'UNE MISSION ACTIVE, VUS DEPUIS LE DOSSIER COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ PARTIEL, ET ASSUMÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `missionRisks()` (`packages/contracts/src/schemas/mission.ts`) est LE calcul
 * canonique — celui que la fiche mission affiche — et il exige deux données
 * qu'`ActiveMissionRow` ne porte PAS sur le fil : `loadedDailyCostCents` (le
 * coût chargé, gardé par le droit financier) et les relevés d'activité du
 * mois. Cette fonction ne les recalcule PAS et ne les DEVINE pas non plus :
 * elle compose les deux signaux déjà ENVOYÉS par la route
 * (`GET /delivery/accounts/:id/missions`) — `renewal` et `marginPercent`,
 * déjà rédigés par `redactFinance` côté serveur — avec la MÊME constante que
 * le calcul canonique (`ACTIONABLE_RENEWAL_WINDOWS`, importée et non
 * redéfinie). `timesheet_disputed` et `timesheet_missing` restent donc HORS
 * de cette liste : absents du CONTRAT reçu par l'écran, pas absents de la
 * mission. Les ajouter demanderait d'étendre `activeMissionRowSchema`
 * côté API — hors périmètre de ce lot (#2124, lot M1-9).
 *
 * Le gate d'entrée (`status`) est le MÊME que celui de `missionRisks()` :
 * une mission suspendue ne calcule aucun risque, et `null` le dit — distinct
 * d'un tableau vide, qui affirme « calculé, rien à signaler ».
 */
export function visibleMissionRisks(
  row: Pick<ActiveMissionRow, 'renewal' | 'marginPercent' | 'status'>,
  canReadFinance: boolean,
): MissionRisk[] | null {
  if (row.status !== 'active' && row.status !== 'onboarding') return null

  const risks: MissionRisk[] = []

  if (row.renewal === 'unknown') risks.push('no_end_date')
  else if ((ACTIONABLE_RENEWAL_WINDOWS as readonly string[]).includes(row.renewal)) risks.push('renewal_not_started')

  // ⚠️ Jamais de risque de marge sans le droit de la lire — même si
  // `marginPercent` était, par erreur d'un appelant futur, renseigné : un
  // jugement financier ne se porte pas sur un chiffre qu'on n'a pas le droit
  // de voir.
  if (canReadFinance) {
    if (row.marginPercent === null) risks.push('margin_unknown')
    else if (row.marginPercent <= 0) risks.push('margin_at_risk')
  }

  return risks
}
