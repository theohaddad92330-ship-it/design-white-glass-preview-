import { Card, Text } from '@bellum/ui'
import {
  STOCK_METRIC_SOURCE,
  hygieneEmptyPopulation,
  stockBaselineValue,
  type DataHygiene,
  type HygieneLine,
  type StockBaseline,
  type StockMetricKey,
} from '@bellum/contracts'
import { useQuery } from '@tanstack/react-query'
import { Link, useRouter } from '@tanstack/react-router'
import { AlertTriangle, ArrowRight, Minus } from 'lucide-react'
import { useMemo } from 'react'
import { useTranslation } from 'react-i18next'
import { TrendLine } from '@/components/primitives/TrendLine'
import { MeasuredValue } from '@/components/primitives/UnknownValue'
import { DUPLICATES_ANCHOR_ID } from '@/features/governance/model/duplicates-anchor'
import { pilotageApi } from '@/features/pilotage/api'
import { isReachable, knownDestinations } from '../quality/lib/destinations'

/**
 * « Données à compléter » — les neuf contrôles d'hygiène (`GET /pilotage/hygiene`),
 * posés sur `/pilotage` juste sous la bande de décisions.
 *
 * Louis 14/10/2026, refonte Pilotage (L0a) : l'onglet « Qualité des données »
 * est supprimé et son contenu REDISTRIBUÉ — rien n'est perdu, tout change de
 * place. Ce bloc reprend les contrôles, avec leur lien de correction.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ON N'AFFICHE PAS CE QU'ON N'A PAS (doctrine, Louis 20/09/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * Une liste de travail ne montre que ce qui reste à faire : une ligne dont le
 * compte est 0 ne fait AUCUNE ligne, et si tout est à 0 le bloc disparaît. Une
 * valeur NON LUE (`count: null`) n'est pas 0 — elle reste, nommée « non
 * mesuré » : l'effacer se lirait « tout est propre », l'inverse de ce qu'on sait.
 *
 * Le bloc est déplié (plus d'accordéon replié). L'ordre est celui du serveur,
 * stable d'une visite à l'autre. Les doublons ne mènent plus à
 * `/pilotage/qualite` mais au panneau d'arbitrage de `/contacts` : c'est la clé
 * du contrôle qui décide, pas le lien servi, pour qu'un serveur livré avant le
 * web (ou après) mène au même endroit.
 */
export function DataToComplete() {
  const { t } = useTranslation('pilotage')
  // La clé du résumé historique, à l'identique : deux lectures sous deux clés
  // donneraient deux chiffres pour la même question.
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pilotage-hygiene'],
    queryFn: pilotageApi.hygiene,
    staleTime: 60_000,
  })
  // L'arbre de routes RÉEL de ce navigateur — un lien mort est pire qu'une
  // absence de lien. Résolu UNE fois, pas une par ligne.
  const router = useRouter()
  const known = useMemo(() => knownDestinations(router.routesByPath as unknown as Record<string, unknown>), [router])

  if (isLoading) return null
  if (isError) {
    return (
      <Text size="sm" className="mt-6 block text-[var(--bellum-text-muted)]">
        {t('toComplete.unavailable')}
      </Text>
    )
  }

  const hygiene = data as DataHygiene | undefined
  const lines = (hygiene?.lines ?? []).filter(line => line.count === null || line.count > 0)
  if (lines.length === 0) return null

  const stockBaseline = hygiene?.stockBaseline
  // Aucune photo mensuelle pour l'ensemble : le fait se dit UNE fois, pas par ligne.
  const stockLines = (hygiene?.lines ?? []).filter(
    line => STOCK_METRIC_SOURCE[line.key as StockMetricKey] === 'hygiene',
  )
  const noBaselineAtAll =
    stockLines.length > 0 &&
    stockLines.every(line => stockBaselineValue(stockBaseline, line.key as StockMetricKey) === null)

  return (
    <section className="mt-6" aria-labelledby="data-to-complete-title">
      <Text id="data-to-complete-title" element="h2" size="sm" weight="semibold">
        {t('toComplete.title')}
      </Text>
      <Text size="xs" className="mb-2 block text-[var(--bellum-text-muted)]">
        {noBaselineAtAll ? `${t('toComplete.hint')} · ${t('toComplete.noBaseline')}` : t('toComplete.hint')}
      </Text>
      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-[var(--bellum-border)]">
          {lines.map(line => (
            <ToCompleteRow
              key={line.key}
              line={line}
              known={known}
              baseline={stockBaseline}
              noBaselineAtAll={noBaselineAtAll}
            />
          ))}
        </ul>
      </Card>
    </section>
  )
}

