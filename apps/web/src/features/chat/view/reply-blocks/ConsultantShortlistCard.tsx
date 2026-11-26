import { useTranslation } from 'react-i18next'
import { UserCheck } from 'lucide-react'
import { EntityAvatar, Text } from '@bellum/ui'
import { renderInlineMarkdown } from '../markdown'
import {
  InlineLabel,
  ItemName,
  LabeledLines,
  NotEvaluated,
  ReplyCard,
  SourceBadge,
  TopThenRest,
  type BlockOf,
} from './ReplyCard'
import { personInitials } from './person-initials'

type ShortlistedConsultant = BlockOf<'consultant_shortlist'>['items'][number]

/**
 * #1914.7 — une shortlist de consultants.
 *
 * Ce qui colle ET ce qui manque, côte à côte : une shortlist qui ne montre que
 * les points forts se découvre en rendez-vous. Aucun critère protégé n'a de
 * champ ici — ni âge, ni photo — et l'ordre est celui que Laura justifie par
 * « ce qui colle ».
 */
export function ConsultantShortlistCard({ block }: { block: BlockOf<'consultant_shortlist'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.consultant_shortlist')} icon={UserCheck}>
      {block.need ? <InlineLabel label={t('blocks.need')}>{renderInlineMarkdown(block.need)}</InlineLabel> : null}
      <TopThenRest items={block.items} renderItem={item => <ConsultantRow item={item} />} />
      <NotEvaluated items={block.not_evaluated} />
    </ReplyCard>
  )
}

function ConsultantRow({ item }: { item: ShortlistedConsultant }) {
  const { t } = useTranslation('chat')
  return (
    <div className="flex min-w-0 items-start gap-2">
      <EntityAvatar name={item.name} fallback={personInitials(item.name)} size="xs" aria-hidden />
      <div className="min-w-0 flex-1 space-y-1">
        <ItemName name={item.name} href={item.href} />
        {item.headline ? (
          <Text size="xs" color="text-[var(--bellum-text-muted)]">
            {renderInlineMarkdown(item.headline)}
          </Text>
        ) : null}
        {item.availability ? (
          <InlineLabel label={t('blocks.availability')}>{renderInlineMarkdown(item.availability)}</InlineLabel>
        ) : null}
        <LabeledLines label={t('blocks.fit')} lines={item.fit} />
        <LabeledLines label={t('blocks.gaps')} lines={item.gaps} />
        <SourceBadge source={item.source} />
      </div>
    </div>
  )
}
