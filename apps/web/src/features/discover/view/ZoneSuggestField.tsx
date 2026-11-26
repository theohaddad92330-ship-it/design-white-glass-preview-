import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import { Popover, PopoverAnchor, PopoverContent, cn } from '@bellum/ui'
import {
  suggestCommunes,
  suggestDepartments,
  unrecognizedCity,
  unrecognizedDepartments,
  withDepartmentSuggestion,
} from '@/lib/zones/zone-suggest'
import { TextInput } from './filter-controls'

/**
 * #4303.1 / #4303.2 — le champ de zone du rail (ville OU département) : il PROPOSE pendant la frappe, et dit
 * « zone non reconnue » quand la saisie n'est pas dans le référentiel INSEE embarqué.
 * Même motif que `EsnNameField` (Popover + lignes `<button>`) : aucune seconde façon d'afficher des propositions.
 *
 * Choisir une proposition remplit le champ ; le champ reste libre, mais une saisie inconnue est DITE sous le
 * champ — et `unrecognizedZone` bloque « Rechercher » : jamais une recherche silencieuse sur une zone inventée.
 */
export function ZoneSuggestField({
  kind,
  value,
  onChange,
  placeholder,
  onEnter,
}: {
  kind: 'city' | 'department'
  value: string
  onChange: (value: string) => void
  placeholder?: string
  onEnter?: () => void
}) {
  const { t } = useTranslation('discover')
  const [open, setOpen] = useState(false)

  const rows =
    kind === 'city'
      ? suggestCommunes(value).map(s => ({
          key: s.insee,
          label: s.label,
          hint: [s.department, s.region].filter(Boolean).join(' · '),
          apply: () => onChange(s.label),
        }))
      : suggestDepartments(value).map(s => ({
          key: `${s.kind}-${s.code}`,
          label:
            s.kind === 'region'
              ? t('zone.regionRow', { name: s.label, count: s.codes.length })
              : `${s.label} (${s.code})`,
          hint: s.kind === 'region' ? s.codes.join(', ') : s.region,
          apply: () => onChange(withDepartmentSuggestion(value, s.codes)),
        }))

  const unknown = kind === 'city' ? unrecognizedCity(value) : unrecognizedDepartments(value).length > 0
  // Pendant la frappe d'un nom que la liste propose encore, ce n'est pas (encore) une erreur.
  const showUnknown = unknown && rows.length === 0

  return (
    <div>
      <Popover open={open && rows.length > 0} onOpenChange={setOpen}>
        <PopoverAnchor asChild>
          <div
            onFocusCapture={() => setOpen(true)}
            onKeyDownCapture={event => {
              if (event.key === 'Escape') setOpen(false)
            }}
          >
            <TextInput
              value={value}
              onChange={next => {
                onChange(next)
                setOpen(true)
              }}
              placeholder={placeholder}
              onEnter={() => {
                setOpen(false)
                onEnter?.()
              }}
            />
          </div>
        </PopoverAnchor>
        <PopoverContent
          align="start"
          sideOffset={4}
          // Le focus reste dans le champ : on continue de taper pendant que la liste se resserre.
          onOpenAutoFocus={event => event.preventDefault()}
          onCloseAutoFocus={event => event.preventDefault()}
          className="max-h-64 overflow-y-auto p-1"
          style={{ width: 'var(--radix-popover-trigger-width)' }}
        >
          <div role="listbox" aria-label={t(kind === 'city' ? 'zone.citySuggestions' : 'zone.departmentSuggestions')}>
            {rows.map(row => (
              <button
                key={row.key}
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => {
                  row.apply()
                  setOpen(false)
                }}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left pointer-coarse:min-h-11',
                  'transition-colors ease-out hover:bg-[var(--bellum-bg-darker)]',
                )}
              >
                <MapPin className="size-3.5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-[var(--bellum-text-primary)]">{row.label}</span>
                  {row.hint ? (
                    <span className="block truncate text-xs text-[var(--bellum-text-muted)]">{row.hint}</span>
                  ) : null}
                </span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      {showUnknown && (
        <p
          role="status"
          data-testid={`zone-unknown-${kind}`}
          className="mt-1 text-xs"
          style={{ color: 'var(--text-secondary)' }}
        >
          {t(kind === 'city' ? 'zone.cityUnknown' : 'zone.departmentUnknown')}
        </p>
      )}
    </div>
  )
}

/** #4303.2 — vrai si l'une des deux zones saisies n'est pas dans le référentiel : « Rechercher » se met en attente. */
export function hasUnrecognizedZone(filters: { city: string; department: string }): boolean {
  return unrecognizedCity(filters.city) || unrecognizedDepartments(filters.department).length > 0
}
