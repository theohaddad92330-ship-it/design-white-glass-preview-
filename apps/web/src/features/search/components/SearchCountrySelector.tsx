import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bellum/ui'
import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { workspaceMarketValues, type WorkspaceMarket } from '@bellum/contracts'

/** Flag emoji per market — pure display, no translation needed. */
const MARKET_FLAGS: Record<WorkspaceMarket, string> = {
  FR: '🇫🇷',
  CH: '🇨🇭',
  BE: '🇧🇪',
  LU: '🇱🇺',
  US: '🇺🇸',
  CA: '🇨🇦',
}

type SearchCountrySelectorProps = {
  value: WorkspaceMarket
  onChange: (next: WorkspaceMarket) => void
  disabled?: boolean
}

/**
 * Country flag/code selector next to the company field — recherche multi-pays
 * #494. Picks which registry the autocomplete queries and which country the
 * analysis targets, WITHOUT changing the team-wide workspace market. Defaults to
 * the workspace market and remembers the last pick (see `useSearchCountry`).
 */
export const SearchCountrySelector = memo(function SearchCountrySelector({
  value,
  onChange,
  disabled = false,
}: SearchCountrySelectorProps) {
  const { t } = useTranslation('search')
  return (
    <Select value={value} disabled={disabled} onValueChange={next => onChange(next as WorkspaceMarket)}>
      <SelectTrigger
        aria-label={t('country.aria')}
        className="h-7 w-[74px] shrink-0 gap-1 border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2 text-xs font-medium text-[var(--bellum-text-primary)]"
      >
        <SelectValue>
          <span className="flex items-center gap-1">
            <span aria-hidden>{MARKET_FLAGS[value]}</span>
            <span>{value}</span>
          </span>
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {workspaceMarketValues.map(code => (
          <SelectItem key={code} value={code}>
            <span className="flex items-center gap-2">
              <span aria-hidden>{MARKET_FLAGS[code]}</span>
              <span className="font-medium">{code}</span>
              <span className="text-[var(--bellum-text-secondary)]">{t(`country.names.${code}`)}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
})
