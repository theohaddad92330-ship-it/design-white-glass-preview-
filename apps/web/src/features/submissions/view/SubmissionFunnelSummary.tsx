import type { SubmissionFunnel } from '@bellum/contracts'
import { Box, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * L'ENTONNOIR DES POSITIONNEMENTS, EN UNE CARTE — extrait de l'ancien écran Positionnements
 * (L2 Pilotage › Pipe, 14/10/2026) pour être lu AUSSI sur `/pilotage/pipe`
 * sans être recopié : deux écrans, un seul texte, les mêmes règles
 * d'honnêteté.
 *
 *  · un taux sans dénominateur dit « pas encore mesurable », jamais « 0 % » ;
 *  · les envois restés SANS retour sont comptés à part (un silence n'est pas un refus) ;
 *  · le délai de retour est une MÉDIANE qui attend son échantillon minimal.
 */
export function SubmissionFunnelSummary({ funnel }: { funnel: SubmissionFunnel }) {
  const { t } = useTranslation('submissions')
  return (
    <Card className="p-3">
      <Box display="flex" className="flex-wrap items-center gap-x-4 gap-y-1">
        <Text size="sm" weight="medium">
          {t('funnel.submitted', { count: funnel.submitted })}
        </Text>
        <Text size="xs" color="text-muted-foreground">
          {funnel.acceptanceRate === null
            ? t('funnel.rateUnknown')
            : t('funnel.rate', { value: Math.round(funnel.acceptanceRate * 100) })}
        </Text>
        <Text size="xs" color="text-muted-foreground">
          {funnel.medianDaysToFeedback === null
            ? t('funnel.medianUnknown')
            : t('funnel.median', { count: funnel.medianDaysToFeedback })}
        </Text>
        {funnel.noFeedback > 0 ? (
          <Text size="xs" color="text-muted-foreground">
            {t('funnel.noFeedback', { count: funnel.noFeedback })}
          </Text>
        ) : null}
      </Box>
    </Card>
  )
}
