import { memo } from 'react'
import { useTranslation } from 'react-i18next'
import type { TFunction } from 'i18next'
import { Briefcase, Building2, Lock, Target, Users, type LucideIcon } from 'lucide-react'
import { useNavigate } from '@tanstack/react-router'
import type { EsnAnswers } from '@bellum/contracts'
import { Text } from '@bellum/ui'
import { TEMPS1_STAGES, type OnboardingStageDef } from '@/features/onboarding/lib/questions'
import { stageProgress } from '../lib/framing'
import { useEsnProfileWorkspaceMeta } from '../hooks/useEsnProfileWorkspaceMeta'
import { ImpactedAccountsNotice } from './ImpactedAccountsNotice'
import { ProfileSection } from './ProfileSection'

type Props = { answers: EsnAnswers }

// Descriptions résolues au rendu via i18n (clés profile:esn.stages.*).
const STAGE_META: Record<string, { icon: LucideIcon; descriptionKey: string }> = {
  company_info: { icon: Building2, descriptionKey: 'esn.stages.companyInfo' },
  offer_expertise: { icon: Briefcase, descriptionKey: 'esn.stages.offerExpertise' },
  target_market: { icon: Target, descriptionKey: 'esn.stages.targetMarket' },
}

function stageStatus(stage: OnboardingStageDef, answers: EsnAnswers, t: TFunction<'profile'>): string {
  // `stageProgress` : une question avec une valeur par défaut (domaine d'offre → esn_it) compte comme renseignée
  // même sans réponse explicite — elle n'est jamais bloquante.
  const { filled, total } = stageProgress(stage, answers)
  return t('esn.stageAnswers', { filled, total })
}

export const EsnSection = memo<Props>(function EsnSection({ answers }) {
  const { t } = useTranslation('profile')
  const navigate = useNavigate()
  const { data: meta } = useEsnProfileWorkspaceMeta()
  const shared = meta?.shared ?? false
  const lockedCompany = shared && !(meta?.canEditCompany ?? true)

  return (
    <section className="space-y-3" aria-labelledby="profile-themes-title">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text element="h2" size="base" weight="semibold" id="profile-themes-title">
            {t('esn.title')}
          </Text>
          {shared && (
            <span className="inline-flex items-center gap-1 rounded-badge border border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]">
              {lockedCompany ? <Lock aria-hidden className="size-3" /> : <Users aria-hidden className="size-3" />}
              {t('esn.shared.badge')}
            </span>
          )}
        </div>
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {shared
            ? lockedCompany
              ? t('esn.shared.subtitleLocked')
              : t('esn.shared.subtitleEditable')
            : t('esn.subtitle')}
        </Text>
        {shared && (
          <Text element="p" size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('esn.personal.title')} — {t('esn.personal.hint')}
          </Text>
        )}
      </div>
      {/* Maquette Théo V22 `settings-espace#profil` — `.ob20-profile-themes` : une carte par thème, deux colonnes
          (une seule sous 768 px), l'avancement sous l'intitulé. */}
      <div className="grid gap-3 md:grid-cols-2" data-profile-themes="">
        {TEMPS1_STAGES.map(stage => {
          const meta_ = STAGE_META[stage.code]
          return (
            <ProfileSection
              key={stage.code}
              variant="card"
              icon={meta_?.icon ?? Briefcase}
              title={t(`onboarding:${stage.title}`)}
              description={meta_ ? t(meta_.descriptionKey) : ''}
              value={stageStatus(stage, answers, t)}
              onClick={() => navigate({ to: '/settings/profile/$stage', params: { stage: stage.code } })}
            />
          )
        })}
      </div>
      {/* #2306.24 — « N comptes concernés » : le portefeuille analysé avec un
          profil ESN devenu plus ancien que celui d'aujourd'hui. Juste sous les
          stages secteurs/offres qu'elle concerne. */}
      <ImpactedAccountsNotice />
    </section>
  )
})
