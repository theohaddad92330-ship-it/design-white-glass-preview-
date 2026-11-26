import { Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountMarketContext } from '@/features/accounts/hooks/useAccountMarketContext'
import { observedOnMarket } from './market-observed'
import { MarketPathsDialog } from './MarketPathsDialog'

/**
 * Lot 773 (f) — « Observé sur le marché » : ce que la mémoire marché sait déjà de ce compte, d'un coup d'œil. Lu PAR
 * `MarketMemoryService` (la route `market-context`, jamais une lecture neuve). Agrégats seulement : technos, familles
 * de rôles, ESN présentes avec leur nombre de parcours, ex-ESN — chacun sous le seuil de parcours n'est pas écrit.
 * Aucune personne, aucune date. La source se dit « Mémoire marché » ; « Voir les détails » ouvre la modale des
 * parcours (#5192, `MarketPathsDialog`, route `market-paths`) : poste, famille, compétences, période, statut, ESN, TJM,
 * jamais un identifiant.
 */
export function MarketObservedCard({ accountId }: { accountId: string }) {
  const { t } = useTranslation('projects')
  const [open, setOpen] = useState(false)
  const market = useAccountMarketContext(accountId, true).data ?? null
  if (!market) return null
  const observed = observedOnMarket(market)
  return (
    <section
      data-testid="signal-market-card"
      className="flex flex-col gap-2 rounded-card border border-[var(--bellum-border)] bg-card p-3"
    >
      <Text element="h3" size="sm" weight="semibold">
        {t('signalTable.side.market')}
      </Text>
      <Text size="sm">{t('signalTable.side.marketPaths', { count: market.paths_observed })}</Text>
      {observed ? (
        <dl className="flex flex-col gap-2">
          {observed.stack.length > 0 ? (
            <MarketLine
              label={t('signalTable.side.marketStack')}
              items={observed.stack.map(
                entry => `${entry.techno} · ${t('signalTable.side.marketCount', { count: entry.persons })}`,
              )}
            />
          ) : null}
          {observed.families.length > 0 ? (
            <MarketLine label={t('signalTable.side.marketFamilies')} items={observed.families} />
          ) : null}
          {observed.esn.length > 0 ? (
            <MarketLine
              label={t('signalTable.side.marketEsn')}
              items={observed.esn.map(
                entry => `${entry.name} · ${t('signalTable.side.marketCount', { count: entry.persons })}`,
              )}
            />
          ) : null}
          {observed.exEsn !== null ? (
            <MarketLine
              label={t('signalTable.side.marketExEsn')}
              items={[t('signalTable.side.marketCount', { count: observed.exEsn })]}
            />
          ) : null}
        </dl>
      ) : null}
      <Text size="xs" color="text-[var(--bellum-text-muted)]">
        {t('signalTable.side.marketSource')}
      </Text>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 items-center self-start text-sm font-medium text-[var(--bellum-text-accent)] underline-offset-2 hover:underline"
      >
        {t('signalTable.side.marketDetails')}
      </button>
      <MarketPathsDialog accountId={accountId} open={open} onOpenChange={setOpen} observed={observed} />
    </section>
  )
}

function MarketLine({ label, items }: { label: string; items: string[] }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="break-words text-sm">{items.join(' · ')}</dd>
    </div>
  )
}
