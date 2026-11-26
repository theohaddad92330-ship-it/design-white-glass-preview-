import { Badge, Button, Card, EmptyState, Text, cn } from '@bellum/ui'
import { Building2, Network, Route, Sparkles, Target, UserRoundSearch, Users } from 'lucide-react'
import { type ReactNode } from 'react'
import { useTranslation } from 'react-i18next'
import { useEnrichOrganigram } from '@/features/accounts/hooks/useEnrichAccount'
import { useElapsedWhilePending } from '@/features/accounts/hooks/useElapsedWhilePending'
import { useCreditGate } from '@/features/credits/hooks/useCreditGate'
import { contactSourceLabel } from '@/features/contacts/lib/contactProvenance'
import type {
  ApproachStep,
  BuyingCommittee,
  CommitteeMember,
  DecisionChain,
  OrgStructureData,
  OrgUnit,
  Stakeholder,
  StakeholderStance,
} from './orgStructureData'

/**
 * Renders the decision structure the analysis produces (`raw_analysis.org`).
 * It was computed on every run and displayed nowhere — the tab showed only the
 * inferred relation chart.
 */
export function OrgStructureSection({ data, accountId }: { data: OrgStructureData; accountId: string }) {
  const { t } = useTranslation('accountOrg')
  // Le geste que l'état vide NOMME : la même mutation que le bouton d'entête de
  // l'onglet, donc la même file react-query — pas un second chemin
  // d'enrichissement qui divergerait du premier.
  const enrichMutation = useEnrichOrganigram(accountId)
  // #3020 — `isLoading` (packages/ui `Button`) remplace les enfants par un
  // spinner nu pendant l'appel : c'est `loadingText` qui porte ce qui reste
  // lisible, le temps RÉELLEMENT écoulé plutôt qu'un pourcentage inventé.
  const enrichElapsed = useElapsedWhilePending(enrichMutation.isPending)
  // À zéro crédit, on grise AVANT le clic plutôt que de faire découvrir le refus
  // dans un toast d'erreur brut.
  const gate = useCreditGate()
  // ⚠️ Le planificateur d'enrichissement vivait ICI et n'était donc JAMAIS
  // atteignable : cette section rend un état vide et SORT (voir le `return`
  // ci-dessous) dès que la structure héritée est vide — c'est-à-dire sur tout
  // dossier qui porte un `orgGraph` moderne, exactement ceux qui en ont besoin.
  // Il vit maintenant dans l'entête de l'onglet (`TabOrganigramme`, D890).

  if (data.isEmpty) {
    return (
      <Card className="p-5">
        <EmptyState
          size="sm"
          icon={<Network />}
          title={t('structure.empty')}
          description={t('structure.emptyDescription')}
          action={
            <Button
              type="button"
              size="sm"
              variant="outline"
              icon={Sparkles}
              className="gap-2"
              onClick={() => enrichMutation.mutate()}
              // #2502.1 — même défaut recette du 17/09 (`ebcc78bc5`), un
              // TROISIÈME endroit : ce geste ne débite AUCUN crédit (même
              // mutation `useEnrichOrganigram` que l'entête et la carte
              // vide). Seul `locked` (essai terminé) est une vraie porte
              // fermée ici.
              disabled={enrichMutation.isPending || gate.locked}
              isLoading={enrichMutation.isPending}
              loadingText={t('organigramme.enrichingElapsed', { elapsed: enrichElapsed })}
              title={gate.locked ? t('organigramme.enrichLockedTitle') : undefined}
            >
              {t('structure.emptyCta')}
            </Button>
          }
        />
      </Card>
    )
  }

  return (
    <div className="space-y-4">
      {data.units.length > 0 ? (
        <Panel icon={<Building2 className="size-4" />} title={t('structure.title')} subtitle={t('structure.subtitle')}>
          <div className="divide-y divide-[var(--bellum-border)]">
            {data.units.map(unit => (
              <OrgUnitRow key={unit.entity} unit={unit} />
            ))}
          </div>
        </Panel>
      ) : null}

      {data.approachOrder.length > 0 ? (
        <Panel
          icon={<Route className="size-4" />}
          title={t('structure.approachTitle')}
          subtitle={t('structure.approachSubtitle')}
        >
          <ol className="divide-y divide-[var(--bellum-border)]">
            {data.approachOrder.map((step, index) => (
              <ApproachRow key={`${step.contact}-${index}`} step={step} fallbackIndex={index + 1} />
            ))}
          </ol>
        </Panel>
      ) : null}

      {data.decisionChain ? (
        <Panel
          icon={<Target className="size-4" />}
          title={t('structure.decisionTitle')}
          subtitle={t('structure.decisionSubtitle')}
        >
          <DecisionChainBody chain={data.decisionChain} />
        </Panel>
      ) : null}

      {data.stakeholders.length > 0 ? (
        <Panel
          icon={<UserRoundSearch className="size-4" />}
          title={t('structure.stakeholdersTitle')}
          subtitle={t('structure.stakeholdersSubtitle')}
        >
          <div className="divide-y divide-[var(--bellum-border)]">
            {data.stakeholders.map(stakeholder => (
              <StakeholderRow key={stakeholder.fullName} stakeholder={stakeholder} />
            ))}
          </div>
        </Panel>
      ) : null}

      {data.committee ? (
        <Panel
          icon={<Users className="size-4" />}
          title={t('structure.committeeTitle')}
          subtitle={t('structure.committeeSubtitle')}
        >
          <CommitteeBody committee={data.committee} />
        </Panel>
      ) : null}
    </div>
  )
}

