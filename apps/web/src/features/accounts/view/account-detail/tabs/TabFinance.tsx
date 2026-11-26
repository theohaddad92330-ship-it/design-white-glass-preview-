import type { Account, AccountAnalysis } from '@bellum/contracts'
import { Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { formatRegistryDateIfKnown } from '@/lib/signal-date'
import { buildFinanceExercises } from './finance/financeStrategyRows'
import { formatEuros, formatPercent } from './sections/publicDataViewData'

interface TabFinanceProps {
  account: Account
}

/**
 * #4745 — « Stratégie financière » : la santé financière du compte ANALYSÉ, exercice par exercice.
 *
 * Distinct de la carte « Données financières » de la Synthèse (CA, résultat net, effectif — GA-26 :
 * ces chiffres ne se redisent pas ici sous la même forme) : l'onglet porte ce que la carte ne montre
 * pas — la clôture datée, la marge brute, l'excédent brut d'exploitation, le résultat d'exploitation.
 * Une valeur non publiée se NOMME « Non publié » (GA-18 / GA-19), jamais « 0 ». Aucune probabilité,
 * aucune projection, aucune comptabilité (#2564 : BellumAI suit le financier, il ne comptabilise pas).
 */
export function TabFinance({ account }: TabFinanceProps) {
  const { t, i18n } = useTranslation('accountDetail')
  const locale = i18n.language
  const analysis = ((account.raw_analysis as AccountAnalysis | null | undefined) ?? {}) as AccountAnalysis
  const exercises = buildFinanceExercises(analysis.financials_history)
  const notPublished = t('financeTab.notPublished')
  const entityName = analysis.legal_name?.trim()

  if (exercises.length === 0) {
    return (
      <Card className="space-y-2 p-4">
        <Text element="h2" size="sm" weight="medium">
          {t('financeTab.title')}
        </Text>
        <Text element="p" size="sm">
          {t('financeTab.empty.title')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('financeTab.empty.why')}
        </Text>
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <Text element="h2" size="sm" weight="medium">
          {t('financeTab.title')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {entityName ? t('financeTab.scopeNamed', { name: entityName }) : t('financeTab.scope')}
        </Text>
        <Text element="p" size="xs" className="text-[var(--bellum-text-muted)]">
          {t('financeTab.notYourMargin')}
        </Text>
      </div>

      <ul className="space-y-3">
        {exercises.map(exercise => {
          const closed = formatRegistryDateIfKnown(exercise.closingDate)
          const rows: Array<{ label: string; value: string | null; detail?: string | null }> = [
            {
              label: t('financeTab.grossMargin'),
              value: formatEuros(exercise.grossMargin, locale),
              detail: formatPercent(exercise.grossMarginRate, locale),
            },
            { label: t('financeTab.ebitda'), value: formatEuros(exercise.ebitda, locale) },
            { label: t('financeTab.operatingResult'), value: formatEuros(exercise.operatingResult, locale) },
          ]
          return (
            <li key={exercise.year}>
              <Card className="p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <Text element="h3" size="sm" weight="medium">
                    {t('financeTab.exercise', { year: exercise.year })}
                  </Text>
                  <Text element="span" size="xs" className="text-[var(--bellum-text-muted)]">
                    {closed ? t('financeTab.closedOn', { date: closed }) : t('financeTab.closingUnknown')}
                  </Text>
                </div>
                <dl className="mt-3 divide-y divide-[var(--bellum-border)]">
                  {rows.map(row => (
                    <div key={row.label} className="flex items-center justify-between gap-3 py-2">
                      <dt className="text-xs text-[var(--bellum-text-muted)]">{row.label}</dt>
                      <dd className="text-right text-xs text-[var(--bellum-text-primary)]">
                        {row.value ?? notPublished}
                        {row.value && row.detail ? (
                          <span className="ml-2 text-[var(--bellum-text-muted)]">
                            {t('financeTab.ofRevenue', { rate: row.detail })}
                          </span>
                        ) : null}
                      </dd>
                    </div>
                  ))}
                </dl>
              </Card>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
