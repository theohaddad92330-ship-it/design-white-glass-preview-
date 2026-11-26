import type { MyMessageDraftItem } from '@bellum/contracts'
import { Badge, Box, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/**
 * Théo B m1.R2 — l'onglet « Brouillons » : ceux que Laura a préparés et que le commercial n'a pas encore validés.
 *
 * Un brouillon VALIDÉ n'est pas perdu : il attend sa programmation dans « À venir » (même source, `validatedAt`).
 * Le corps n'est jamais affiché ici (c96) : l'objet, le canal et l'état suffisent à choisir lequel relire.
 */
export function draftsToReview(drafts: MyMessageDraftItem[]): MyMessageDraftItem[] {
  return drafts.filter(draft => draft.validatedAt === null)
}

export function MailboxDraftsList({ drafts }: { drafts: MyMessageDraftItem[] }) {
  const { t, i18n } = useTranslation('mailbox')
  const toReview = draftsToReview(drafts)

  if (toReview.length === 0) {
    return (
      <Box className="flex flex-col gap-1 rounded-lg border border-dashed border-[var(--bellum-border)] p-6">
        <Text size="sm" weight="medium">
          {t('drafts.empty.title')}
        </Text>
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {t('drafts.empty.subtitle')}
        </Text>
      </Box>
    )
  }

  return (
    <ul aria-label={t('drafts.listAria')} className="flex flex-col gap-2">
      {toReview.map(draft => (
        <li
          key={draft.id}
          className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--bellum-border)] px-3 py-2.5"
        >
          <Box className="flex min-w-0 flex-col gap-0.5">
            <Text size="sm" weight="medium" className="line-clamp-2 break-words">
              {draft.editedSubject ?? draft.subject ?? t('drafts.noSubject')}
            </Text>
            <Text size="xs" className="text-[var(--bellum-text-secondary)]">
              {new Intl.DateTimeFormat(i18n.language, {
                day: 'numeric',
                month: 'short',
                hour: '2-digit',
                minute: '2-digit',
              }).format(new Date(draft.createdAt))}
            </Text>
          </Box>
          <Badge variant="outline" className="shrink-0 text-xs">
            {t('drafts.toReview')}
          </Badge>
        </li>
      ))}
    </ul>
  )
}
