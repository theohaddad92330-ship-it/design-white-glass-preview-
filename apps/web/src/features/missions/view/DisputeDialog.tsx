import { Box, Button, Input, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * L'invite d'ouverture d'un litige — partagée par Encaissements et par la fenêtre
 * d'une facture (GA-26 : un geste, une seule invite). Le motif est obligatoire.
 */
export function DisputeDialog({
  pending,
  onCancel,
  onConfirm,
}: {
  pending: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const { t } = useTranslation('missions')
  const [reason, setReason] = useState('')
  return (
    <Box className="rounded-md border border-border p-3">
      <Text size="sm" weight="medium" className="block">
        {t('readiness.disputeTitle')}
      </Text>
      <Text element="p" size="xs" color="text-muted-foreground" className="mt-0.5">
        {t('readiness.disputeHint')}
      </Text>
      <Input
        className="mt-2"
        value={reason}
        onChange={event => setReason(event.target.value)}
        placeholder={t('readiness.disputePlaceholder')}
        aria-label={t('readiness.disputeTitle')}
      />
      <Box display="flex" className="mt-2 gap-2">
        <Button size="sm" disabled={pending || reason.trim().length === 0} onClick={() => onConfirm(reason.trim())}>
          {t('readiness.disputeConfirm')}
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          {t('readiness.disputeAbort')}
        </Button>
      </Box>
    </Box>
  )
}
