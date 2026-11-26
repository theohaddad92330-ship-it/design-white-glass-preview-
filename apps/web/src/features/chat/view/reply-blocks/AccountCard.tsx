import { useTranslation } from 'react-i18next'
import { Building2 } from 'lucide-react'
import { Text } from '@bellum/ui'
import { renderInlineMarkdown } from '../markdown'
import { AccountLogo } from './AccountLogo'
import { FollowUps } from './AccountRankingCard'
import {
  CardLink,
  InlineLabel,
  ItemName,
  LabeledLines,
  NotEvaluated,
  ReplyCard,
  SourceBadge,
  type BlockOf,
} from './ReplyCard'

// #2271.16 — la fiche de compte rendue DANS la conversation.
//
// Avant cette carte, Laura ne pouvait que citer un lien markdown vers
// `/accounts/<id>` : pour VOIR le compte, il fallait quitter le fil. Ici le
// nom, le logo et l'essentiel arrivent dans la bulle, et `href` reste le
// SEUL chemin vers la fiche complète — cette carte ne recalcule rien, elle
// réutilise le briefing déjà produit côté IA (`build_account_briefing`) et
// mène vers l'écran qui, lui, porte tout le détail.
export function AccountCard({ block }: { block: BlockOf<'account_card'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={t('blocks.kind.account_card')} icon={Building2}>
      <div className="flex min-w-0 items-start gap-2">
        <AccountLogo name={block.name} href={block.href} />
        <div className="min-w-0 flex-1 space-y-1">
          <ItemName name={block.name} href={block.href} />
          {block.verdict ? (
            <Text size="sm" color="text-[var(--bellum-text-primary)]">
              {renderInlineMarkdown(block.verdict)}
            </Text>
          ) : null}
          <LabeledLines label={t('blocks.why')} lines={block.highlights} />
          <LabeledLines label={t('blocks.limits')} lines={block.limits} />
          <NotEvaluated items={block.not_evaluated} />
          {block.action ? (
            <InlineLabel label={t('blocks.action')}>
              <CardLink href={block.action.href}>{block.action.label}</CardLink>
            </InlineLabel>
          ) : null}
          <SourceBadge source={block.source} />
          {/* #AM.46 — les suites possibles, sans ordre imposé : un clic envoie la phrase à Laura. */}
          <FollowUps items={block.follow_ups} />
          <div>
            <CardLink href={block.href}>{t('blocks.openFiche')}</CardLink>
          </div>
        </div>
      </div>
    </ReplyCard>
  )
}
