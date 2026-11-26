import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'

/** Théo C talents-recrutement — la porte du vivier vers l'écran Recrutement (le kanban des personnes). */
export function RecruitmentEntryLink() {
  const { t } = useTranslation('consultants')
  return (
    <Link
      to="/consultants/recrutement"
      className="inline-flex min-h-11 items-center rounded-md px-3 text-sm font-medium text-[var(--bellum-text-secondary)] underline-offset-2 hover:underline"
    >
      {t('recruitment.bar.recruitment')}
    </Link>
  )
}
