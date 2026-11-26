import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import type { HiringDomainNotice } from '@/features/discover/lib/discover-hiring-domain'

/**
 * #3901.p (Louis 16/10) — la ligne courte : aucun métier déclaré ni déduit → les offres d'emploi ne sont pas
 * retenues comme signal, et on renvoie vers le réglage des métiers (« Mon profil ») ; veille du compte :
 * combien d'offres hors métier restent listées en fin de liste.
 */
export function HiringDomainNoticeLine({ notice }: { notice: HiringDomainNotice | null }) {
  const { t } = useTranslation('discover')
  if (!notice) return null
  return (
    <p
      data-testid="hiring-domain-notice"
      className="mb-2 text-xs leading-snug"
      style={{ color: 'var(--text-secondary)' }}
    >
      {notice.kind === 'noRoles' ? (
        <>
          {t('card.hiringDomainNoRoles')}{' '}
          <Link to="/settings/profile" className="underline" style={{ color: 'var(--accent-soft-text)' }}>
            {t('card.hiringDomainUnfilteredCta')}
          </Link>
        </>
      ) : notice.kind === 'profileError' ? (
        t('card.hiringDomainProfileError')
      ) : (
        t('card.hiringDomainOff', { count: notice.count })
      )}
    </p>
  )
}
