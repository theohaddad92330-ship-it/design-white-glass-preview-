import type { Contact } from '@bellum/contracts'
import { Badge, Box, Button, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useExcludeContact, useRestoreContact } from '@/features/contacts/hooks/useExcludeContact'

/**
 * Écarter un contact (PDF 2, items 82-83 — décision de Louis du 21/08).
 *
 * Trois choses tiennent cette carte :
 *
 * 1. **Le motif est obligatoire**, et le bouton reste inerte tant qu'il est
 *    vide. Le serveur le refuse aussi ; le dire à l'écran évite un aller-retour
 *    pour apprendre une règle qu'on aurait pu annoncer.
 * 2. **La conséquence est annoncée AVANT le clic** : les séquences en cours
 *    s'arrêtent. Une relance programmée qui s'annule sans prévenir se découvre
 *    des semaines plus tard, quand personne ne fait le lien.
 * 3. **C'est réversible**, et l'écran le dit. Un geste présenté comme définitif
 *    ne se fait pas, et le contact reste alors dans les listes.
 */
export function ContactExclusion({ contact }: { contact: Contact }) {
  const { t } = useTranslation('contacts')
  const [reason, setReason] = useState('')
  const exclude = useExcludeContact()
  const restore = useRestoreContact()
  const excluded = Boolean(contact.excluded_at)

  return (
    <Box className="rounded-md border border-border bg-card p-4">
      <Box display="flex" className="flex-wrap items-baseline justify-between gap-2">
        <Text element="h3" size="sm" weight="medium">
          {t('exclude.title')}
        </Text>
        {excluded ? <Badge variant="warning">{t('exclude.badge')}</Badge> : null}
      </Box>

      {excluded ? (
        <Box className="mt-2 space-y-2">
          <Text size="sm" color="text-muted-foreground">
            {contact.exclusion_reason
              ? t('exclude.reasonGiven', { reason: contact.exclusion_reason })
              : t('exclude.reasonMissing')}
          </Text>
          <Button size="sm" variant="outline" disabled={restore.isPending} onClick={() => restore.mutate(contact.id)}>
            {t('exclude.restore')}
          </Button>
        </Box>
      ) : (
        <Box className="mt-2 space-y-2">
          <Text size="sm" color="text-muted-foreground">
            {t('exclude.explain')}
          </Text>
          <input
            value={reason}
            onChange={event => setReason(event.target.value)}
            placeholder={t('exclude.reasonPlaceholder')}
            aria-label={t('exclude.reasonPlaceholder')}
            maxLength={500}
            className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
          />
          <Button
            size="sm"
            variant="outline"
            // Inerte tant que le motif est vide : c'est le seul apprentissage
            // que produit un « non », et un champ facultatif serait vide neuf
            // fois sur dix.
            disabled={!reason.trim() || exclude.isPending}
            onClick={() => exclude.mutate({ id: contact.id, reason })}
          >
            {t('exclude.action')}
          </Button>
        </Box>
      )}
    </Box>
  )
}
