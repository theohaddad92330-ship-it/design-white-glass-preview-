import { useTranslation } from 'react-i18next'
import { ListChecks } from 'lucide-react'
import { Text } from '@bellum/ui'
import { renderInlineMarkdown } from '../markdown'
import { InlineLabel, ItemName, ReplyCard, type BlockOf } from './ReplyCard'

/**
 * #1914.6 — un plan d'action en étapes.
 *
 * Toutes les étapes restent visibles : un plan ne se lit pas « top 3 », sa
 * quatrième étape n'est pas moins importante que la première (le contrat en
 * borne le nombre à dix).
 */
export function ActionPlanCard({ block }: { block: BlockOf<'action_plan'> }) {
  const { t } = useTranslation('chat')
  return (
    <ReplyCard type={block.type} title={block.title ?? t('blocks.kind.action_plan')} icon={ListChecks}>
      {block.objective ? (
        <InlineLabel label={t('blocks.objective')}>{renderInlineMarkdown(block.objective)}</InlineLabel>
      ) : null}
      <ol className="space-y-2">
        {block.steps.map((step, index) => {
          const meta = [
            step.when ? `${t('blocks.when')} ${step.when}` : null,
            step.owner ? `${t('blocks.owner')} ${step.owner}` : null,
          ]
            .filter(Boolean)
            .join(' · ')
          return (
            <li key={`step-${index}`} className="flex min-w-0 gap-2">
              <span
                aria-hidden
                className="flex size-5 shrink-0 items-center justify-center rounded-full border border-[var(--bellum-border)] text-xs font-semibold text-[var(--bellum-text-muted)]"
              >
                {index + 1}
              </span>
              <div className="min-w-0 flex-1 space-y-0.5">
                <ItemName name={step.label} href={step.href} />
                {step.detail ? (
                  <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                    {renderInlineMarkdown(step.detail)}
                  </Text>
                ) : null}
                {meta ? (
                  <Text size="xs" color="text-[var(--bellum-text-muted)]">
                    {meta}
                  </Text>
                ) : null}
              </div>
            </li>
          )
        })}
      </ol>
    </ReplyCard>
  )
}
