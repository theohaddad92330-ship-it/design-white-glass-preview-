import { MISSION_DRIFT_THRESHOLDS, type MissionDriftReport } from '@bellum/contracts'
import { Box, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { useMissionDrift } from '@/features/missions/api'

/**
 * « LA MISSION QUI DÉRAPE » — PDF 5 §7.2.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE CE PANNEAU MONTRE, ET DANS QUEL ORDRE
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. les missions qui DÉRAPENT — deux signaux au moins, sur trois mois au moins ;
 * 2. celles qu'on NE SAIT PAS LIRE, avec ce qui manque.
 *
 * Le second bloc est le plus important, et c'est celui qu'on est tenté de
 * retirer : « non mesuré » n'est jamais « pas de dérive ». Une mission dont le
 * CRA n'arrive pas est justement celle qu'il faut regarder — la faire
 * disparaître d'un écran de suivi la rendrait invisible deux fois.
 *
 * Les missions saines ne s'affichent PAS : ce panneau existe pour ce qui demande
 * une action, et une liste où tout figure ne se lit plus.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX SIGNAUX SONT AVEUGLES DANS CE DÉPÔT, ET LE PANNEAU LE DIT
 * ─────────────────────────────────────────────────────────────────────────────
 * Aucune date de remise de CRA n'existe, aucune donnée de satisfaction non plus
 * (ni table, ni envoi, ni collecte). Les deux signaux correspondants remontent
 * donc dans `unmeasurable` sur TOUTES les missions, et ils sont NOMMÉS. Les
 * taire ferait croire que cinq signaux ont été regardés.
 */
export function MissionDriftPanel({ missionId }: { missionId?: string }) {
  const { t } = useTranslation('missionTracking')
  const drift = useMissionDrift()

  // Théo C missions-dossier.A5 — sur le dossier d'UNE mission, seul son rapport compte.
  const reports = (drift.data ?? []).filter(report => missionId === undefined || report.missionId === missionId)
  const drifting = reports.filter(report => report.verdict.kind === 'drifting')
  const unreadable = reports.filter(report => report.verdict.kind === 'unmeasurable')

  // Rien à dire tant que rien n'est chargé, et rien à dire quand aucune mission
  // ne dérape ET qu'aucune n'est illisible : un panneau vide n'apprend rien.
  if (drift.isPending) return null
  if (drifting.length === 0 && unreadable.length === 0) {
    // Théo C missions-dossier.N7 — sur UNE mission, le silence se dit : ce qu'on n'a pas relevé n'est pas
    // une garantie. Sur le portefeuille, un panneau vide reste muet.
    if (missionId === undefined) return null
    return (
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('drift.noneForMission')}
      </Text>
    )
  }

  return (
    <Card className="p-4">
      <Text size="sm" weight="semibold" element="h2">
        {missionId === undefined ? t('drift.title') : t('drift.titleForMission')}
      </Text>
      <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1 block">
        {t('drift.rule', {
          signals: MISSION_DRIFT_THRESHOLDS.minimumSignals,
          months: MISSION_DRIFT_THRESHOLDS.minimumMonths,
        })}
      </Text>

      {drifting.length > 0 && (
        <Box className="mt-3 flex flex-col gap-3">
          {drifting.map(report => (
            <DriftRow key={report.missionId} report={report} />
          ))}
        </Box>
      )}

      {unreadable.length > 0 && (
        <Box className="mt-4 border-t border-[var(--bellum-border)] pt-3">
          <Text size="xs" weight="semibold" color="text-[var(--bellum-text-secondary)]">
            {t('drift.unreadable.title', { count: unreadable.length })}
          </Text>
          <Box className="mt-2 flex flex-col gap-2">
            {unreadable.map(report => (
              <DriftRow key={report.missionId} report={report} />
            ))}
          </Box>
        </Box>
      )}
    </Card>
  )
}

function DriftRow({ report }: { report: MissionDriftReport }) {
  const { t } = useTranslation('missionTracking')
  const { verdict } = report
  const firing = verdict.kind === 'drifting' ? verdict.signals : []

  return (
    <Box className="flex flex-col gap-1">
      <Text size="sm" weight="medium">
        {report.accountName ? `${report.accountName} · ${report.missionLabel}` : report.missionLabel}
      </Text>

      {firing.length > 0 && (
        <Text size="xs" color="text-[var(--bellum-warning-text)]">
          {t('drift.firing', {
            signals: firing.map(signal => t(`drift.signals.${signal}`)).join(' · '),
            months: verdict.months,
          })}
        </Text>
      )}

      {/* ⚠️ Ce qui n'a PAS pu être évalué est nommé, toujours. Sans cette ligne,
          « deux signaux sur cinq » se lirait « trois vont bien ». */}
      {verdict.unmeasurable.length > 0 && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('drift.notMeasured', {
            signals: verdict.unmeasurable.map(signal => t(`drift.signals.${signal}`)).join(' · '),
          })}
        </Text>
      )}

      {verdict.kind === 'unmeasurable' && verdict.months < MISSION_DRIFT_THRESHOLDS.minimumMonths && (
        <Text size="xs" color="text-[var(--bellum-text-muted)]">
          {t('drift.tooShort', { months: verdict.months, needed: MISSION_DRIFT_THRESHOLDS.minimumMonths })}
        </Text>
      )}
    </Box>
  )
}
