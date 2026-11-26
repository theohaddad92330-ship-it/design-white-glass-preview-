import type { MeetingFlowStep } from '@bellum/contracts'
import { Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * #4424.2 / #4424.3 — le déroulé du R1 ou du R2. Partagé par le brief d'un
 * rendez-vous d'agenda et par le panneau de la fiche compte (GA-26) : aucun
 * type ne reçoit un déroulé inventé, une liste vide ne rend rien.
 */
export function MeetingFlowCard({ flow }: { flow: readonly MeetingFlowStep[] }) {
  const { t } = useTranslation('briefing')
  if (flow.length === 0) return null
  return (
    <Box className="rounded-xl border border-[var(--bellum-border)] bg-[var(--bellum-surface-1)] p-4">
      <Text element="h3" size="sm" weight="semibold">
        {t('agenda.brief.flow.title')}
      </Text>
      <ol className="mt-2 flex list-decimal flex-col gap-1.5 pl-5">
        {flow.map(step => (
          <li key={step}>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t(`agenda.brief.flow.step.${step}`)}
            </Text>
          </li>
        ))}
      </ol>
    </Box>
  )
}
