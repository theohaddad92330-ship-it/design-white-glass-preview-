import { useTranslation } from 'react-i18next'
import { ScanSearch } from 'lucide-react'
import { APPLICATION_SECTOR_BY_CODE } from '@bellum/contracts'
import type { DiscoverRequestReading } from '@/features/discover/lib/discover-reading'
import { ambiguousCitySuggestion, unrecognizedFreetextZone } from '@/features/discover/lib/discover-needs-freetext'

/**
 * #2490 / #2496 — SUR QUOI la liste est filtrée, en français clair.
 *
 * Mesuré en production le 17/09/2026 : « ESN spécialisées cybersécurité à
 * Toulouse » rendait des entreprises sans rapport sous « Résultats partiels —
 * Le modèle d'analyse — injoignable — délai dépassé ». Ce bloc remplace ce
 * message par ce qui s'est réellement passé :
 *
 * - les critères que la lecture de la demande a APPLIQUÉS (lieu, secteur) ;
 * - un lieu qui n'a pas pu être vérifié à temps (cherché dans les adresses) ;
 * - les mots qui n'ont PAS filtré la liste — nommés, jamais avalés ;
 * (#4519.22, Louis 24/10 — l'angle d'approche coupé par le temps n'a plus de bandeau d'excuse : rédigé ou absent.)
 *
 * Ton neutre (même patron qu'`UnmeasuredNotice`) : rien n'est cassé.
 */
export function SearchReadingNotice({
  reading,
  freetext = '',
  onSuggestCity,
  keptCriteria = [],
  onClearKept,
}: {
  reading: DiscoverRequestReading | null
  freetext?: string
  /** Garde #5002 — un clic sur « Chercher à <Ville> ? » pose la zone. */
  onSuggestCity?: (city: string) => void
  /** Lot T 2c — les filtres de la recherche d'avant que la saisie d'un NOM a gardés (vide = rien à dire). */
  keptCriteria?: string[]
  onClearKept?: () => void
}) {
  const { t, i18n } = useTranslation('discover')
  const english = i18n.language.startsWith('en')
  const activityLabels = (reading?.activities ?? []).map(code => {
    if (code === 'esn') return t('reading.activityEsn')
    const sector = APPLICATION_SECTOR_BY_CODE.get(code)
    return sector ? t('reading.activitySector', { label: english ? sector.labelEn : sector.labelFr }) : null
  })
  const nameLabel = reading?.name ? t('reading.nameCriterion', { name: reading.name }) : null
  const criteria = [reading?.place, ...activityLabels, nameLabel].filter((item): item is string => Boolean(item))
  const notApplied = reading?.notApplied ?? []
  // #4945.1 — une zone que la phrase nomme et que le référentiel ne connaît pas est DITE, jamais ignorée en silence.
  const unknownZone = unrecognizedFreetextZone(freetext)
  const partial = Boolean(reading?.placeUnverified) || notApplied.length > 0 || unknownZone !== null
  const list = (items: string[]) => new Intl.ListFormat(i18n.language, { type: 'conjunction' }).format(items)

  const lines: string[] = []
  if (criteria.length > 0) lines.push(t('reading.appliedLine', { criteria: list(criteria) }))
  if (reading?.hiringProfile) lines.push(t('reading.hiringProfile', { profile: reading.hiringProfile }))
  if (reading?.placeUnverified && reading.place) lines.push(t('reading.placeUnverified', { place: reading.place }))
  if (notApplied.length > 0) {
    lines.push(t('reading.notApplied', { count: notApplied.length, words: notApplied.join(', ') }))
  }
  if (unknownZone) lines.push(t('reading.zoneUnrecognized', { zone: unknownZone }))
  const suggestedCity = onSuggestCity ? ambiguousCitySuggestion(freetext) : null
  const keptLine =
    reading?.name && keptCriteria.length > 0
      ? t('reading.nameKeptFilters', { name: reading.name, criteria: list(keptCriteria) })
      : null
  if (keptLine) lines.push(keptLine)
  if (lines.length === 0 && !suggestedCity) return null

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3"
      style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-subtle)' }}
    >
      {(reading || unknownZone) && (
        <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          <ScanSearch className="h-[13px] w-[13px]" aria-hidden="true" />
          {t(partial ? 'reading.partialTitle' : 'reading.title')}
        </p>
      )}
      <ul className="mt-1.5 space-y-0.5">
        {lines.map(line => (
          <li key={line} className="text-xs" style={{ color: 'var(--text-muted)' }}>
            {line}
          </li>
        ))}
      </ul>
      {keptLine && onClearKept && (
        <button
          type="button"
          data-testid="clear-kept-filters"
          className="mt-2 min-h-11 rounded-full px-3 text-xs"
          style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          onClick={onClearKept}
        >
          {t('reading.clearKeptFilters')}
        </button>
      )}
      {suggestedCity && (
        <button
          type="button"
          data-testid="city-suggestion"
          className="mt-2 min-h-11 rounded-full px-3 text-xs"
          style={{ border: '1px solid var(--border-subtle)', color: 'var(--text-primary)' }}
          onClick={() => onSuggestCity?.(suggestedCity)}
        >
          {t('reading.suggestCity', { city: suggestedCity })}
        </button>
      )}
    </div>
  )
}
