import { Badge, Box, Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type {
  ContactEnrichmentOutcomeRow,
  EnrichmentOutcomeStatus,
} from '@/features/contacts/lib/enrichmentOutcomeStatus'

/**
 * #2988 (#2161) — l'écran de résultat détaillé d'un lot d'enrichissement,
 * CONTACT PAR CONTACT. Avant ce dialogue, seul un agrégat chiffré existait
 * (`enrichSummary.ts`, affiché en toast) : un lot de cinquante contacts avec
 * quatre échecs ne disait jamais LESQUELS. `rows` porte un statut par
 * contact déjà classé (`classifyEnrichmentOutcome`/`classifyEnrichmentError`)
 * — ce composant ne fait qu'afficher, aucun calcul ici (GA-26).
 *
 * N'affiche que ce qui est passé par le lot : jamais un contact à `0` ligne
 * pour une raison qu'on n'a pas mesurée.
 */
type EnrichmentBatchResultDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  rows: readonly ContactEnrichmentOutcomeRow[]
}

const STATUS_BADGE_VARIANT: Record<EnrichmentOutcomeStatus, 'success' | 'warning' | 'danger' | 'info' | 'default'> = {
  matched_both: 'success',
  matched_email: 'success',
  matched_phone: 'success',
  ambiguous: 'warning',
  newer_data_exists: 'info',
  invalid_coordinate: 'danger',
  opt_out: 'default',
  no_result: 'default',
  insufficient_credits: 'warning',
  service_unavailable: 'warning',
  technical_error: 'danger',
  not_processed: 'warning',
}

const STATUS_LABEL_KEY: Record<EnrichmentOutcomeStatus, string> = {
  matched_both: 'enrich.batchResult.status.matchedBoth',
  matched_email: 'enrich.batchResult.status.matchedEmail',
  matched_phone: 'enrich.batchResult.status.matchedPhone',
  ambiguous: 'enrich.batchResult.status.ambiguous',
  newer_data_exists: 'enrich.batchResult.status.newerDataExists',
  invalid_coordinate: 'enrich.batchResult.status.invalidCoordinate',
  opt_out: 'enrich.batchResult.status.optOut',
  no_result: 'enrich.batchResult.status.noResult',
  insufficient_credits: 'enrich.batchResult.status.insufficientCredits',
  service_unavailable: 'enrich.batchResult.status.serviceUnavailable',
  technical_error: 'enrich.batchResult.status.technicalError',
  not_processed: 'enrich.batchResult.status.notProcessed',
}

export function EnrichmentBatchResultDialog({ open, onOpenChange, rows }: EnrichmentBatchResultDialogProps) {
  const { t } = useTranslation('contacts')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="sm:max-w-lg border-[var(--bellum-border)]">
        <DialogHeader>
          <DialogTitle className="text-[var(--bellum-text-primary)]">
            {t('enrich.batchResult.title', { count: rows.length })}
          </DialogTitle>
          <DialogDescription className="text-[var(--bellum-text-secondary)]">
            {t('enrich.batchResult.listAria')}
          </DialogDescription>
        </DialogHeader>

        <Box className="max-h-[60vh] overflow-y-auto" role="list" aria-label={t('enrich.batchResult.listAria')}>
          {rows.map(row => (
            <Box
              key={row.contactId}
              role="listitem"
              display="flex"
              className="items-center justify-between gap-3 border-b border-[var(--bellum-border)] py-2 last:border-b-0"
            >
              <Text size="sm" className="truncate text-[var(--bellum-text-primary)]">
                {row.fullName}
              </Text>
              <Badge variant={STATUS_BADGE_VARIANT[row.status]} className="shrink-0">
                {t(STATUS_LABEL_KEY[row.status])}
              </Badge>
            </Box>
          ))}
        </Box>
      </DialogContent>
    </Dialog>
  )
}
