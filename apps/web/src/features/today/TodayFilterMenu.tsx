import { useTranslation } from 'react-i18next'
import { SlidersHorizontal } from 'lucide-react'
import { Button, FilterChips, Popover, PopoverContent, PopoverTrigger, SelectField, Text } from '@bellum/ui'
import type { TodayFilters, TodayQueueOptions } from './todayQueue'

/**
 * Lot L-A (#4164) — LE MENU DE FILTRES, compact : Geste · Compte · Source, et les
 * filtres Risque / Agent de l'ancienne file « À valider » qui y passent.
 *
 * Chaque rangée ne porte que les valeurs RÉELLEMENT présentes dans la file
 * (doctrine « on n'affiche pas ce qu'on n'a pas ») ; une rangée sans option
 * n'existe pas, et le menu lui-même disparaît quand la file n'offre aucun choix.
 */
export function TodayFilterMenu({
  options,
  filters,
  onChange,
}: {
  options: TodayQueueOptions
  filters: TodayFilters
  onChange: (next: TodayFilters) => void
}) {
  const { t } = useTranslation('actions')
  const activeCount = Object.values(filters).filter(Boolean).length
  const hasChoice =
    options.gestures.length > 1 ||
    options.accounts.length > 1 ||
    options.sources.length > 1 ||
    options.risks.length > 0 ||
    options.agents.length > 1
  if (!hasChoice && activeCount === 0) return null

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant={activeCount > 0 ? 'outline' : 'ghost'}
          size="sm"
          className="pointer-coarse:min-h-11"
        >
          <SlidersHorizontal className="size-3.5" aria-hidden="true" />
          {t('today.filters.open')}
          {activeCount > 0 ? ` · ${activeCount}` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        className="w-[min(24rem,calc(100vw-2rem))] space-y-3"
        aria-label={t('today.filters.legend')}
      >
        {options.gestures.length > 1 ? (
          <FilterChips
            ariaLabel={t('today.filters.gesture')}
            legend={t('today.filters.gesture')}
            size="sm"
            options={options.gestures.map(gesture => ({ value: gesture, label: t(`today.groups.${gesture}`) }))}
            value={filters.gesture ?? null}
            clearable
            onChange={next => onChange({ ...filters, gesture: next ?? undefined })}
          />
        ) : null}
        {options.sources.length > 1 ? (
          <FilterChips
            ariaLabel={t('today.filters.source')}
            legend={t('today.filters.source')}
            size="sm"
            options={options.sources.map(source => ({ value: source, label: t(`today.filters.sources.${source}`) }))}
            value={filters.source ?? null}
            clearable
            onChange={next => onChange({ ...filters, source: next ?? undefined })}
          />
        ) : null}
        {options.risks.length > 0 ? (
          <FilterChips
            ariaLabel={t('today.filters.risk')}
            legend={t('today.filters.risk')}
            size="sm"
            options={options.risks.map(risk => ({ value: risk, label: t(`center.filters.risk.${risk}`) }))}
            value={filters.risk ?? null}
            clearable
            onChange={next => onChange({ ...filters, risk: next ?? undefined })}
          />
        ) : null}
        {options.agents.length > 1 ? (
          <FilterChips
            ariaLabel={t('today.filters.agent')}
            legend={t('today.filters.agent')}
            size="sm"
            options={options.agents.map(agent => ({ value: agent, label: t(`center.filters.agent.${agent}`) }))}
            value={filters.agent ?? null}
            clearable
            onChange={next => onChange({ ...filters, agent: next ?? undefined })}
          />
        ) : null}
        {options.accounts.length > 1 ? (
          <div className="space-y-1">
            <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
              {t('today.filters.account')}
            </Text>
            <SelectField
              ariaLabel={t('today.filters.account')}
              size="sm"
              value={filters.accountId ?? ''}
              onChange={next => onChange({ ...filters, accountId: next === '' ? undefined : next })}
              options={options.accounts.map(account => ({ value: account.id, label: account.name }))}
              emptyOption={{ label: t('today.filters.all') }}
              placeholder={t('today.filters.all')}
            />
          </div>
        ) : null}
        {activeCount > 0 ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="pointer-coarse:min-h-11"
            onClick={() => onChange({})}
          >
            {t('today.filters.clear')}
          </Button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
