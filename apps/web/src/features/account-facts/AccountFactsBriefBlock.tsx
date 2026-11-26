import type { AccountFactsBrief } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { AccountFactLines } from '@/components/account/AccountFactLines'
import { formatDate } from '@/lib/locale'

/**
 * #4072.3 — LA FICHE DE PRÉPARATION D'UN RDV : affaires passées, missions,
 * besoins récurrents, derniers échanges (métadonnées — jamais le corps). Tout
 * vient du lecteur unique des faits du compte. Une rubrique sans fait ne fait
 * aucune ligne ; sans aucun fait, le bloc n'existe pas.
 */
export function AccountFactsBriefBlock({ brief }: { brief: AccountFactsBrief }) {
  const { t } = useTranslation('accountFacts')
  const sections = [
    { key: 'deals', lines: brief.deals },
    { key: 'missions', lines: brief.missions },
  ] as const
  const hasAny = brief.deals.length + brief.missions.length + brief.recurringNeeds.length + brief.exchanges.length > 0
  if (!hasAny) return null

  const heading = (key: string) => (
    <h3
      id={`account-facts-brief-${key}`}
      className="text-xs font-semibold uppercase tracking-wide text-[var(--bellum-text-secondary)]"
    >
      {t(`brief.${key}`)}
    </h3>
  )
  return (
    <div
      className="flex flex-col gap-3 rounded-lg border border-[var(--bellum-border)] p-3"
      data-testid="account-facts-brief"
    >
      <p className="text-sm font-medium text-[var(--bellum-text-primary)]">{t('brief.title')}</p>
      {sections.map(({ key, lines }) =>
        lines.length > 0 ? (
          <section key={key} aria-labelledby={`account-facts-brief-${key}`}>
            {heading(key)}
            <AccountFactLines facts={lines} />
          </section>
        ) : null,
      )}
      {brief.recurringNeeds.length > 0 ? (
        <section aria-labelledby="account-facts-brief-recurringNeeds">
          {heading('recurringNeeds')}
          <ul className="mt-1 space-y-0.5 text-xs text-[var(--bellum-text-secondary)]">
            {brief.recurringNeeds.map(need => (
              <li key={need.label}>
                {t('brief.recurringLine', {
                  label: need.label,
                  count: need.occurrences,
                  date: formatDate(need.lastDate) ?? need.lastDate.slice(0, 10),
                })}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {brief.exchanges.length > 0 ? (
        <section aria-labelledby="account-facts-brief-exchanges">
          {heading('exchanges')}
          <AccountFactLines facts={brief.exchanges} />
        </section>
      ) : null}
    </div>
  )
}
