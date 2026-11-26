import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, SelectField, Text } from '@bellum/ui'
import type { AccountMarketPath } from '@bellum/contracts'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useAccountMarketPaths } from '@/features/accounts/hooks/useAccountMarketPaths'
import type { ObservedOnMarket } from './market-observed'
import { NO_MARKET_PATHS_FILTER, filterMarketPaths, marketPathsFacets } from './market-paths-filter'

/**
 * #5192 (lot 781) — « Voir les détails » de la carte « Observé sur le marché » : agrégats en tête, puis la liste des
 * parcours (poste, famille, compétences, période, statut, ESN, TJM). RÈGLE DURE : aucun identifiant n'est reçu ni écrit
 * (le contrat est strict). Absence ⇒ aucune ligne, jamais « 0 » ni tiret. Plein écran en mobile (`dvh`).
 */
export function MarketPathsDialog({
  accountId,
  open,
  onOpenChange,
  observed,
}: {
  accountId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  observed: ObservedOnMarket | null
}) {
  const { t } = useTranslation('projects')
  const query = useAccountMarketPaths(accountId, open)
  const [filter, setFilter] = useState(NO_MARKET_PATHS_FILTER)
  const paths = query.data?.paths ?? []
  const facets = marketPathsFacets(paths)
  const shown = filterMarketPaths(paths, filter)
  // #5192 — le détail parcours par parcours peut manquer alors que la carte en compte des centaines : la modale
  // n'annonce que le volume qu'elle LISTE (#4770.2) — ni « 0 parcours », ni le chiffre de la carte sans ses lignes —
  // et DIT que le détail n'est pas encore là.
  const total = paths.length > 0 ? (query.data?.paths_total ?? null) : null
  const detailMissing = Boolean(query.data) && paths.length === 0
  const select = (key: keyof typeof filter, label: string, options: string[]) =>
    options.length === 0 ? null : (
      <div className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-[var(--bellum-text-muted)]">
        <span aria-hidden="true">{label}</span>
        <SelectField
          value={filter[key]}
          onChange={next => setFilter({ ...filter, [key]: next })}
          options={options.map(option => ({ value: option, label: option }))}
          emptyOption={{ label: t('signalTable.side.marketAll') }}
          ariaLabel={label}
        />
      </div>
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        closeLabel={t('signalTable.side.marketClose')}
        className="flex h-full max-h-full w-full max-w-full flex-col gap-3 overflow-y-auto rounded-none sm:h-auto sm:max-h-[90dvh] sm:max-w-3xl sm:rounded-lg"
      >
        <DialogHeader>
          <DialogTitle>{t('signalTable.side.market')}</DialogTitle>
          <DialogDescription className={query.data && total !== null && total > 0 ? undefined : 'sr-only'}>
            {query.data && total !== null && total > 0
              ? t('signalTable.side.marketPaths', { count: total })
              : t('signalTable.side.market')}
          </DialogDescription>
        </DialogHeader>
        {observed ? (
          <dl className="flex flex-col gap-1 text-sm">
            {observed.stack.length > 0 ? (
              <Summary
                label={t('signalTable.side.marketStack')}
                value={observed.stack.map(entry => entry.techno).join(' · ')}
              />
            ) : null}
            {observed.families.length > 0 ? (
              <Summary label={t('signalTable.side.marketFamilies')} value={observed.families.join(' · ')} />
            ) : null}
            {observed.esn.length > 0 ? (
              <Summary
                label={t('signalTable.side.marketEsn')}
                value={observed.esn.map(entry => entry.name).join(' · ')}
              />
            ) : null}
          </dl>
        ) : null}
        {query.isError ? (
          <Text size="sm" role="alert">
            {t('signalTable.side.marketPathsError')}
          </Text>
        ) : query.isLoading ? (
          <Text size="sm">{t('signalTable.side.marketPathsLoading')}</Text>
        ) : detailMissing ? (
          <Text size="sm" color="text-[var(--bellum-text-muted)]">
            {t('signalTable.side.marketPathsPending')}
          </Text>
        ) : (
          <>
            <div className="flex flex-col gap-2 sm:flex-row">
              {select('techno', t('signalTable.side.marketFilterTechno'), facets.technos)}
              {select('family', t('signalTable.side.marketFilterFamily'), facets.families)}
              {select('esn', t('signalTable.side.marketFilterEsn'), facets.esns)}
            </div>
            {query.data && query.data.paths_total > paths.length ? (
              <Text size="xs" color="text-[var(--bellum-text-muted)]">
                {t('signalTable.side.marketPathsCapped', { shown: paths.length, total: query.data.paths_total })}
              </Text>
            ) : null}
            <ul className="flex flex-col gap-2">
              {shown.map((path, index) => (
                <PathRow key={index} path={path} />
              ))}
            </ul>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Summary({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-[var(--bellum-text-muted)]">{label}</dt>
      <dd className="break-words">{value}</dd>
    </div>
  )
}

/** Une ligne par parcours ; chaque champ absent ne fait AUCUNE ligne. */
function PathRow({ path }: { path: AccountMarketPath }) {
  const { t } = useTranslation('projects')
  const period = [path.start_date?.slice(0, 7), path.end_date?.slice(0, 7)].filter(Boolean)
  const lines = [
    path.role_family,
    path.skills.length > 0 ? path.skills.join(' · ') : null,
    period.length > 0 ? period.join(' → ') : null,
    path.work_status === 'inconnu' ? null : t(`signalTable.side.marketStatus.${path.work_status}`),
    path.esn_name,
    path.daily_rate_eur !== null ? t('signalTable.side.marketRate', { rate: path.daily_rate_eur }) : null,
  ].filter((line): line is string => Boolean(line))
  return (
    <li className="flex flex-col gap-0.5 rounded-card border border-[var(--bellum-border)] p-3">
      {path.job_title ? <span className="text-sm font-medium">{path.job_title}</span> : null}
      {lines.map(line => (
        <span key={line} className="break-words text-sm text-[var(--bellum-text-muted)]">
          {line}
        </span>
      ))}
    </li>
  )
}
