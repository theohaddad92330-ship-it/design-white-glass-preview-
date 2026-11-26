import { motion } from 'framer-motion'
import { ChevronDown } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Text } from '@bellum/ui'
import { useCurrentUserStore } from '@/stores/currentUserStore'
import { ValidateContextStatus } from '@/features/commercial-audit/components/ValidateContextStatus'
import { useCommercialAudit } from '@/features/commercial-audit/hooks/useCommercialAudit'
import { useProfile } from '@/features/profiles/hooks/useProfile'
import { WorkContextsSection } from '@/features/work-contexts/view/WorkContextsSection'
import { DangerZoneSection } from '../components/DangerZoneSection'
import { EsnMarketMemorySection } from '../components/EsnMarketMemorySection'
import { EsnSection } from '../components/EsnSection'
import { OfferPortfolioSection } from '../components/OfferPortfolioSection'
import { PlacedRolesSection } from '../components/PlacedRolesSection'
import { TargetPersonasSection } from '../components/TargetPersonasSection'
import { IdentitySection } from '../components/IdentitySection'
import { MyBusinessUnitsSection } from '../components/MyBusinessUnitsSection'
import { ProfileContextSection } from '../components/ProfileContextSection'
import { ProfileFramingHeader } from '../components/ProfileFramingHeader'
import { ProfileMaturitySection } from '../components/ProfileMaturitySection'
import { ProfileSkeleton } from '../components/ProfileSkeleton'
import { ReconfigureAnswersSection } from '../components/ReconfigureAnswersSection'
import { SecuritySection } from '../components/SecuritySection'
import { useEsnProfile } from '../hooks/useEsnProfile'

/**
 * Profile landing page — renders the section list only. Editing happens on
 * dedicated `/settings/profile/$stage` pages, each carrying its own auto-save.
 */
export function ProfilePage() {
  const { t } = useTranslation('profile')
  const { data: answers, isLoading: loadingAnswers } = useEsnProfile()
  const { data: profile, isLoading: loadingProfile } = useProfile()
  const user = useCurrentUserStore(s => s.currentUser)
  const { auditContext, validatedAt, isPendingReview, isLoading: loadingAudit } = useCommercialAudit()

  if (loadingAnswers || loadingProfile || !answers || !profile) return <ProfileSkeleton />

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' as const }}
      className="mx-auto w-full max-w-5xl space-y-6"
    >
      {/* Théo D settings-espace.R1 / N2 — le cadrage d'abord : « Ton profil de travail », ses trois gestes (audit,
          export, questionnaire), puis les thèmes avec leur avancement. */}
      <ProfileFramingHeader
        answers={answers}
        status={
          loadingAudit ? null : <ValidateContextStatus validatedAt={validatedAt} isPendingReview={isPendingReview} />
        }
        aside={
          /* DÉC. maturité — la maturité détaillée vit ICI, avec ses axes et l'axe non évaluable nommé. Tant que la
             lecture n'a pas répondu, la carte est ABSENTE (jamais un score vide). */
          loadingAudit ? null : (
            <div className="rounded-card border border-[var(--bellum-border)] bg-card p-6">
              <ProfileMaturitySection maturity={auditContext.maturity} />
            </div>
          )
        }
      />
      {/* #4364.4 — « Revoir mes réponses » dans le PREMIER écran, pas enfoui dans la zone repliée. #2022 — L'APPELANT de
          `POST /onboarding/refresh` ; ne rend RIEN hors d'un état terminal. */}
      <ReconfigureAnswersSection />
      {/* Maquette Théo V22 `settings-espace#profil` — les thèmes du questionnaire, en cartes. */}
      <EsnSection answers={answers} />

      {/* A5 — « Ce que {{copilot}} sait de ton ESN » : le détail derrière le cadrage, chaque ligne se corrige ici.
          Rien n'est retiré : portefeuille d'offre, postes placés, personas cibles, contextes de travail, mémoire de
          marché et périmètres de la personne (A7) restent des blocs éditables, chacun dans SA carte (titre dedans). */}
      <section className="space-y-4" aria-labelledby="profile-context-title">
        <div className="space-y-1 pt-2">
          <Text element="h2" size="base" weight="semibold" id="profile-context-title">
            {t('framing.context.title')}
          </Text>
          <Text element="p" size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('framing.context.subtitle')}
          </Text>
        </div>
        <OfferPortfolioSection answers={answers} />
        {/* #3923 — décision Louis 09/10 : les métiers placés, même colonne que la question du complément. */}
        <PlacedRolesSection />
        {/* #3754.1 — les postes visés et leur niveau décideur : ils ordonnent les contacts. */}
        <TargetPersonasSection />
        {/* #2455 — variantes de profil (« contextes de travail ») : c'est là qu'on cherche « une variante SANS toucher
            à ça » (#2455.1). */}
        <WorkContextsSection />
        {/* #1636 — le nom de l'entreprise vient du profil ESN ; l'état « rien n'a été cherché » dit « renseigne le
            nom ci-dessus ». */}
        <EsnMarketMemorySection />
        {/* #2118.9 — les périmètres que la personne PORTE : lus par le moteur pour que le verdict d'un compte les cite. */}
        <MyBusinessUnitsSection answers={answers} />
        <ProfileContextSection />
      </section>

      <IdentitySection firstName={profile.first_name} lastName={profile.last_name} email={profile.email} />
      {/* décision Louis 19/10 — maillon faible : Cockpit seul (/pilotage) */}
      <SecuritySection email={user?.email ?? ''} />

      {/* A6 — la zone sensible, repliée (`.t-acc` de la maquette) : repartir de zéro ne se
          croise pas par hasard. `details` natif : tabulable, annoncé « développé / réduit », sans état à synchroniser. */}
      <details className="group rounded-card border border-[var(--bellum-border)] bg-card" data-profile-sensitive="">
        <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-5 py-2 sm:px-6">
          <span>
            <Text element="span" size="sm" weight="semibold" className="block">
              {t('framing.sensitive.title')}
            </Text>
            <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
              {t('framing.sensitive.subtitle')}
            </Text>
          </span>
          <ChevronDown
            aria-hidden
            className="size-4 shrink-0 text-[var(--bellum-text-muted)] transition-transform duration-immediate ease-bellum-out group-open:rotate-180"
          />
        </summary>
        <div className="space-y-4 px-5 pb-5 sm:px-6">
          <DangerZoneSection />
        </div>
      </details>
    </motion.div>
  )
}
