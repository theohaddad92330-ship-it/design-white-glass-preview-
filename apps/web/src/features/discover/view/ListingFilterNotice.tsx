import { useTranslation } from 'react-i18next'
import { Landmark } from 'lucide-react'
import type { DiscoverListingFilter } from '@/features/discover/lib/discover-types'

/**
 * #4361.2 — le compteur de « Exclure les sociétés cotées ».
 *
 * Trois lectures, jamais confondues (doctrine « non mesuré n'est jamais 0 ») :
 * - `filter` absent : l'interrupteur n'est pas posé — rien à dire, `null` ;
 * - `sourceAvailable === false` : la cotation n'a pas pu être vérifiée, RIEN n'a été retiré et on
 *   ne dit pas que le reste est « non coté » ;
 * - sinon : combien retirées (preuve de cotation), et combien dont la cotation n'est pas établie —
 *   elles RESTENT dans la liste. L'index prouve « cotée », jamais « non cotée ».
 */
export function ListingFilterNotice({ filter }: { filter: DiscoverListingFilter | undefined }) {
  const { t } = useTranslation('discover')
  if (!filter?.applied) return null

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      {filter.sourceAvailable ? (
        <>
          <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            <Landmark aria-hidden="true" className="h-[13px] w-[13px]" />
            {filter.excludedCount > 0
              ? t('listingFilter.removed', { count: filter.excludedCount })
              : t('listingFilter.none')}
          </p>
          {filter.unknownCount > 0 && (
            <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
              {t('listingFilter.unknown', { count: filter.unknownCount })}
            </p>
          )}
        </>
      ) : (
        <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          <Landmark aria-hidden="true" className="h-[13px] w-[13px]" />
          {t('listingFilter.sourceDown')}
        </p>
      )}
    </div>
  )
}
