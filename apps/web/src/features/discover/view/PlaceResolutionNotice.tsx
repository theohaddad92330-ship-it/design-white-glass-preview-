import { useTranslation } from 'react-i18next'
import { MapPin } from 'lucide-react'
import type { DiscoverPlaceResolution } from '../lib/discover-place-resolution'
import { BANNER_STYLE } from './ZoneWideningNotice'

/**
 * #4429.6 — la commune corrigée, l'homonyme retenu ou l'absence de commune, ÉCRITS au-dessus de la liste
 * (décision Louis 21/10/2026). Une ville ne tombe jamais en plein texte en silence ; Laura dit la même
 * chose (`place_line`). Sans note, `null` : un nom exact et unique n'a rien à dire.
 */
export function PlaceResolutionNotice({ resolution }: { resolution: DiscoverPlaceResolution | undefined }) {
  const { t } = useTranslation('discover')
  if (!resolution) return null
  const others = (resolution.alternatives ?? []).map(other => other.department).join(', ')

  return (
    <div role="status" className="mb-4 rounded-lg p-3" style={BANNER_STYLE}>
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        <MapPin aria-hidden="true" className="h-[13px] w-[13px]" />
        {t(`placeResolution.${resolution.kind}`, {
          typed: resolution.typed,
          chosen: resolution.chosen,
          department: resolution.department,
          others,
        })}
      </p>
    </div>
  )
}
