import type { PipeInspectionRow } from '@bellum/contracts'
import { Badge, Card, Input, Text } from '@bellum/ui'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { ForecastCategorySelect } from '@/features/projects/view/ForecastCategoryField'
import { useUpdateCloseDate, useUpdateForecastCategory } from '@/features/projects/hooks/useUpdateProjectForecast'
import { formatCents } from '@/lib/money'
import { usePipeInspection } from './api'
import { signalParams } from './pipe-format'

/** La grille desktop ; sous 768 px chaque ligne devient une carte empilée (aucune seconde liste). */
const ROW_GRID =
  'md:grid md:grid-cols-[minmax(0,1.6fr)_7rem_9rem_11rem_10rem_minmax(0,1fr)_6rem] md:items-center md:gap-3'

/**
 * LA TABLE D'INSPECTION — les opportunités OUVERTES, éditables en place.
 *
 * Deux gestes d'écriture, et seulement deux : la catégorie DÉCLARÉE et la date
 * de signature prévue. Ils passent par les routes existantes de la fiche
 * (`PATCH /projects/:id/forecast-category`, `/close-date`) — une seule porte
 * d'écriture, deux écrans. Le montant ne s'écrit pas ici.
 *
 * Totaux par catégorie : NON PONDÉRÉS (aucune probabilité). Un montant absent
 * n'est pas 0 : il sort de la somme et se compte à part, « Non mesuré » si la
 * catégorie n'a aucun montant.
 *
 * Sous 768 px la table devient des cartes empilées : un seul rendu, des
 * libellés de cellule visibles seulement sur mobile.
 */
