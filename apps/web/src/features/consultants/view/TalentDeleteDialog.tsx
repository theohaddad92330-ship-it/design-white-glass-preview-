import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { AlertTriangle } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useTalentDeletionPreview } from '../hooks'

/**
 * Ce que la suppression d'un talent emporte, DIT avant le clic (PDF 3 §7.3).
 *
 * La fiche se supprimait jusqu'ici sans un mot, sur un `DELETE` définitif. Trois
 * listes distinctes, parce que la réalité en a trois : ce que la base efface en
 * cascade, ce qui SURVIT sans plus être rattaché à personne, et ce qui reste par
 * décision. Confondre les deux premières laisserait croire à une suppression
 * propre alors qu'une affectation orpheline fausse la charge d'une mission.
 */
export function TalentDeleteDialog({
  talentId,
  talentName,
  open,
  deleting,
  onOpenChange,
  onConfirm,
}: {
  talentId: string
  talentName: string
  open: boolean
  deleting: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
}) {
  const { t } = useTranslation('consultants')
  const { data: preview, isLoading } = useTalentDeletionPreview(open ? talentId : undefined)

  const blocked = (preview?.blocking.length ?? 0) > 0

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('delete.title', { name: talentName })}</DialogTitle>
          <DialogDescription>{t('delete.description')}</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <Text size="sm" className="text-[var(--bellum-text-muted)]">
            {t('delete.loading')}
          </Text>
        ) : (
          <div className="flex flex-col gap-3">
            {blocked ? (
              <div className="flex gap-2 rounded-md border border-[var(--bellum-danger)] p-3">
                <AlertTriangle className="mt-0.5 size-4 shrink-0 text-[var(--danger-soft-text)]" />
                <Text size="sm">{t('delete.blocked.open_assignments')}</Text>
              </div>
            ) : null}

            {preview && preview.deleted.length > 0 ? (
              <section>
                <Text size="xs" weight="semibold" className="uppercase text-[var(--bellum-text-muted)]">
                  {t('delete.deleted')}
                </Text>
                <ul className="mt-1 list-disc pl-5">
                  {preview.deleted.map(line => (
                    <li key={line.key}>
                      <Text size="sm">{t(`delete.lines.${line.key}`, { count: line.count })}</Text>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {preview && preview.orphaned.length > 0 ? (
              <section>
                <Text size="xs" weight="semibold" className="uppercase text-[var(--bellum-text-muted)]">
                  {t('delete.orphaned')}
                </Text>
                <ul className="mt-1 list-disc pl-5">
                  {preview.orphaned.map(line => (
                    <li key={line.key}>
                      <Text size="sm">{t(`delete.lines.${line.key}`, { count: line.count })}</Text>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <section>
              <Text size="xs" weight="semibold" className="uppercase text-[var(--bellum-text-muted)]">
                {t('delete.kept')}
              </Text>
              <ul className="mt-1 list-disc pl-5">
                {(preview?.kept ?? []).map(key => (
                  <li key={key}>
                    <Text size="sm">{t(`delete.keptLines.${key}`)}</Text>
                  </li>
                ))}
              </ul>
            </section>

            {!blocked && preview && preview.deleted.length === 0 && preview.orphaned.length === 0 ? (
              <Text size="sm" className="text-[var(--bellum-text-secondary)]">
                {t('delete.nothingAttached')}
              </Text>
            ) : null}
          </div>
        )}

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            {t('delete.cancel')}
          </Button>
          <Button variant="destructive" disabled={blocked || isLoading || deleting} onClick={onConfirm}>
            {t('delete.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
