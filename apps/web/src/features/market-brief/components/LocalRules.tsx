import type { MarketBrief } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'

/** Règles locales : ce qu'on sait, et ce que ça veut dire pour le commercial. */
export function LocalRules({ rules }: { rules: NonNullable<MarketBrief['rules']> }) {
  const { t } = useTranslation('marketBrief')
  if (rules.length === 0) return null
  return (
    <Card data-testid="market-rules" className="min-w-0 divide-y divide-[var(--bellum-border)]">
      <Text element="h3" size="base" weight="semibold" className="px-4 pt-4 pb-2">
        {t('rules.title')}
      </Text>
      {rules.map(rule => (
        <div key={rule.rule} className="px-4 py-4">
          <Text size="sm" weight="semibold">
            {rule.rule}
          </Text>
          {rule.regime ? (
            <Text size="xs" className="text-[var(--bellum-text-muted)]">
              {t('rules.regime', { regime: rule.regime })}
            </Text>
          ) : null}
          <div className="mt-2 grid min-w-0 grid-cols-1 gap-3 md:grid-cols-2 md:gap-6">
            <div className="min-w-0">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                {t('known')}
              </Text>
              <Text size="sm" className="mt-1">
                {rule.known}
              </Text>
            </div>
            <div className="min-w-0">
              <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
                {t('meaning')}
              </Text>
              <Text size="sm" className="mt-1">
                {rule.meaning}
              </Text>
            </div>
          </div>
        </div>
      ))}
    </Card>
  )
}
