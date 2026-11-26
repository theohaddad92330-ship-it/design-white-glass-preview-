import { Button, SettingsRow } from '@bellum/ui'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'
import { Link } from '@tanstack/react-router'
import { ArrowRight } from 'lucide-react'
import { motion } from 'framer-motion'
import { useTranslation } from 'react-i18next'
import { ActiveSessionsRow } from '../components/security/ActiveSessionsRow'
import { DataExportRow } from '../components/security/DataExportRow'
import { DeleteAccountRow } from '../components/security/DeleteAccountRow'
import { SecurityHeader } from '../components/security/SecurityHeader'
import { PasswordRow } from '../components/security/PasswordRow'
import { TwoFactorRow } from '../components/security/TwoFactorRow'
import { useSession } from '@/lib/hooks/use-session'

/**
 * Page Sécurité — orchestrateur. Toute la logique vit dans les
 * sous-composants (`<TwoFactorRow>`, `<ActiveSessionsRow>`,
 * `<DataExportRow>`) ; ici on ne fait que composer les groupes.
 */
export function SecurityView() {
  const { t } = useTranslation('settings', { keyPrefix: 'security' })
  const { user } = useSession()
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' as const }}
      className="w-full"
    >
      <SecurityHeader />

      <SettingsBlock label={t('groupSession')} description={t('groupSessionDescription', { email: user?.email ?? '' })}>
        <PasswordRow />
        <TwoFactorRow />
      </SettingsBlock>

      <ActiveSessionsRow />

      {/* Théo D settings-compte.R2 — l'accès aux données se GÈRE ailleurs (membres et
          rôles, connecteurs) : la rubrique renvoie, elle ne refait pas (GA-26). */}
      <SettingsBlock label={t('groupDataAccess')} description={t('groupDataAccessDescription')}>
        <LinkRow
          title={t('accessPeopleTitle')}
          description={t('accessPeopleDescription')}
          action={t('accessPeopleOpen')}
          to="/settings/team"
        />
        <LinkRow
          title={t('accessToolsTitle')}
          description={t('accessToolsDescription')}
          action={t('accessToolsOpen')}
          to="/integrations"
        />
      </SettingsBlock>

      <SettingsBlock label={t('groupPrivacy')} description={t('groupPrivacyDescription')}>
        <DataExportRow />
        <DeleteAccountRow />
      </SettingsBlock>
    </motion.div>
  )
}

function LinkRow({
  title,
  description,
  action,
  to,
}: {
  title: string
  description: string
  action: string
  to: '/settings/team' | '/integrations'
}) {
  return (
    <SettingsRow
      title={title}
      description={description}
      trailing={
        <Button asChild variant="outline" size="sm" className="pointer-coarse:min-h-11">
          <Link to={to}>
            {action}
            <ArrowRight size={13} className="ml-1.5" aria-hidden="true" />
          </Link>
        </Button>
      }
    />
  )
}
