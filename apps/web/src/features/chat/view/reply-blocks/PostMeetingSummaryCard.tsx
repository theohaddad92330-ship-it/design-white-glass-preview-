import { useTranslation } from 'react-i18next'
import { ClipboardCheck } from 'lucide-react'
import { Text } from '@bellum/ui'
import { formatDate } from '@/lib/locale'
import { renderInlineMarkdown } from '../markdown'
import { InlineLabel, LabeledLines, ReplyCard, type BlockOf } from './ReplyCard'

/**
 * #3758 (BEL-LAU-1001, reste du lot J14) — le compte rendu de rendez-vous déjà
 * ENREGISTRÉ (`notes.meeting_recap_snapshot`, posé par `MeetingNotesService`
 * au moment de l'approbation), jamais le texte du modèle : décisions, actions
 * (prochaines étapes) et relance, telles qu'elles ont été dérivées ce jour-là.
 *
 * `as_of` est la date d'ENREGISTREMENT de la note, pas celle de la réponse —
 * une date illisible se NOMME (GA-18/19), elle ne s'affiche pas telle quelle
 * (même garde que `TimelineCard`).
 */
export function PostMeetingSummaryCard({ block }: { block: BlockOf<'post_meeting_summary'> }) {
  const { t } = useTranslation('chat')
  const recordedAt = formatDate(block.as_of)
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.post_meeting_summary')} icon={ClipboardCheck}>
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('blocks.recordedAt')} {recordedAt ?? t('blocks.dateUnreadable')}
      </Text>
      <LabeledLines label={t('blocks.decisions')} lines={block.decisions} />
      {block.actions?.length ? (
        <div>
          <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {t('blocks.actions')}
          </Text>
          <ul className="mt-1 space-y-1">
            {block.actions.map((action, index) => (
              <li key={`action-${index}`} className="text-sm text-[var(--bellum-text-secondary)]">
                <span className="font-medium text-[var(--bellum-text-primary)]">
                  {renderInlineMarkdown(action.what)}
                </span>
                {action.owner ? ` — ${t('blocks.owner')} ${action.owner}` : null}
                {action.due ? ` ${t('blocks.when')} ${action.due}` : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {block.reminder ? (
        <InlineLabel label={t('blocks.reminder')}>
          {renderInlineMarkdown(block.reminder.content)}
          {block.reminder.due_label ? ` — ${block.reminder.due_label}` : null}
        </InlineLabel>
      ) : null}
    </ReplyCard>
  )
}
