import { Box, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { formatDateTime } from '@/lib/locale'
import { useSubmissionTimeline } from '../api'

/**
 * #2335.3 (LAU-FINAL-076) — la timeline d'UN positionnement : chaque étape
 * franchie, avec sa date, dans l'ordre où elle est arrivée.
 *
 * Lecture seule : la trace vient de `SubmissionsService.trace()`, déjà écrite
 * à chaque avancée (`activities`, préfixe `submission:<id>:`) — rien ne
 * s'ajoute depuis cet écran.
 */
export function SubmissionTimelineDialog({
  submissionId,
  talentName,
  open,
  onClose,
}: {
  submissionId: string
  talentName: string
  open: boolean
  onClose: () => void
}) {
  const { t } = useTranslation('submissions')
  const { data: items, isLoading, isError } = useSubmissionTimeline(open ? submissionId : undefined)

  return (
    <Dialog open={open} onOpenChange={next => (next ? undefined : onClose())}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('timeline.title', { name: talentName })}</DialogTitle>
          <DialogDescription>{t('timeline.description')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Text size="sm" color="text-muted-foreground">
            {t('common:states.loading')}
          </Text>
        ) : isError ? (
          // #3666.k — une lecture en échec n'est pas « aucun événement ».
          <QueryLoadError />
        ) : items && items.length > 0 ? (
          <Box className="space-y-2">
            {items.map((event, index) => (
              <Box
                key={`${event.occurredAt}-${index}`}
                className="border-b border-border pb-2 last:border-b-0 last:pb-0"
              >
                <Text element="p" size="sm">
                  {event.subject ?? t('timeline.unnamedStep')}
                </Text>
                <Text element="p" size="xs" color="text-muted-foreground">
                  {formatDateTime(event.occurredAt) ?? t('timeline.unknownDate')}
                </Text>
              </Box>
            ))}
          </Box>
        ) : (
          <Text size="sm" color="text-muted-foreground">
            {t('timeline.empty')}
          </Text>
        )}
      </DialogContent>
    </Dialog>
  )
}
