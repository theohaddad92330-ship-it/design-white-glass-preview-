import { Text } from '@bellum/ui'
import { hasPermission } from '@bellum/contracts'
import { Link } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { AskLaura } from '@/components/primitives/AskLaura'
import { ScreenIntro } from '@/components/primitives/ScreenIntro'
import { CustomerPage } from '@/components/page/CustomerPage'
import { PlanFeatureLocked } from '@/features/plan-features/PlanFeatureLocked'
import { useWorkspaceProfile } from '@/features/profile/hooks/useWorkspaceProfile'
import { useTeam } from '@/features/team/hooks/useTeam'
import { orderPilotageSections, type PILOTAGE_SECTIONS } from '../lib/pilotage-sections'
import { FinanceScreen } from '../finance/FinanceScreen'
import { PipeScreen } from '../pipe/PipeScreen'
import { StaffingScreen } from '../staffing/StaffingScreen'
import { CockpitBody } from './CockpitBody'
import { CockpitExportButton } from './cockpit/CockpitExportButton'
import { useCockpitFigures } from './cockpit/useCockpitFigures'
import { PilotageAnchors } from './PilotageAnchors'
import { PilotageSection } from './PilotageSection'

/**
 * PILOTAGE — UNE page, quatre sections ancrées (Théo D, Louis 22/10/2026).
 *
 * « Page Théo unique + Cockpit / Pipe / Staffing / Finance en sections ancrées ; anciennes routes y
 * pointent. » Renverse la décision du 14/10 sur les quatre ADRESSES (`/pilotage/pipe`, `/staffing`,
 * `/finance` redirigent vers `/pilotage#pipe|staffing|finance`), pas sur leur contenu : chaque section
 * garde son écran. `/pilotage/rex` reste une route (les retours d'expérience vivent dans Missions).
 *
 * Le droit se règle par SECTION (Louis 15/10/2026), comme avant par onglet :
 *  - Cockpit, Staffing, Finance : `team:manage` ET l'offre `manager_cockpit` ; ailleurs, la phrase
 *    « Cette section n'est pas ouverte à ton rôle » dit où retrouver son activité ;
 *  - Pipe : ouvert à tous — CHACUN SON PIPE (Q5) : un commercial lit ses affaires, un gestionnaire
 *    l'équipe, un client sans l'offre voit la porte de l'offre ; Parcours reste ouvert à tous.
 *
 * Louis 23/10 — l'offre `manager_cockpit` est lue par la ROUTE (`routes/pilotage/index.tsx`) et arrive ici en
 * `offerAllowed` : la porte de l'offre ne dépend plus d'un garde de page supprimé (`ManagerTabRoute`), et le
 * chargement direct de `/pilotage` ne la contourne pas. La section Cockpit est le Cockpit de Théo (`CockpitBody`).
 */
