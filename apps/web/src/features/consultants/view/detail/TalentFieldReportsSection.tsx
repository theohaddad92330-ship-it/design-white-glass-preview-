import { Box, Button, Card, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import type { ConsultantFieldReport } from '@bellum/contracts'
import { formatDateTime } from '@/lib/locale'
import { TalentFieldReportDialog } from './TalentFieldReportDialog'

/**
 * #3406 (retour bêta #3406) — « Renseignement terrain » : capitaliser ce
 * qu'un consultant en mission (ou passé par un compte) a bien voulu
 * remonter, avec sa provenance complète et son veto d'usage commercial.
 *
 * Une carte à part de `Group`/`Row` (TalentProfileTab.tsx) : ce n'est pas une
 * paire clé/valeur de la fiche, c'est un HISTORIQUE append-only — chaque
 * entrée garde sa propre date, sa propre confidentialité, sa propre
 * confiance (doctrine « on archive, on ne supprime pas »).
 */
export function TalentFieldReportsSection({
  talentId,
  reports,
}: {
  talentId: string
  reports: readonly ConsultantFieldReport[]
}) {
  const { t } = useTranslation('consultants')
  const [open, setOpen] = useState(false)

  return (
    <Card className="p-4">
      <Box display="flex" className="items-start justify-between gap-2">
        <div>
          <Text size="base" weight="semibold" element="h3">
            {t('detail.fieldReports.title')}
          </Text>
          <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
            {t('detail.fieldReports.subtitle')}
          </Text>
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          {t('detail.fieldReports.add')}
        </Button>
      </Box>

      {/* Une liste vide le DIT — elle ne disparaît pas (GA-18/19). */}
      {reports.length === 0 ? (
        <Text element="p" size="sm" className="mt-2 text-[var(--bellum-text-muted)]">
          {t('detail.fieldReports.empty')}
        </Text>
      ) : (
        <ul className="mt-2 flex flex-col gap-2">
          {reports.map(report => (
            <li key={report.id} className="rounded-lg border border-[var(--bellum-border)] p-3">
              <Box display="flex" className="flex-wrap items-center justify-between gap-2">
                <Text size="sm" weight="medium">
                  {report.accountName ?? t('detail.notProvided')}
                </Text>
                <Text size="xs" className="text-[var(--bellum-text-muted)]">
                  {formatDateTime(report.declaredAt)}
                  {report.recordedByName ? ` · ${report.recordedByName}` : ''}
                </Text>
              </Box>
              <Box display="flex" className="mt-1 flex-wrap gap-1.5">
                <Text size="xs" className="rounded bg-[var(--bellum-surface-2)] px-1.5 py-0.5">
                  {t(`detail.fieldReports.confidentialityLevels.${report.confidentialityLevel}`)}
                </Text>
                <Text size="xs" className="rounded bg-[var(--bellum-surface-2)] px-1.5 py-0.5">
                  {t(`detail.fieldReports.confidenceLevels.${report.confidence}`)}
                </Text>
                {report.notForCommercialUse ? (
                  <Text
                    size="xs"
                    className="rounded bg-[var(--warning-soft-bg)] px-1.5 py-0.5 text-[var(--warning-soft-text)]"
                  >
                    {t('detail.fieldReports.notForCommercialUseBadge')}
                  </Text>
                ) : null}
              </Box>
              {report.uncoveredNeed ? (
                <Text element="p" size="sm" className="mt-1.5">
                  {report.uncoveredNeed}
                </Text>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      <TalentFieldReportDialog talentId={talentId} open={open} onOpenChange={setOpen} />
    </Card>
  )
}
