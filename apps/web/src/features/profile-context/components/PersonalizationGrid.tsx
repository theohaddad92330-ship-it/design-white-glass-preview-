import { useTranslation } from 'react-i18next'
import type { ProfileContext } from '@bellum/contracts'
import { FieldText, Text } from '@bellum/ui'
import { CollapsibleSection } from './CollapsibleSection'

export function PersonalizationGrid({ context, tone = 'light' }: { context: ProfileContext; tone?: 'light' | 'dark' }) {
  const { t } = useTranslation('profile')
  const summary = context.welcomeSummary
  const cards: Array<{ title: string; body: string }> = [
    { title: t('context.personalization.searches'), body: summary?.searchesPersonalization ?? '' },
    { title: t('context.personalization.contacts'), body: summary?.contactsPersonalization ?? '' },
    { title: t('context.personalization.messages'), body: summary?.messagesPersonalization ?? '' },
    { title: t('context.personalization.scoring'), body: summary?.scoringPersonalization ?? '' },
  ]
  return (
    <section className="space-y-4">
      <Text element="h2" size="lg" weight="semibold">
        {t('context.personalization.title')}
      </Text>
      <div className="grid grid-cols-1 gap-4">
        {cards.map(card => (
          <CollapsibleSection key={card.title} label={card.title} labelClassName="text-sm font-semibold" tone={tone}>
            <Text element="p" size="sm" className="text-[var(--bellum-text-primary)] leading-relaxed">
              <FieldText value={card.body} />
            </Text>
          </CollapsibleSection>
        ))}
      </div>
    </section>
  )
}
