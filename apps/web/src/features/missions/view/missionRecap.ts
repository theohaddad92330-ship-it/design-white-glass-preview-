import type { TFunction } from 'i18next'
import { assigneesOf, type MissionView } from '../api'

/**
 * Théo C missions-dossier.N6 — les lignes de « Exporter le récapitulatif » : ce que l'en-tête du dossier
 * dit déjà (aucun montant : la rédaction financière du serveur n'est pas contournée). Le CSV ne sort que
 * par `downloadCSV`, derrière la règle d'espace « qui peut exporter ».
 */
export function missionRecapRows(mission: MissionView, t: TFunction<'missions'>): string[][] {
  const consultants = assigneesOf(mission)
    .map(person => person.fullName)
    .join(', ')
  return [
    [t('recap.mission'), mission.label ?? ''],
    [t('recap.account'), mission.accountName ?? ''],
    [t('recap.status'), t(`status.${mission.status}`)],
    [t('recap.startedOn'), mission.started_on ?? ''],
    [t('recap.endsOn'), mission.ends_on ?? t('recap.noEndDate')],
    [t('recap.consultants'), consultants],
  ]
}
