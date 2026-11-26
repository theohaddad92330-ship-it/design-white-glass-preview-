import { Badge, Card, Text } from '@bellum/ui'
import { useTranslation } from 'react-i18next'
import { QueryLoadError } from '@/components/feedback/QueryLoadError'
import { useAccountRuns } from '@/features/accounts/hooks/useAccountRuns'
import { useHasOfferObjective } from '@/features/profile/hooks/useEsnProfile'
import { VerdictRevisionCard } from './VerdictRevisionCard'
import { useAccountVerdictRevision } from '@/features/accounts/hooks/useAccountVerdictRevision'
import { RUN_STATUS_TONE_CLASS, toAnalysisRunView, versioningLines } from '@/features/accounts/lib/analysisRuns'

/**
 * "Historique des analyses" (Théo P0 : « Un compte racine, plusieurs
 * AnalysisRun. Historique, refresh, debug, export ») — the append-only run log
 * for this account, shown in the account-detail sidebar next to « Comptes du même
 * secteur ». Each row: launch date, perimeter, status badge.
 */
export const AccountRunsContainer = ({
  accountId,
  hasCompletedAnalysis = false,
}: {
  accountId: string
  /**
   * recette 10/09 — « Aucune analyse enregistrée pour ce compte. » est vrai
   * du journal des RUNS (une table introduite après le premier jour), FAUX
   * hors contexte sur un compte legacy déjà `completed` : il A été analysé,
   * simplement avant que ce suivi existe (voir `lastAnalyzedDate.ts`, le même
   * repli déjà tenu par l'entête du dossier et l'onglet Accès). Le calcul de
   * ce booléen vit à UN seul endroit — `lastAnalyzedDate(account) !== null`,
   * côté `TabOverview` — jamais recopié ici.
   */
  hasCompletedAnalysis?: boolean
}) => {
  const { t } = useTranslation('accountDetail')
  const { data: runs = [], isLoading, isError } = useAccountRuns(accountId)
  const { data: revision } = useAccountVerdictRevision(accountId)
  const hasObjective = useHasOfferObjective()

  return (
    <Card className="overflow-hidden p-4">
      {/* #3277 (recette 02/10) — pas de titre ici : l'en-tête d'accordéon de la Synthèse porte déjà
          « Historique des analyses » (un libellé ne s'affiche qu'une fois par bloc). */}
      {/* #3212.4/.6 + #3235 — la même carte que le Plan (GA-26). */}
      <VerdictRevisionCard revision={revision} hasObjective={hasObjective} />
      {isLoading ? (
        <Text size="xs">{t('runs.loading')}</Text>
      ) : isError ? (
        // #3666.k — une lecture en échec n'est pas « aucune analyse ».
        <QueryLoadError />
      ) : runs.length === 0 ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {hasCompletedAnalysis ? t('runs.emptyLegacy') : t('runs.empty')}
        </Text>
      ) : (
        <ul className="min-w-0 space-y-1">
          {runs.map(run => {
            const view = toAnalysisRunView(run)
            // #2318.5 — LAU-FINAL-059, VERSIONING : les neuf identifiants
            // qu'une analyse conserve. `date`/`scope` sont déjà dans
            // dateLabel/scopeLabel ci-dessus ; les sept autres n'atteignaient
            // AUCUN écran (calculés par `buildAnalysisVersioning`, jamais
            // rendus) — ce détail repliable les nomme, un par un, « non
            // mesuré » plutôt qu'absent quand aucun sous-système ne les timbre.
            const lines = versioningLines(run.versioning)
            return (
              <li
                key={view.id}
                className="rounded-lg p-2 transition-colors hover:bg-[color-mix(in_srgb,var(--bellum-text-primary)_4%,transparent)]"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <Text size="xs" weight="semibold" noWrap className="truncate text-[var(--bellum-text-primary)]">
                      {view.dateLabel}
                    </Text>
                    <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="truncate">
                      <span>{view.scopeLabel}</span> · <span>{view.depthLabel}</span>
                    </Text>
                  </div>
                  <Badge
                    variant="outline"
                    className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${RUN_STATUS_TONE_CLASS[view.statusTone]}`}
                  >
                    {view.statusLabel}
                  </Badge>
                </div>
                {lines.length > 0 ? (
                  <details className="mt-1" data-testid={`run-versioning-${view.id}`}>
                    <summary className="min-h-11 cursor-pointer py-1 text-xs text-[var(--bellum-text-muted)]">
                      {t('accounts:versioning.showDetails')}
                    </summary>
                    <dl className="mt-1 space-y-0.5 pl-2">
                      {lines.map(line => (
                        <div key={line.key} className="flex flex-wrap justify-between gap-x-2">
                          <dt>
                            <Text element="span" size="xs" color="text-[var(--bellum-text-muted)]">
                              {line.label}
                            </Text>
                          </dt>
                          <dd>
                            <Text element="span" size="xs" className="text-right text-[var(--bellum-text-secondary)]">
                              {line.value}
                            </Text>
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
