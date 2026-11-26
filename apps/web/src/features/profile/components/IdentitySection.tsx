import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import { User } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { ProfileSection } from './ProfileSection'

type Props = {
  firstName: string | null
  lastName: string | null
  email: string | null
}

export const IdentitySection = memo<Props>(function IdentitySection({ firstName, lastName, email }) {
  const { t } = useTranslation('profile')
  const navigate = useNavigate()
  const fullName = [firstName, lastName].filter(Boolean).join(' ').trim()
  return (
    <SettingsBlock label={t('identity.title')} description={t('identity.sectionSubtitle')}>
      <ProfileSection
        icon={User}
        title={t('identity.rowTitle')}
        description={email ?? ''}
        value={fullName || t('identity.emptyValue')}
        onClick={() => navigate({ to: '/settings/profile/identity' })}
      />
    </SettingsBlock>
  )
})
