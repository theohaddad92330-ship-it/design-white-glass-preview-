import { buildOnboardingRestitution } from '@bellum/contracts'
import { motion } from 'framer-motion'
import { ChevronLeft, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from '@tanstack/react-router'
import { toast } from 'sonner'
import { Button, SectionSidebarNav, Text, type SidebarSection } from '@bellum/ui'
import { useHasAccountsToAct } from '@/features/accounts/hooks/useHasAccountsToAct'
import { useEsnProfile } from '@/features/profile/hooks/useEsnProfile'
import { useReconfigureOnboarding } from '@/features/profile/hooks/useReconfigureOnboarding'
import { OnboardingRestitutionCard } from '@/features/onboarding/components/OnboardingRestitutionCard'
import { CorrectRecapButton } from '@/features/profile-context/components/CorrectRecapButton'
import { ImpactedAccountsBanner } from '@/features/profile-context/components/ImpactedAccountsBanner'
import { PersonalizationGrid } from '@/features/profile-context/components/PersonalizationGrid'
import { ProfileContextVersions } from '@/features/profile-context/components/ProfileContextVersions'
import { ProfileRecapCard } from '@/features/profile-context/components/ProfileRecapCard'
import { RegenerateContextButton } from '@/features/profile-context/components/RegenerateContextButton'
import { RegenerateSectionButton } from '@/features/profile-context/components/RegenerateSectionButton'
import { useProfileContext } from '@/features/profile-context/hooks/useProfileContext'
import { useRegenerateProfileContext } from '@/features/profile-context/hooks/useRegenerateProfileContext'
import { ProfileSkeleton } from '../components/ProfileSkeleton'

export function ProfileContextSubPage() {
  const { t } = useTranslation('profile')
  const navigate = useNavigate()
  const { data: response, isLoading } = useProfileContext()
  const regenerate = useRegenerateProfileContext()
  const { data: esnAnswers } = useEsnProfile()
  const { data: accountsToAct } = useHasAccountsToAct()
  const reconfigure = useReconfigureOnboarding()
  const profileContext = response?.profile_context ?? null
  const isGenerating = response?.status === 'generating'

  if (isLoading) return <ProfileSkeleton />

  // #3252.12 — SURFACE « Paramètres › Profil » : la restitution reste visible
  // ici, et `ProfileContextVersions` (juste en dessous) porte déjà sa
  // versionnée. MÊME composant que `/welcome` (`OnboardingRestitutionCard`,
  // GA-26) — `CoachingFooter` est retiré des DEUX surfaces (tranché sans
  // Louis, #3252) : il n'avait plus aucun appelant une fois son contenu
  // couvert ici, jamais un composant qui reste sans lecteur.
  const restitution = buildOnboardingRestitution({
    answers: esnAnswers ?? null,
    coachingInsights: profileContext?.coachingInsights ?? null,
    hasAccountsToAct: accountsToAct?.hasAccountsToAct ?? false,
  })
  const hasRestitution =
    restitution.understanding.length > 0 ||
    Boolean(restitution.bottleneck) ||
    restitution.notRecommended.length > 0 ||
    restitution.priorities.length > 0 ||
    Boolean(restitution.firstTest) ||
    restitution.gaps.length > 0
  const hasRecap = Boolean(profileContext?.welcomeSummary?.profileRecap)
  const hasPersonalization = Boolean(profileContext?.welcomeSummary)
  const hasContent = hasRecap || hasPersonalization || hasRestitution

  const onNotMyContext = async (): Promise<void> => {
    const ok = await reconfigure.trigger()
    if (!ok) toast.error(t('reconfigure.error', { ns: 'onboarding' }))
  }
  const onRefineWithLaura = (): void => {
    navigate({ to: '/chat', search: { from: 'welcome' } })
  }
  const FIRST_WORKSITE_ROUTE: Record<string, () => void> = {
    extendExistingAccounts: () => navigate({ to: '/accounts' }),
    defineOffer: () => navigate({ to: '/onboarding' }),
    buildAccessPath: onRefineWithLaura,
    analyzeFirstAccount: () => navigate({ to: '/search' }),
  }
  const onStartFirstWorksite = (): void => {
    const key = restitution.firstTest?.priority ?? restitution.priorities[0]
    const go = (key && FIRST_WORKSITE_ROUTE[key]) || (() => navigate({ to: '/search' }))
    go()
  }

  const tocSections: SidebarSection[] = []
  if (hasRecap) tocSections.push({ id: 'profile-recap', label: t('context.toc.recap') })
  if (hasPersonalization) tocSections.push({ id: 'personalization', label: t('context.toc.personalization') })
  if (hasRestitution) tocSections.push({ id: 'coaching', label: t('context.toc.coaching') })

  return (
    <div className="mx-auto w-full max-w-6xl">
      <Button
        type="button"
        variant="ghost"
        icon={ChevronLeft}
        size="sm"
        iconPosition="left"
        className="-ml-3 pointer-coarse:min-h-11"
        onClick={() => navigate({ to: '/settings/profile' })}
      >
        {t('common:actions.back')}
      </Button>

      <div className="mt-3 flex gap-12">
        <div className="min-w-0 flex-1">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' as const }}
            className="w-full space-y-6"
          >
            {/* Maquette Théo V22 `settings-espace#profil` — `.v12-header` : eyebrow, titre, phrase, le geste à droite ;
                puis chaque partie dans SA carte (`.v12-setting-block`). */}
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <Text
                  element="p"
                  size="xs"
                  weight="semibold"
                  className="mb-2 uppercase tracking-widest text-[var(--bellum-text-muted)]"
                >
                  {t('framing.eyebrow')}
                </Text>
                <Text element="h1" size="3xl" weight="semibold" className="tracking-tight">
                  {t('context.header.title')}
                </Text>
                <Text size="sm" className="mt-2 text-[var(--bellum-text-secondary)]">
                  {t('context.header.subtitle')}
                </Text>
              </div>
              {hasContent && <RegenerateContextButton isGenerating={isGenerating} />}
            </header>

            {!profileContext || !hasContent ? (
              <div
                data-context-empty=""
                className="space-y-4 rounded-card border border-[var(--bellum-border)] bg-card p-6"
              >
                <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
                  {t('context.emptyState.description')}
                </Text>
                <Button
                  type="button"
                  variant="default"
                  size="sm"
                  icon={RefreshCw}
                  iconPosition="left"
                  isLoading={regenerate.isPending || isGenerating}
                  loadingText={t('context.generate.loading')}
                  onClick={() => regenerate.mutate()}
                >
                  {t('context.generate.cta')}
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {hasRecap && (
                  <section id="profile-recap" className="space-y-2">
                    <ProfileRecapCard context={profileContext} showEditButton={false} tone="dark" />
                    <div className="flex flex-wrap items-center gap-2">
                      <CorrectRecapButton
                        value={profileContext.welcomeSummary?.profileRecap ?? ''}
                        corrected={Boolean(response?.corrections['welcomeSummary.profileRecap'])}
                      />
                      {/* #2908 (#2010.16/#2011.10) — couvre aussi la section
                          « personalization » juste en dessous : les deux blocs
                          viennent du même `welcomeSummary`. */}
                      <RegenerateSectionButton section="welcomeSummary" />
                    </div>
                  </section>
                )}
                {hasPersonalization && (
                  <section id="personalization">
                    <PersonalizationGrid context={profileContext} tone="dark" />
                  </section>
                )}
                {hasRestitution && (
                  <section
                    id="coaching"
                    className="space-y-4 rounded-card border border-[var(--bellum-border)] bg-card p-5 md:p-6"
                  >
                    <Text element="h2" size="base" weight="semibold">
                      {t('context.coaching.title')}
                    </Text>
                    <OnboardingRestitutionCard
                      restitution={restitution}
                      onNotMyContext={() => void onNotMyContext()}
                      onRefineWithLaura={onRefineWithLaura}
                      onStartFirstWorksite={onStartFirstWorksite}
                      notMyContextPending={reconfigure.pending}
                    />
                    {Boolean(restitution.bottleneck) && <RegenerateSectionButton section="coachingInsights" />}
                  </section>
                )}
                <ImpactedAccountsBanner />
                <ProfileContextVersions />
              </div>
            )}
          </motion.div>
        </div>

        {tocSections.length >= 2 && (
          <aside className="hidden w-48 shrink-0 xl:block">
            <div className="sticky top-10 pt-24 right-24">
              <SectionSidebarNav sections={tocSections} />
            </div>
          </aside>
        )}
      </div>
    </div>
  )
}
