import { useTranslation } from 'react-i18next'
import { Wrench } from 'lucide-react'
import type { DiscoverCapacityNotice } from '@/features/discover/lib/discover-capacity-notice'

/**
 * #2804 (#2291.2) — « capacité » (livraison/montée en charge). LOT j3 26/09 —
 * tranché sans Louis : « avertir » plutôt qu'exclure/réordonner (moins de
 * perte de résultats, réversible). Ce bandeau ne touche donc jamais la liste
 * de comptes : il rappelle la capacité DÉCLARÉE au profil, verbatim, pour que
 * le commercial juge lui-même si les comptes visés dépassent ce qu'il peut
 * livrer maintenant.
 *
 * `notice === null` (aucun des deux axes déclaré) : le bandeau ne se rend
 * PAS — « on n'affiche pas ce qu'on n'a pas » (doctrine), même règle que
 * `ProposedVolumeNotice` refuse un palier deviné.
 */
export function DeliveryCapacityNotice({ notice }: { notice: DiscoverCapacityNotice | null }) {
  const { t } = useTranslation('discover')

  if (!notice) return null

  return (
    <div
      role="status"
      className="mb-4 flex items-start gap-1.5 rounded-lg p-3 text-xs leading-snug"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
        color: 'var(--text-secondary)',
      }}
    >
      <Wrench className="mt-px h-[13px] w-[13px] shrink-0" aria-hidden />
      <span>
        {[
          notice.rampUpCapacity ? t('deliveryCapacity.notice.rampUp', { value: notice.rampUpCapacity }) : null,
          notice.availableConsultantsBand
            ? t('deliveryCapacity.notice.available', { value: notice.availableConsultantsBand })
            : null,
        ]
          .filter(Boolean)
          .join(' · ')}
      </span>
    </div>
  )
}
