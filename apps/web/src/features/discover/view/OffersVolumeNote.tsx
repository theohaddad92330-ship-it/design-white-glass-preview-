import { useTranslation } from 'react-i18next'
import type { DiscoverCandidate } from '@/features/discover/lib/discover-types'

/**
 * DISCOVER-OFFRES (15/10) — « N offres en France sur 90 jours », sur la carte.
 *
 * Un fait MESURÉ ou rien : `null` sans `offersVolume` (pas de réponse, pas de domaine connu) — jamais
 * « 0 offre », jamais un texte de repli (GA-18 / GA-19, « on n'affiche pas ce qu'on n'a pas »).
 * La source du chiffre ne se nomme pas.
 */
export function OffersVolumeNote({ candidate }: { candidate: DiscoverCandidate }) {
  const { t } = useTranslation('discover')
  const volume = candidate.offersVolume
  if (!volume) return null

  return (
    <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
      {t('card.offersVolume', { count: volume.count, days: volume.windowDays })}
    </p>
  )
}
