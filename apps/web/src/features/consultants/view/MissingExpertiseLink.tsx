import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { useMissingExpertise } from '../hooks'

/**
 * #4349 V.2 — décision Louis 19/10 : le bloc « compétences qui te coûtent des besoins » vit dans
 * Pilotage › Staffing (`MissingExpertisePanel`). Le Vivier n'en garde qu'un lien, et seulement quand
 * il y a quelque chose à voir : une absence ne fait aucune ligne.
 */
export function MissingExpertiseLink() {
  const { t } = useTranslation('consultants')
  const query = useMissingExpertise()
  const count = query.data?.items.length ?? 0
  if (query.isPending || count === 0) return null

  return (
    <Link
      to="/pilotage/staffing"
      className="inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] underline"
    >
      {t('missingExpertise.staffingLink', { count })}
    </Link>
  )
}