export function PilotagePage({ offerAllowed }: { offerAllowed: boolean }) {
  const { t, i18n } = useTranslation('pilotage')
  const { team, isLoading } = useTeam()
  const allowed = offerAllowed
  // Même test que l'ancien `ManagerTabRoute` : `team:manage`, jamais un rôle écrit en dur ; si l'équipe ne
  // se charge pas, l'API tient le droit de toute façon.
  const canManage = !team || hasPermission(team.workspace.role, 'team:manage')
  const cockpitOpen = !isLoading && canManage && allowed
  // #4270.2 — en forfait / conseil, Staffing passe en dernier (c76 : l'ordre seul change).
  const sections = orderPilotageSections(useWorkspaceProfile())
  const month = new Intl.DateTimeFormat(i18n.language, { month: 'long', year: 'numeric' }).format(new Date())

  const content: Record<(typeof PILOTAGE_SECTIONS)[number]['id'], ReactNode> = {
    cockpit: (
      <PilotageSection id="cockpit" title={t('theo.sections.cockpit')}>
        {cockpitOpen ? (
          <CockpitBody />
        ) : isLoading ? null : canManage ? (
          <PlanFeatureLocked feature="manager_cockpit" />
        ) : (
          <Locked text={t('theo.section.lockedCockpit')} />
        )}
      </PilotageSection>
    ),
    pipe: (
      <PilotageSection
        id="pipe"
        title={t('theo.section.pipe.title')}
        intro={canManage ? t('theo.section.pipe.intro') : t('theo.section.pipe.own')}
        access={t('theo.section.pipe.access')}
      >
        <PipeScreen
          manager={canManage && allowed}
          own={!canManage && allowed}
          locked={canManage && !allowed ? <PlanFeatureLocked feature="manager_cockpit" /> : null}
        />
      </PilotageSection>
    ),
    staffing: (
      <PilotageSection
        id="staffing"
        title={t('theo.section.staffing.title')}
        intro={t('theo.section.staffing.intro')}
        access={t('theo.section.staffing.access')}
      >
        {cockpitOpen ? (
          <StaffingScreen />
        ) : (
          <Locked text={t('theo.section.lockedStaffing')} to="/consultants" link={t('theo.section.staffing.open')} />
        )}
      </PilotageSection>
    ),
    finance: (
      <PilotageSection
        id="finance"
        title={t('theo.section.finance.title')}
        intro={t('theo.section.finance.intro')}
        access={t('theo.section.finance.access')}
      >
        {cockpitOpen ? <FinanceScreen /> : <Locked text={t('theo.section.lockedFinance')} />}
      </PilotageSection>
    ),
  }

  return (
    <CustomerPage titleInScreen pageTitle={t('theo.page.title')}>
      <div className="py-4">
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <div className="min-w-0 flex-1">
            <ScreenIntro
              title={t('theo.page.title')}
              titleWithoutName={t('theo.page.title')}
              subtitle={t('theo.page.subtitle')}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {/* Théo D pilotage.N6 — la période affichée (le mois en cours) ; les mois passés se lisent dans les séries. */}
            <Text
              size="sm"
              aria-label={t('theo.period.label', { month })}
              className="rounded-full border border-[var(--bellum-border)] px-3 py-1 capitalize text-[var(--bellum-text-secondary)]"
            >
              {month}
            </Text>
            {/* Théo D pilotage — « Exporter la synthèse » recopie les chiffres du Cockpit, jamais un second calcul. */}
            {cockpitOpen ? <CockpitSynthesisExport /> : null}
          </div>
        </div>
        {/* #1322.6 / pilotage.A15 — l'accès contextuel au copilote : un LIEN qui pré-remplit la question. */}
        <AskLaura label={t('page.askLauraLabel')} question={t('page.askLauraQuestion')} />

        <PilotageAnchors sections={sections} />

        {sections.map(section => (
          <div key={section.id}>{content[section.id]}</div>
        ))}
      </div>
    </CustomerPage>
  )
}

/** « Cette section n'est pas ouverte à ton rôle » — et où retrouver ce qui reste à lui. */
function Locked({ text, to, link }: { text: string; to?: '/consultants'; link?: string }) {
  const { t } = useTranslation('pilotage')
  return (
    <div className="rounded-lg border border-[var(--bellum-border)] p-4">
      <Text element="p" size="sm" weight="semibold" className="text-[var(--bellum-text-primary)]">
        {t('theo.section.locked')}
      </Text>
      <Text element="p" size="sm" className="mt-1 text-[var(--bellum-text-secondary)]">
        {text}
      </Text>
      {to && link ? (
        <Link
          to={to}
          className="mt-1 inline-flex min-h-11 items-center text-sm text-[var(--bellum-text-accent)] underline"
        >
          {link}
        </Link>
      ) : null}
    </div>
  )
}

/** « Exporter la synthèse » du Cockpit de Théo, dans l'en-tête de la page : la MÊME lecture que la section (GA-26). */
function CockpitSynthesisExport() {
  return <CockpitExportButton figures={useCockpitFigures()} />
}