const ACTION_CLASS =
  'inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-sm font-medium text-[var(--bellum-text-accent)] hover:bg-[var(--bellum-surface-2)]'

function ToCompleteRow({
  line,
  known,
  baseline,
  noBaselineAtAll,
}: {
  line: HygieneLine
  known: ReadonlySet<string>
  baseline: StockBaseline | undefined
  noBaselineAtAll: boolean
}) {
  const { t } = useTranslation('pilotage')
  const check = t(`hygiene.checks.${line.key}`)
  const action = t(`quality.checks.${line.key}.action`)
  // Les doublons s'arbitrent sur /contacts (panneau « Doublons à trancher ») ;
  // `/contacts` existe toujours dans l'arbre, mais on le vérifie comme les autres.
  const isDuplicates = line.key === 'unresolved_duplicates'
  const target = isDuplicates ? '/contacts' : line.link
  const reachable = isReachable(target, known)
  // `unresolved_duplicates` n'est pas un stock photographié (`STOCK_METRIC_SOURCE`).
  const isStock = STOCK_METRIC_SOURCE[line.key as StockMetricKey] === 'hygiene'
  const previous = isStock ? stockBaselineValue(baseline, line.key as StockMetricKey) : null

  return (
    <li className="flex flex-col gap-3 px-4 py-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-3">
        {line.count === null ? (
          <Minus className="mt-0.5 size-4 shrink-0 text-[var(--text-ghost)]" aria-label={t('quality.state.unknown')} />
        ) : (
          <AlertTriangle
            className="mt-0.5 size-4 shrink-0 text-[var(--warning-soft-text)]"
            aria-label={t('quality.state.breached')}
          />
        )}
        <div className="min-w-0">
          <Text size="sm" weight="medium">
            {check}
          </Text>
          <Text size="xs" className="mt-0.5 block text-[var(--bellum-text-muted)]">
            {t(`quality.checks.${line.key}.says`)}
          </Text>
        </div>
      </div>

      <div className="flex shrink-0 items-center justify-between gap-4 lg:justify-end">
        <div className="max-w-[20ch] text-right">
          <span className="text-sm font-semibold">
            <MeasuredValue value={line.count} />
          </span>
          {hygieneEmptyPopulation(line) ? (
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('quality.emptyPopulation', { population: t(`quality.population.${line.key}`) })}
            </Text>
          ) : line.total === null ? null : (
            <Text size="xs" className="block text-[var(--bellum-text-muted)]">
              {t('quality.ratio', { total: line.total })}
            </Text>
          )}
          {isStock && !noBaselineAtAll ? (
            <TrendLine
              trend={{ state: 'measured', current: line.count, previous }}
              sense="lessIsBetter"
              absoluteOnly
              className="block"
            />
          ) : null}
        </div>

        {reachable ? (
          <Link
            to={target}
            hash={isDuplicates ? DUPLICATES_ANCHOR_ID : undefined}
            // Plusieurs liens portent le même verbe : sans le nom du contrôle,
            // un lecteur d'écran lirait « Saisir, Saisir, Saisir ».
            aria-label={t('quality.openAria', { action, check })}
            className={ACTION_CLASS}
          >
            {action}
            <ArrowRight className="size-3.5 shrink-0" aria-hidden />
          </Link>
        ) : (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('quality.noDestination')}
          </Text>
        )}
      </div>
    </li>
  )
}
