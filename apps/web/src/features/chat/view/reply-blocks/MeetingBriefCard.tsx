import { useTranslation } from 'react-i18next'
import { CalendarClock } from 'lucide-react'
import { EntityAvatar, Text } from '@bellum/ui'
import { renderInlineMarkdown } from '../markdown'
import { AccountLogo } from './AccountLogo'
import { personInitials } from './person-initials'
import { InlineLabel, ItemName, LabeledLines, ReplyCard, type BlockOf } from './ReplyCard'

/**
 * #1914.8 — un brief de rendez-vous : pour qui, quand, pour obtenir quoi, avec
 * qui, quoi dire, quoi demander — et ce qu'on ne sait pas encore, écrit plutôt
 * que deviné.
 */
export function MeetingBriefCard({ block }: { block: BlockOf<'meeting_brief'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.meeting_brief')} icon={CalendarClock}>
      {block.account || block.when ? (
        <div className="flex min-w-0 items-center gap-2">
          {block.account ? <AccountLogo name={block.account.name} href={block.account.href} /> : null}
          <div className="min-w-0">
            {block.account ? <ItemName name={block.account.name} href={block.account.href} /> : null}
            {block.when ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {block.when}
              </Text>
            ) : null}
          </div>
        </div>
      ) : null}
      <InlineLabel label={t('blocks.objective')}>{renderInlineMarkdown(block.objective)}</InlineLabel>
      {/* #4424.4 — le pitch de réunion : absent sans profil d'offre, jamais inventé. */}
      {block.pitch ? <InlineLabel label={t('blocks.pitch')}>{renderInlineMarkdown(block.pitch)}</InlineLabel> : null}
      {block.attendees?.length ? (
        <div>
          <Text size="xs" weight="semibold" color="text-[var(--bellum-text-primary)]">
            {t('blocks.attendees')}
          </Text>
          <ul className="mt-1 space-y-1">
            {block.attendees.map((attendee, index) => (
              <li key={`attendee-${index}`} className="flex min-w-0 items-center gap-2">
                <EntityAvatar name={attendee.name} fallback={personInitials(attendee.name)} size="xs" aria-hidden />
                <span className="min-w-0">
                  <ItemName name={attendee.name} href={attendee.href} />
                  {attendee.role ? (
                    <span className="text-xs text-[var(--bellum-text-muted)]"> · {attendee.role}</span>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <LabeledLines label={t('blocks.talkingPoints')} lines={block.talking_points} />
      <LabeledLines label={t('blocks.questions')} lines={block.questions} />
      <LabeledLines label={t('blocks.risks')} lines={block.risks} />
      <LabeledLines label={t('blocks.unknowns')} lines={block.unknowns} />
    </ReplyCard>
  )
}
