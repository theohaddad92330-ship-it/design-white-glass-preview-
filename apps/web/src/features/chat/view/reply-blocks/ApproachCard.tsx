import { useTranslation } from 'react-i18next'
import { Target } from 'lucide-react'
import { renderInlineMarkdown } from '../markdown'
import { CardLink, InlineLabel, ReplyCard, type BlockOf } from './ReplyCard'

/**
 * #2429.1 / #2429.13 — l'approche commerciale : Objectif, Angle d'accroche, Cas
 * d'usage, portés par des CHAMPS validés — plus par trois intitulés gras que
 * l'écran devait reconnaître à la lettre.
 *
 * Sans preuve concrète au dossier, `use_case` est absent (jamais inventé) et la
 * carte NOMME ce manque plutôt que de masquer la section.
 */
export function ApproachCard({ block }: { block: BlockOf<'approach'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.approach')} icon={Target}>
      <InlineLabel label={t('blocks.objective')}>{renderInlineMarkdown(block.objective)}</InlineLabel>
      <InlineLabel label={t('blocks.angle')}>{renderInlineMarkdown(block.angle)}</InlineLabel>
      <InlineLabel label={t('blocks.useCase')}>
        {block.use_case ? (
          renderInlineMarkdown(block.use_case)
        ) : (
          <span className="italic text-[var(--bellum-text-muted)]">{t('blocks.noUseCase')}</span>
        )}
      </InlineLabel>
      {block.next_action ? (
        <InlineLabel label={t('blocks.nextAction')}>
          <CardLink href={block.next_action.href}>{block.next_action.label}</CardLink>
        </InlineLabel>
      ) : null}
    </ReplyCard>
  )
}
