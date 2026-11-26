import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import type { GlobalContact } from '@/features/contacts/hooks/useContacts'
import { reviewSelection } from '@/features/contacts/selection/selection-review'

/**
 * #3701.3 / #3701.7 / #3701.8 — LA REVUE AVANT TRAITEMENT.
 *
 * Même gabarit que `CreateTargetListDialog`. Elle montre le nombre EXACT, les
 * exclus, les fiches sans e-mail et les homonymes (jamais fusionnés), AVANT
 * d'étendre ou de traiter la sélection. Rien n'est retiré en silence : chaque
 * cas est nommé avec ses noms. Aucun envoi, aucun débit : la revue ne fait que
 * lire. `onConfirm` absent = revue seule (« Revoir la sélection »).
 */
export function SelectionReviewDialog({
  open,
  onOpenChange,
  contacts,
  total,
  capped,
  failed,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  contacts: readonly GlobalContact[]
  /** Total des résultats du jeu filtré — pour dire « 250 sur 300 ». */
  total?: number
  capped?: boolean
  failed?: boolean
  onConfirm?: () => void
}) {
  const { t } = useTranslation('contacts')
  const review = reviewSelection(contacts)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close', { defaultValue: 'Fermer' })} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('selection.review.title', { count: review.total })}</DialogTitle>
          <DialogDescription>
            {capped && total !== undefined
              ? t('selection.review.capped', { count: review.total, total })
              : t('selection.review.exact', { count: review.total })}
          </DialogDescription>
        </DialogHeader>
        <Box className="flex max-h-72 flex-col gap-3 overflow-y-auto">
          {failed ? (
            <Text size="xs" role="alert" className="text-[var(--warning-soft-text)]">
              {t('selection.review.failed', { count: review.total })}
            </Text>
          ) : null}
          {review.excluded.length > 0 ? (
            <ReviewBlock
              title={t('selection.review.excluded', { count: review.excluded.length })}
              names={review.excluded.map(contact => contact.full_name)}
            />
          ) : null}
          {review.withoutEmail.length > 0 ? (
            <ReviewBlock
              title={t('selection.review.withoutEmail', { count: review.withoutEmail.length })}
              names={review.withoutEmail.map(contact => contact.full_name)}
            />
          ) : null}
          {review.homonymGroups.length > 0 ? (
            <ReviewBlock
              title={t('selection.review.homonyms', { count: review.homonymGroups.length })}
              names={review.homonymGroups.map(group =>
                group
                  .map(contact => `${contact.full_name} (${contact.email || t('selection.review.noEmail')})`)
                  .join(' · '),
              )}
            />
          ) : null}
          {review.excluded.length === 0 && review.withoutEmail.length === 0 && review.homonymGroups.length === 0 ? (
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {t('selection.review.clean')}
            </Text>
          ) : null}
        </Box>
        <Text size="xs" className="text-[var(--bellum-text-secondary)]">
          {t('selection.review.noSideEffect')}
        </Text>
        <DialogFooter>
          <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            {onConfirm ? t('selection.review.cancel') : t('selection.review.close')}
          </Button>
          {onConfirm ? (
            <Button type="button" variant="black" size="sm" onClick={onConfirm} disabled={review.total === 0}>
              {t('selection.review.confirm', { count: review.total })}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ReviewBlock({ title, names }: { title: string; names: string[] }) {
  return (
    <Box className="flex flex-col gap-1 rounded-md border border-[var(--bellum-border)] p-2">
      <Text size="xs" weight="medium">
        {title}
      </Text>
      {names.map(name => (
        <Text key={name} size="xs" className="text-[var(--bellum-text-secondary)]">
          {name}
        </Text>
      ))}
    </Box>
  )
}
