import { Brain } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { ProfileSection } from './ProfileSection'

export function ProfileContextSection() {
  const { t } = useTranslation('profile')
  const navigate = useNavigate()
  const { data: response } = useProfileContext()
  const profileContext = response?.profile_context ?? null
  const status = response?.status ?? 'not_generated'
  const failureReason = response?.failureReason ?? null

  const statusLabel: Record<string, string> = {
    succeeded: t('context.status.succeeded'),
    generating: t('context.status.generating'),
    // #4969 — la RAISON enregistrée quand on la connaît ; sinon on dit qu'elle ne l'est pas (échec antérieur).
    failed: failureReason
      ? t('context.status.failedWithReason', { reason: t(`context.failure.${failureReason}`) })
      : t('context.status.failed'),
    not_generated: t('context.status.notGenerated'),
  }

  return (
    <SettingsBlock label={t('context.section.title')} description={t('context.header.subtitle')}>
      <ProfileSection
        icon={Brain}
        title={t('context.section.rowTitle')}
        description={profileContext ? t('context.section.rowDescAvailable') : t('context.section.rowDescPending')}
        value={statusLabel[status]}
        onClick={() => navigate({ to: '/settings/profile/context' })}
      />
    </SettingsBlock>
  )
}
