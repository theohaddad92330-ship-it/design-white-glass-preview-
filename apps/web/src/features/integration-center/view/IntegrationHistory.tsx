import { useQueries } from '@tanstack/react-query'
import { Badge, Table, TableBody, TableCell, TableHead, TableHeader, TableRow, Text } from '@bellum/ui'
import { isSyncRunTerminal, type IntegrationSyncRun } from '@bellum/contracts'
import { useTranslation } from 'react-i18next'
import { integrationCenterApi } from '../api'
import { syncRunStateLabelKey } from '../lib/sync-run-state-labels'
import type { ConnectorView } from '../lib/connectors'

type HistoryRow = { connector: ConnectorView; provider: string; run: IntegrationSyncRun }

function formatWhen(iso: string, language: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(language === 'en' ? 'en-GB' : 'fr-FR', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/**
 * Théo D settings-integrations — l'onglet « Historique » : les opérations RÉELLEMENT faites avec les outils branchés,
 * et leur résultat. Il lit la dernière synchronisation de chaque outil branché (`/tools/:provider/sync-runs/latest`) :
 * ni journal inventé, ni succès deviné — un outil qui n'a jamais synchronisé ne fait AUCUNE ligne.
 */
export function IntegrationHistory({ connectors }: { connectors: readonly ConnectorView[] }) {
  const { t, i18n } = useTranslation('integrationCenter')
  const lang = i18n.language.startsWith('en') ? 'en' : 'fr'
  const wired = connectors.filter(connector => connector.state === 'connected' || connector.state === 'action_required')
  const targets = wired.flatMap(connector =>
    connector.registryProviders.slice(0, 1).map(provider => ({ connector, provider })),
  )

  const results = useQueries({
    queries: targets.map(({ provider }) => ({
      queryKey: ['integration-history', provider] as const,
      queryFn: () => integrationCenterApi.latestSyncRun(provider),
      staleTime: 60_000,
    })),
  })

  const loading = results.some(result => result.isLoading)
  const failed = results.length > 0 && results.every(result => result.isError)
  const rows: HistoryRow[] = targets
    .map(({ connector, provider }, index) => ({ connector, provider, run: results[index]?.data ?? null }))
    .filter((row): row is HistoryRow => row.run !== null)
    .sort((a, b) => b.run.started_at.localeCompare(a.run.started_at))

  return (
    <div className="space-y-3">
      <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
        {t('history.intro')}
      </Text>
      {loading ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('history.loading')}
        </Text>
      ) : failed ? (
        <Text element="p" size="sm" className="text-[var(--danger-soft-text)]">
          {t('history.failed')}
        </Text>
      ) : rows.length === 0 ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {wired.length === 0 ? t('history.emptyNoTool') : t('history.empty')}
        </Text>
      ) : (
        <div className="overflow-hidden rounded-xl border border-[var(--bellum-border)] bg-card">
          <Table>
            <TableHeader>
              <TableRow className="border-[var(--border-subtle)]">
                <TableHead className="text-[var(--bellum-text-muted)]">{t('history.columns.date')}</TableHead>
                <TableHead className="text-[var(--bellum-text-muted)]">{t('history.columns.tool')}</TableHead>
                <TableHead className="text-[var(--bellum-text-muted)]">{t('history.columns.operation')}</TableHead>
                <TableHead className="text-[var(--bellum-text-muted)]">{t('history.columns.result')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ connector, provider, run }) => (
                <TableRow key={`${provider}-${run.id}`} className="border-[var(--border-subtle)]">
                  <TableCell className="whitespace-nowrap text-sm text-[var(--bellum-text-secondary)]">
                    {formatWhen(run.started_at, lang)}
                  </TableCell>
                  <TableCell className="text-sm font-medium">{connector.displayName}</TableCell>
                  <TableCell className="whitespace-normal text-sm">
                    {t('history.operationSync')}
                    {run.summary && run.summary.length > 0 ? (
                      <span className="block text-xs text-[var(--bellum-text-secondary)]">
                        {run.summary.map(line => line.label[lang]).join(' · ')}
                      </span>
                    ) : null}
                  </TableCell>
                  <TableCell className="whitespace-normal">
                    <Badge
                      variant={
                        run.status === 'failed' ? 'destructive' : isSyncRunTerminal(run.status) ? 'success' : 'outline'
                      }
                      className="text-xs"
                    >
                      {t(syncRunStateLabelKey(run.status))}
                    </Badge>
                    {run.status === 'failed' && run.error ? (
                      <span className="mt-1 block text-xs text-[var(--bellum-text-secondary)]">{run.error[lang]}</span>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
