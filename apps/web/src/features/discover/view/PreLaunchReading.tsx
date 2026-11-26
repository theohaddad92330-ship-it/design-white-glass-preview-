import { useTranslation } from 'react-i18next'
import { ScanSearch } from 'lucide-react'
import { REGISTRY_REGIONS } from '@/features/discover/lib/discover-registry-vocab'
import { unreadSizePhrase, unrecognizedFreetextZone } from '@/features/discover/lib/discover-needs-freetext'

/**
 * #4998.1 — la lecture de la demande AVANT le lancement : zone, mots-clés, et une zone que le référentiel ne connaît
 * pas, DITE d'emblée. Pure lecture des champs saisis : rien n'est cherché, rien n'est deviné. Muette sans saisie.
 */
export function PreLaunchReading({
  city,
  region = [],
  department = '',
  keywords,
  freetext,
}: {
  city: string
  /** #5203 — les régions (codes INSEE) cochées : une région active est une zone posée. */
  region?: readonly string[]
  /** #5203 — le(s) département(s) saisi(s). */
  department?: string
  keywords: string
  freetext: string
}) {
  const { t } = useTranslation('discover')
  // #5203 — « aucune zone posée » n'est dit que si NI la ville, NI une région, NI un département n'est posé.
  const regionNames = region.map(code => REGISTRY_REGIONS.find(known => known.code === code)?.label ?? code)
  const place = [city.trim(), ...regionNames, department.trim()].filter(Boolean).join(', ')
  const words = keywords.trim()
  const unknownZone = unrecognizedFreetextZone(freetext)
  const unreadSize = unreadSizePhrase(freetext)
  if (!place && !words && !unknownZone && !unreadSize) return null
  return (
    <div data-testid="pre-launch-reading" role="status" className="flex flex-col gap-0.5 text-xs">
      <p className="flex items-center gap-1.5 font-medium text-[var(--bellum-text-secondary)]">
        <ScanSearch className="h-3.5 w-3.5" aria-hidden="true" />
        {t('reading.preTitle')}
      </p>
      <p className="text-[var(--bellum-text-muted)]">
        {t('reading.preLine', {
          place: place || t('reading.preNoZone'),
          keywords: words || t('reading.preNoKeywords'),
        })}
      </p>
      {unknownZone && (
        <p className="text-[var(--bellum-text-muted)]">{t('reading.zoneUnrecognized', { zone: unknownZone })}</p>
      )}
      {unreadSize && <p className="text-[var(--bellum-text-muted)]">{t('reading.sizeUnread', { size: unreadSize })}</p>}
    </div>
  )
}
