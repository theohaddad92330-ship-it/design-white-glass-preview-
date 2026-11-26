import { useTranslation } from 'react-i18next'
import { Ruler } from 'lucide-react'
import type { proposeProfileSize } from '@/features/discover/lib/discover-profile-size'

/**
 * #4516.7 (Louis 24/10) — la taille du profil est PROPOSÉE, jamais appliquée : « Ton profil vise les ETI » et un
 * geste pour filtrer dessus, un autre pour l'écarter. Revient sur T.1 (« Taille de ton profil appliquée »).
 */
export function ProfileSizeNotice({
  proposed,
  onApply,
  onDismiss,
}: {
  proposed: ReturnType<typeof proposeProfileSize>
  onApply: () => void
  onDismiss: () => void
}) {
  const { t } = useTranslation('discover')
  if (proposed === null) return null
  const size = t(`sidebar.size.${proposed}`)
  return (
    <div
      role="status"
      className="mb-4 flex flex-wrap items-center gap-2 rounded-lg p-3"
      style={{
        background: 'var(--surface-raised, rgba(148,163,184,0.06))',
        border: '1px solid rgba(148,163,184,0.22)',
      }}
    >
      <p className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--text-primary)' }}>
        <Ruler className="h-[13px] w-[13px]" aria-hidden />
        {t('profileSize.proposed', { size })}
      </p>
      <button
        type="button"
        onClick={onApply}
        className="rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]"
      >
        {t('profileSize.apply', { size })}
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="rounded-full border border-[var(--bellum-border)] px-3 py-1.5 text-sm text-[var(--bellum-text-secondary)] transition-colors pointer-coarse:min-h-11 hover:border-[var(--bellum-primary-500)] hover:text-[var(--bellum-text-primary)]"
      >
        {t('profileSize.dismiss')}
      </button>
    </div>
  )
}
