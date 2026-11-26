import { MapPinOff } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import type { GeoExcludedView } from './geoExcluded'

/**
 * SIMON-FIX S.18 — dit POURQUOI des contacts ont quitté la liste : le périmètre géographique choisi
 * (« Hors du périmètre géographique choisi (France) »). Réversible depuis la fiche du contact.
 */
export function ContactsGeoExcludedNotice({ data }: { data: GeoExcludedView }) {
  const { t } = useTranslation('accountOrg')
  const count = data.country + data.sites

  return (
    <div
      data-testid="contacts-geo-excluded"
      className="flex items-start gap-2.5 rounded-xl border border-[var(--bellum-border)] bg-[color-mix(in_srgb,var(--bellum-surface-1)_60%,transparent)] px-4 py-3"
    >
      <MapPinOff className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-muted)]" aria-hidden />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--bellum-text-primary)]">
          {t('contactsTab.geoExcluded.title', { count })}
        </p>
        <p className="mt-0.5 text-xs text-[var(--bellum-text-muted)]">
          {[
            data.country > 0 ? t('contactsTab.geoExcluded.perimeter', { perimeter: data.perimeters.join(', ') }) : null,
            data.sites > 0 ? t('contactsTab.geoExcluded.sites', { areas: data.areas.join(', ') }) : null,
          ]
            .filter(Boolean)
            .join(' ')}
        </p>
      </div>
    </div>
  )
}
