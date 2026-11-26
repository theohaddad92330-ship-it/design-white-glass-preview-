import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { motion } from 'framer-motion'
import { ChevronLeft, Pencil } from 'lucide-react'
import { Link, useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import type { UserProfile } from '@bellum/contracts'
import { Button, Input, Text } from '@bellum/ui'
import { useProfile } from '@/features/profiles/hooks/useProfile'
import { useSaveProfile } from '@/features/profiles/hooks/useSaveProfile'
import { usePendingEmailChange } from '@/features/profiles/hooks/useChangeEmail'
import { MailboxSignatureCard } from '@/features/mailbox/view/MailboxSignatureCard'
import { BusinessRoleField } from '../components/BusinessRoleField'
import { ChangeEmailDialog } from '../components/ChangeEmailDialog'
import { ProfileSkeleton } from '../components/ProfileSkeleton'
import { SettingsBlock } from '@/features/settings/components/SettingsBlock'

/**
 * `embedded` — Théo D settings-prefs.R4 : l'identité est le sous-onglet « Mon
 * identité » des Préférences, qui porte déjà le titre et n'a pas de page mère
 * vers laquelle revenir. Sans, la page garde sa route `/settings/profile/identity`.
 */
export function ProfileIdentityPage({ embedded = false }: { embedded?: boolean }) {
  const { data: profile, isLoading } = useProfile()
  if (isLoading || !profile) return <ProfileSkeleton />
  return <IdentityEditor profile={profile} embedded={embedded} />
}

function IdentityEditor({ profile, embedded }: { profile: UserProfile; embedded: boolean }) {
  const { t } = useTranslation('profile')
  const navigate = useNavigate()
  const save = useSaveProfile()
  const pending = usePendingEmailChange()
  const pendingNewEmail = pending.data?.new_email ?? null
  const [firstName, setFirstName] = useState(profile.first_name ?? '')
  const [lastName, setLastName] = useState(profile.last_name ?? '')
  const [emailDialogRequested, setEmailDialogRequested] = useState(false)
  // Forced open when a verification is still in flight — a reload can't bypass it.
  const emailDialogOpen = emailDialogRequested || !!pendingNewEmail

  const trimmedFirst = firstName.trim()
  const trimmedLast = lastName.trim()
  const dirty = firstName !== (profile.first_name ?? '') || lastName !== (profile.last_name ?? '')
  const valid = trimmedFirst.length > 0 && trimmedLast.length > 0
  const initials = `${trimmedFirst.charAt(0)}${trimmedLast.charAt(0)}`.toUpperCase()

  const onSave = async (): Promise<void> => {
    if (!valid) return
    try {
      await save.mutateAsync({
        first_name: trimmedFirst,
        last_name: trimmedLast,
      })
      toast.success(t('identity.toast.saved'))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t('errors.saveFailed'))
    }
  }

  return (
    <>
      {!embedded && (
        <Button
          type="button"
          variant="ghost"
          icon={ChevronLeft}
          size="sm"
          iconPosition="left"
          onClick={() => navigate({ to: '/settings/profile' })}
        >
          {t('common:actions.back')}
        </Button>
      )}

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' as const }}
        className="w-full space-y-6"
      >
        {!embedded && (
          <div>
            <Text element="h1" size="2xl" weight="bold" className="text-[var(--bellum-text-primary)]">
              {t('identity.title')}
            </Text>
            <Text size="sm" className="mt-0.5 text-[var(--bellum-text-secondary)]">
              {t('identity.subtitle')}
            </Text>
          </div>
        )}

        <SettingsBlock label={t('identity.title')} description={t('identity.sectionSubtitle')}>
          <div className="space-y-5 p-5 sm:p-6">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft-bg)] text-sm font-semibold text-[var(--accent-soft-text)]"
              >
                {initials || '·'}
              </span>
              <div className="min-w-0">
                <Text element="p" size="sm" weight="semibold" className="truncate">
                  {`${trimmedFirst} ${trimmedLast}`.trim() || t('identity.emptyValue')}
                </Text>
                <Text element="p" size="xs" className="truncate text-[var(--bellum-text-secondary)]">
                  {profile.email ?? ''}
                </Text>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {t('identity.firstNameLabel')}
                </Text>
                <Input
                  value={firstName}
                  onChange={e => setFirstName(e.target.value)}
                  placeholder={t('identity.firstNamePlaceholder')}
                  maxLength={60}
                />
              </div>

              <div className="space-y-1.5">
                <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                  {t('identity.lastNameLabel')}
                </Text>
                <Input
                  value={lastName}
                  onChange={e => setLastName(e.target.value)}
                  placeholder={t('identity.lastNamePlaceholder')}
                  maxLength={60}
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
                {t('identity.emailLabel')}
              </Text>
              <div className="flex items-center gap-2">
                <Input
                  value={profile.email ?? ''}
                  disabled
                  placeholder={t('email.emailPlaceholder')}
                  className="flex-1 disabled:opacity-100 disabled:text-[var(--bellum-text-secondary)]"
                />
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  aria-label={t('email.changeEmail')}
                  onClick={() => setEmailDialogRequested(true)}
                >
                  <Pencil />
                </Button>
              </div>
              <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
                {t('identity.emailHint')}
              </Text>
            </div>

            <BusinessRoleField />

            <Button
              type="button"
              variant="violet"
              isLoading={save.isPending}
              loadingText={t('common:states.saving')}
              disabled={!dirty || !valid || save.isPending}
              onClick={onSave}
            >
              {t('common:actions.save')}
            </Button>
          </div>
        </SettingsBlock>

        {/* #1397.2 — LA SIGNATURE DE MESSAGERIE, à sa place (réglage, pas premier élément de `/mailbox`).
            Sa porte d'écriture reste unique (GA-26) : `mailboxApi.setSignature`. */}
        <SettingsBlock label={t('identity.signatureTitle')} description={t('identity.signatureHint')}>
          <div className="p-5 sm:p-6">
            <MailboxSignatureCard />
          </div>
        </SettingsBlock>

        {/* Théo D settings-prefs (Mon identité) — la note de bas d'onglet : ce qui ne se règle PAS ici a un seul
            endroit (GA-26), on y mène. */}
        {embedded ? (
          <Text
            element="p"
            size="sm"
            className="rounded-lg border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-4 py-3 text-[var(--bellum-text-secondary)]"
          >
            {t('identity.securityNote')}{' '}
            <Link to="/settings/security" className="font-medium text-[var(--bellum-text-accent)] hover:underline">
              {t('identity.securityNoteLink')}
            </Link>
            .
          </Text>
        ) : null}
      </motion.div>

      <ChangeEmailDialog
        open={emailDialogOpen}
        onOpenChange={setEmailDialogRequested}
        currentEmail={profile.email ?? ''}
        pendingNewEmail={pendingNewEmail}
      />
    </>
  )
}