function Panel({
  icon,
  title,
  subtitle,
  children,
}: {
  icon: ReactNode
  title: string
  subtitle: string
  children: ReactNode
}) {
  return (
    <Card className="overflow-hidden p-0 [--card-spacing:0px]">
      <div className="flex items-start gap-3 border-b border-[var(--bellum-border)] px-5 py-4">
        <span className="mt-0.5 shrink-0 text-[var(--bellum-text-accent)]">{icon}</span>
        <div className="min-w-0">
          <Text element="h3" size="sm" weight="semibold">
            {title}
          </Text>
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {subtitle}
          </Text>
        </div>
      </div>
      {children}
    </Card>
  )
}

function OrgUnitRow({ unit }: { unit: OrgUnit }) {
  const { t } = useTranslation('accountOrg')
  return (
    <div className="px-5 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Text size="sm" weight="semibold" className="min-w-0">
          {unit.entity}
        </Text>
        {unit.level ? (
          <Badge variant="outline" className="text-xs uppercase">
            {unit.level}
          </Badge>
        ) : null}
      </div>

      {unit.contacts.length > 0 ? (
        <div className="mt-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('structure.knownContacts')}
          </Text>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {unit.contacts.map(name => (
              <span
                key={name}
                className="rounded-md border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-2 py-0.5 text-xs text-[var(--bellum-text-secondary)]"
              >
                {name}
              </span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Rôles NON couverts par nos données — une information en soi (les zones
          à couvrir), jamais un trou qu'on comblerait par un nom inventé. */}
      {unit.missingRoles.length > 0 ? (
        <div className="mt-3">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('structure.missingRoles')}
          </Text>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {unit.missingRoles.map(role => (
              <span
                key={role}
                className="rounded-md border border-dashed border-[var(--bellum-border)] px-2 py-0.5 text-xs text-[var(--bellum-text-muted)]"
              >
                {role}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function ApproachRow({ step, fallbackIndex }: { step: ApproachStep; fallbackIndex: number }) {
  const { t } = useTranslation('accountOrg')
  return (
    <li className="flex gap-3 px-5 py-4">
      <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-[var(--bellum-surface-2)] text-xs font-semibold tabular-nums">
        {step.step ?? fallbackIndex}
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <Text size="sm" weight="semibold">
            {step.contact}
          </Text>
          {step.role ? (
            <Badge variant="outline" className="text-xs">
              {step.role}
            </Badge>
          ) : null}
        </div>
        {step.whyFirst ? (
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {step.whyFirst}
          </Text>
        ) : null}
        {step.expectedOutcome ? (
          <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {t('structure.expectedOutcome', { value: step.expectedOutcome })}
          </Text>
        ) : null}
        {step.unlocks ? (
          <Text size="xs" className="mt-1 text-[var(--bellum-text-muted)]">
            {t('structure.unlocks', { value: step.unlocks })}
          </Text>
        ) : null}
      </div>
    </li>
  )
}

function DecisionChainBody({ chain }: { chain: DecisionChain }) {
  const { t } = useTranslation('accountOrg')
  return (
    <div className="px-5 py-4">
      {chain.description ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {chain.description}
        </Text>
      ) : null}

      {chain.steps.length > 0 ? (
        <ol className="mt-3 space-y-2">
          {chain.steps.map((step, index) => (
            <li key={`${step.step}-${index}`} className="rounded-lg border border-[var(--bellum-border)] px-3 py-2">
              <Text size="xs" weight="semibold">
                {step.step}
              </Text>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                {step.actors.length > 0 ? (
                  <Text size="xs" className="text-[var(--bellum-text-secondary)]">
                    {step.actors.join(' · ')}
                  </Text>
                ) : null}
                {step.duration ? (
                  <Text size="xs" className="text-[var(--bellum-text-muted)]">
                    {step.duration}
                  </Text>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      ) : null}

      <div className="mt-3 flex flex-col gap-1.5">
        {chain.estimatedCycleLength ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('structure.cycleLength', { value: chain.estimatedCycleLength })}
          </Text>
        ) : null}
        {chain.budgetAuthority ? (
          <Text size="xs" className="text-[var(--bellum-text-secondary)]">
            {t('structure.budgetAuthority', { value: chain.budgetAuthority })}
          </Text>
        ) : null}
      </div>
    </div>
  )
}

const STANCE_CLASS: Record<StakeholderStance, string> = {
  advocate: 'border-emerald-500/40 bg-emerald-500/15 text-[var(--success-soft-text)]',
  neutral: 'border-slate-500/40 bg-slate-500/15 text-slate-700 dark:text-slate-300',
  opponent: 'border-red-500/40 bg-red-500/15 text-[var(--danger-soft-text)]',
  unknown: 'border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-[var(--bellum-text-muted)]',
}

/**
 * The buying committee (`raw_analysis.org.buyingCommittee`) — who sits at the
 * table, where each seat lands on the Power/Interest matrix, and which core seats
 * are still empty. Assembled deterministically from the classified contacts, so
 * every line here traces back to a real contact row; the missing seats are shown
 * as missing, never filled with a plausible name.
 */
function CommitteeBody({ committee }: { committee: BuyingCommittee }) {
  const { t } = useTranslation('accountOrg')
  return (
    <div className="px-5 py-4">
      {committee.summary ? (
        <Text size="sm" className="text-[var(--bellum-text-secondary)]">
          {committee.summary}
        </Text>
      ) : null}

      {committee.members.length > 0 ? (
        <div className="mt-3 divide-y divide-[var(--bellum-border)]">
          {committee.members.map((member, index) => (
            <CommitteeMemberRow key={`${member.fullName}-${index}`} member={member} />
          ))}
        </div>
      ) : null}

      {/* Sièges vacants du comité : une information en soi (qui reste à trouver). */}
      {committee.missingRoles.length > 0 ? (
        <div className="mt-4">
          <Text size="xs" weight="medium" className="text-[var(--bellum-text-muted)]">
            {t('structure.committeeMissing')}
          </Text>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {committee.missingRoles.map(role => (
              <span
                key={role}
                className="rounded-md border border-dashed border-[var(--bellum-border)] px-2 py-0.5 text-xs text-[var(--bellum-text-muted)]"
              >
                {t(`structure.committeeRole.${role}`, { defaultValue: role })}
              </span>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  )
}

function CommitteeMemberRow({ member }: { member: CommitteeMember }) {
  const { t } = useTranslation('accountOrg')
  const hasMatrix = member.power !== null && member.interest !== null
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="flex flex-wrap items-center gap-2">
        <Text size="sm" weight="semibold" className="min-w-0">
          {member.fullName || member.title}
        </Text>
        {member.roleLabel ? (
          <Badge variant="outline" className="text-xs">
            {member.roleLabel}
          </Badge>
        ) : null}
        {member.quadrant ? (
          <span className="rounded-full border border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] px-2 py-0.5 text-xs font-semibold uppercase text-[var(--bellum-text-secondary)]">
            {member.quadrant}
          </span>
        ) : null}
        {/* #2311.24 — le niveau de preuve du SIÈGE, jamais un chiffre : le
            libellé FR que le comité a déjà résolu, affiché tel quel, jamais
            re-dérivé (même règle que `roleLabel` juste au-dessus). */}
        {member.evidenceLevelLabel ? (
          <Badge variant="outline" className="text-xs text-[var(--bellum-text-muted)]">
            {member.evidenceLevelLabel}
          </Badge>
        ) : null}
      </div>
      {member.fullName && member.title ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {member.entity ? `${member.title} · ${member.entity}` : member.title}
        </Text>
      ) : null}
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
        {hasMatrix ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('structure.committeeMatrix', { power: member.power, interest: member.interest })}
          </Text>
        ) : null}
        {member.cadence ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('structure.committeeCadence', { value: member.cadence })}
          </Text>
        ) : null}
        {/* #3263.20 — la SOURCE du contact (déjà connue de `contact.source`),
            recroisée sur le siège. Toujours passée par `contactSourceLabel`
            (jamais le nom brut d'un fournisseur — doctrine, GA-44). */}
        {member.source ? (
          <Text size="xs" className="text-[var(--bellum-text-muted)]">
            {t('structure.committeeSource', { value: contactSourceLabel(member.source) })}
          </Text>
        ) : null}
      </div>
      {member.engagementAction ? (
        <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
          {member.engagementAction}
        </Text>
      ) : null}
    </div>
  )
}

function StakeholderRow({ stakeholder }: { stakeholder: Stakeholder }) {
  const { t } = useTranslation('accountOrg')
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-3">
      <div className="min-w-0 flex-1">
        <Text size="sm" weight="medium">
          {stakeholder.fullName}
        </Text>
        {stakeholder.reasoning ? (
          <Text size="xs" className="mt-1 text-[var(--bellum-text-secondary)]">
            {stakeholder.reasoning}
          </Text>
        ) : null}
      </div>
      {/* i18n keys: structure.stance.advocate | .neutral | .opponent | .unknown */}
      <span
        className={cn(
          'shrink-0 rounded-full border px-2 py-0.5 text-xs font-semibold',
          STANCE_CLASS[stakeholder.stance],
        )}
      >
        {t(`structure.stance.${stakeholder.stance}`)}
      </span>
    </div>
  )
}
