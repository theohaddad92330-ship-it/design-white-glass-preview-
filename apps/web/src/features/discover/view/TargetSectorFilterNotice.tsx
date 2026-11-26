import { useTranslation } from 'react-i18next'
import { Target } from 'lucide-react'
import type { DiscoverTargetSectorFilter } from '@/features/discover/lib/discover-types'

/**
 * #2489.3/D1 (décision Louis, 18/09/2026 après-midi) — la cible déclarée du
 * profil ESN filtre Découvrir par défaut, y compris une recherche en texte
 * libre. Mesuré en PRODUCTION le 18/09 (`474fcfa31`, espace « LouisESN ») :
 * `?freetext=entreprises+dans+le+75` rendait 24 résultats, 0 dans les 5
 * secteurs cibles déclarés — 9 restauration traditionnelle, 4 restauration
 * rapide, 2 supermarchés, 1 hôtellerie, 1 boulangerie.
 *
 * Trois lectures, trois rendus — jamais confondus :
 *
 * - `filter` absent (`undefined`) : l'espace n'a déclaré AUCUNE cible. Une
 *   cible non déclarée n'est pas une cible vide (GA-18/GA-19) — rien à
 *   écarter, rien à dire, ce composant rend `null`.
 * - `filter.applied === true` : le filtre a TOURNÉ. Le compteur n'est pas
 *   décoratif — `excludedCount === 0` (« cible respectée ») se lit
 *   DIFFÉREMMENT d'un compte positif, mais les deux affichent le bouton.
 * - `filter.applied === false` : le bouton « chercher hors de ma cible » a
 *   été actionné — un état VISIBLE, pas caché dans un menu.
 */
export function TargetSectorFilterNotice({
  filter,
  onToggle,
}: {
  filter: DiscoverTargetSectorFilter | undefined
  /** Bascule l'état — jamais un geste caché : l'appelant réémet la recherche. */
  onToggle: (includeOutOfTarget: boolean) => void
}) {
  const { t } = useTranslation('discover')
  if (!filter) return null

  if (!filter.applied) {
    return (
      <div
        role="status"
        className="mb-4 rounded-lg p-3"
        style={{
          background: 'var(--surface-raised, rgba(148,163,184,0.06))',
          border: '1px solid rgba(148,163,184,0.22)',
        }}
      >
        <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          <Target className="h-[13px] w-[13px]" />
          {t('targetSectorFilter.disabledTitle')}
        </p>
        <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {t('targetSectorFilter.disabledDescription')}
        </p>
        <div className="mt-2">
          <button
            type="button"
            onClick={() => onToggle(false)}
            className="rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]"
          >
            {t('targetSectorFilter.backToTarget')}
          </button>
        </div>
      </div>
    )
  }

  const { excludedCount, excludedSectors } = filter

  return (
    <div
      role="status"
      className="mb-4 rounded-lg p-3"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <p className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
        <Target className="h-[13px] w-[13px]" />
        {excludedCount > 0
          ? t('targetSectorFilter.excludedTitle', { count: excludedCount })
          : t('targetSectorFilter.excludedNone')}
      </p>
      {excludedSectors.length > 0 && (
        <p className="mt-1 text-xs leading-snug" style={{ color: 'var(--text-secondary)' }}>
          {t('targetSectorFilter.excludedSectors', { sectors: excludedSectors.join(', ') })}
        </p>
      )}
      <div className="mt-2">
        <button
          type="button"
          onClick={() => onToggle(true)}
          className="rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]"
        >
          {t('targetSectorFilter.seeOutOfTarget')}
        </button>
      </div>
    </div>
  )
}