export function PipeInspection() {
  const { t } = useTranslation('pilotagePipe')
  const { data, isLoading, isError } = usePipeInspection()

  return (
    <section aria-labelledby="pipe-inspection-title" className="space-y-3">
      <div className="space-y-0.5">
        <h2 id="pipe-inspection-title" className="text-base font-semibold text-[var(--bellum-text-primary)]">
          {t('inspection.title')}
        </h2>
        <Text size="xs" color="text-muted-foreground" className="block">
          {t('inspection.subtitle')}
        </Text>
      </div>
      {isLoading ? (
        <Text size="sm" color="text-muted-foreground">
          {t('page.loading')}
        </Text>
      ) : isError || !data?.rows ? (
        <Text size="sm" color="text-muted-foreground" role="alert">
          {t('page.loadError')}
        </Text>
      ) : data.rows.length === 0 ? (
        <Text size="sm" color="text-muted-foreground">
          {t('inspection.empty')}
        </Text>
      ) : (
        <>
          <CategoryTotals totals={data.totals} />
          <div role="table" aria-label={t('inspection.title')} className="space-y-2">
            <div role="row" className={`${ROW_GRID} hidden px-3 text-xs text-[var(--bellum-text-muted)]`}>
              {(['label', 'amount', 'stage', 'category', 'closeOn', 'owner', 'daysInStage'] as const).map(column => (
                <span key={column} role="columnheader">
                  {t(`inspection.columns.${column}`)}
                </span>
              ))}
            </div>
            <div role="rowgroup" className="space-y-2">
              {data.rows.map(row => (
                <InspectionRow key={row.id} row={row} />
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  )
}

function CategoryTotals({ totals }: { totals: NonNullable<ReturnType<typeof usePipeInspection>['data']>['totals'] }) {
  const { t } = useTranslation('pilotagePipe')
  const { t: tProjects } = useTranslation('projects')
  return (
    <Card className="space-y-2 p-3">
      <Text size="sm" weight="semibold" className="block">
        {t('inspection.totals.title')}
      </Text>
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5" data-testid="pipe-category-totals">
        {totals.map(total => (
          <li key={total.category ?? 'undeclared'} className="space-y-0.5 rounded-md bg-[var(--bellum-surface-2)] p-2">
            <Text size="xs" color="text-muted-foreground" className="block">
              {total.category === null
                ? tProjects('forecastCategory.undeclared')
                : tProjects(`forecastCategory.${total.category}`)}
            </Text>
            <Text size="sm" weight="semibold" className="block tabular-nums">
              {total.amountCents === 0 && total.withoutAmount === total.count
                ? t('inspection.totals.noAmount')
                : formatCents(total.amountCents)}
            </Text>
            <Text size="xs" color="text-muted-foreground" className="block">
              {t('inspection.totals.count', { count: total.count })}
              {total.withoutAmount > 0 && total.withoutAmount < total.count
                ? ` · ${t('inspection.totals.withoutAmount', { count: total.withoutAmount })}`
                : ''}
            </Text>
          </li>
        ))}
      </ul>
      <Text size="xs" color="text-muted-foreground" className="block">
        {t('inspection.totals.basis')}
      </Text>
    </Card>
  )
}

function Cell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div role="cell" className="flex items-center justify-between gap-3 md:block">
      <span className="text-xs text-[var(--bellum-text-muted)] md:hidden">{label}</span>
      {children}
    </div>
  )
}

function InspectionRow({ row }: { row: PipeInspectionRow }) {
  const { t } = useTranslation('pilotagePipe')
  const { t: tProjects } = useTranslation('projects')
  const category = useUpdateForecastCategory()
  const closeDate = useUpdateCloseDate()
  const rowName = `${row.accountName} — ${row.label}`
  const failed = category.isError || closeDate.isError

  return (
    <Card role="row" className={`flex flex-col gap-2 p-3 ${ROW_GRID}`} data-testid="pipe-row">
      <div role="cell" className="min-w-0">
        <Text size="sm" weight="semibold" className="block break-words">
          {row.accountName}
        </Text>
        <Text size="xs" color="text-muted-foreground" className="block break-words">
          {row.label}
        </Text>
      </div>
      <Cell label={t('inspection.columns.amount')}>
        <Text size="sm" className="tabular-nums">
          {row.amountCents === null ? t('inspection.amountUnknown') : formatCents(row.amountCents)}
        </Text>
      </Cell>
      <Cell label={t('inspection.columns.stage')}>
        <Badge variant="secondary">{tProjects(`stage.states.${row.stage}`)}</Badge>
      </Cell>
      <Cell label={t('inspection.columns.category')}>
        <ForecastCategorySelect
          value={row.forecastCategory}
          ariaLabel={t('inspection.categoryEdit', { label: rowName })}
          disabled={category.isPending}
          onChange={next => category.mutate({ id: row.id, category: next })}
          className="h-11 w-40 md:w-full"
        />
      </Cell>
      <Cell label={t('inspection.columns.closeOn')}>
        <CloseDateInput
          key={row.expectedCloseOn ?? 'unset'}
          value={row.expectedCloseOn}
          ariaLabel={t('inspection.closeOnEdit', { label: rowName })}
          disabled={closeDate.isPending}
          onCommit={date => closeDate.mutate({ id: row.id, date })}
        />
      </Cell>
      <Cell label={t('inspection.columns.owner')}>
        <Text size="sm" className="min-w-0 break-words">
          {row.ownerName ?? t('inspection.ownerUnassigned')}
        </Text>
      </Cell>
      <Cell label={t('inspection.columns.daysInStage')}>
        <Text size="sm" className="tabular-nums">
          {t('inspection.daysInStage', { count: row.daysInStage })}
        </Text>
      </Cell>
      {row.signals.length > 0 ? (
        <ul role="cell" className="flex flex-wrap gap-1.5 md:col-span-full" aria-label={t('signals.title')}>
          {row.signals.map(signal => (
            <li key={signal.kind}>
              <Badge variant="outline" className="whitespace-normal">
                {t(
                  `signals.${signal.kind}`,
                  signalParams(signal, cents => formatCents(cents)),
                )}
              </Badge>
            </li>
          ))}
        </ul>
      ) : null}
      {failed ? (
        <Text size="xs" role="alert" className="text-[var(--danger-soft-text)] md:col-span-full">
          {t('inspection.saveError')}
        </Text>
      ) : null}
    </Card>
  )
}

/**
 * La date prévue s'écrit à la SORTIE du champ (blur) ou à Entrée — jamais à
 * chaque frappe : une saisie partielle d'un champ date se lit « vide », et
 * l'écrire effacerait la date de l'opportunité. Vide + sortie = effacer.
 */
function CloseDateInput({
  value,
  ariaLabel,
  disabled,
  onCommit,
}: {
  value: string | null
  ariaLabel: string
  disabled: boolean
  onCommit: (date: string | null) => void
}) {
  const [draft, setDraft] = useState(value ?? '')
  const commit = () => {
    const next = draft === '' ? null : draft
    if (next !== value) onCommit(next)
  }
  return (
    <Input
      type="date"
      value={draft}
      aria-label={ariaLabel}
      disabled={disabled}
      onChange={event => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={event => {
        if (event.key === 'Enter') commit()
      }}
      className="h-11 w-40 md:w-full"
    />
  )
}
