import type { Account } from '@bellum/contracts'
import { MEMORY_CROSSING_GRAPH_IDS } from '@bellum/contracts'
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  SelectField,
  Text,
} from '@bellum/ui'
import { Check, ShieldCheck, UserPlus, Users } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useSession } from '@/lib/hooks/use-session'
import { useUserPermissions } from '@/lib/permissions'
import { businessUnitsApi } from '@/features/business-units/api'
import { useAssignAccountBusinessUnit } from '@/features/accounts/hooks/useAssignAccountBusinessUnit'
import { formatTimeAgo } from '@/lib/relative-time'
import { useTimeline } from '@/features/activities/hooks/useTimeline'
import { useWorkspaceMembers } from '@/features/chat/hooks/useWorkspaceMembers'
import { useAssignAccount } from '@/features/manager/hooks/useAssignAccount'
import { useRequestManagerValidation } from '@/features/accounts/hooks/useRequestManagerValidation'
import { useMemoryBridge } from '@/features/memoire-collective/hooks/useMemoryBridge'
import { useAccountTeam } from '@/features/team-guardrails/hooks'
import { colleagueName, crossingMonth, factSentence } from '@/features/memoire-collective/model/crossing-text'
import { colleagueContributors, spokenKind } from './collaboration'

/**
 * #2128 — LA COLLABORATION SUR LE DOSSIER : « ne pas doubler un collègue ».
 *
 * ⚠️ REFONTE V22 DATÉE du 24/10/2026 (#4507, contrat validé par Louis le 23/10) — le BANDEAU
 * (`.x-collab`, posé sous l'identité sur tous les onglets par la refonte Théo du 23/10) est retiré de la
 * page. Rien n'est perdu, chaque morceau change d'endroit :
 *  · les GESTES (Attribuer, Demander une validation, Ajouter un co-équipier) → le menu « … » de l'en-tête
 *    (`AccountCollaborationMenuItems`), mêmes mutations, mêmes portes serveur ;
 *  · le PORTEUR → la ligne d'identité de l'en-tête (avatar + prénom, lecture seule) ;
 *  · la BU, la dernière activité de l'équipe, les contributeurs → le panneau « Périmètre & données »
 *    (`AccountTeamFacts`) ;
 *  · les COLLISIONS (un collègue prospecte, une analyse tourne déjà) → sous l'identité, et SEULEMENT quand
 *    il y en a (`AccountCollaborationAlerts`) : une collision est un fait à voir avant d'agir, pas une donnée
 *    à aller chercher.
 *
 * Ce qui ne change pas, et c'est délibéré :
 *  · le PORTEUR vient du serveur (`AccountsService.resolveOwner`) ; l'ATTRIBUTION passe par
 *    `PATCH /accounts/:id/assign`, dont le serveur tient les droits (RBAC). L'écran propose et affiche le
 *    refus ; il ne décide rien ;
 *  · personne n'est COMPTÉ (ni « 12 touches », ni « le plus actif ») — voir `collaboration.ts` ;
 *  · rien n'est bloqué (#2128.20) : « Continuer malgré tout » replie l'annonce pour la visite.
 */

/** Les collisions du compte, sous l'identité — rien quand il n'y en a pas. */
export function AccountCollaborationAlerts({
  account,
  onOpenHistory,
}: {
  account: Account
  /** Ouvre la section Historique du MÊME dossier — « voir l'activité de X ». */
  onOpenHistory: () => void
}) {
  const { t } = useTranslation('accounts')
  const { t: tMemory, i18n: memoryI18n } = useTranslation('memoireCollective')
  const [dismissed, setDismissed] = useState(false)
  const { bridge } = useMemoryBridge(account.id)
  const crossings = bridge.data?.crossings ?? []
  // #2128.19 — un collègue a-t-il déjà une analyse EN COURS sur ce compte ? Transitoire : rien quand rien.
  const activeAnalysis = account.active_analysis_by_colleague ?? null

  if (dismissed || (crossings.length === 0 && !activeAnalysis)) return null

  return (
    <section
      aria-label={t('collaboration.regionLabel')}
      data-testid="account-collab-alerts"
      className="space-y-2 rounded-xl border border-[var(--warning-soft-border)] bg-[var(--warning-soft-bg)] px-4 py-3"
    >
      {activeAnalysis ? (
        <Text element="p" size="sm" className="text-[var(--warning-soft-text)]">
          {t('collaboration.activeAnalysisByColleague', {
            name: activeAnalysis.colleague.name,
            when: formatTimeAgo(activeAnalysis.started_at),
          })}
        </Text>
      ) : null}
      {crossings.map(crossing => (
        <div key={`${crossing.kind}-${crossing.observedAt}`} className="flex flex-wrap items-start gap-x-3 gap-y-1">
          <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-[var(--warning-soft-border)] px-2 py-0.5 text-xs font-semibold text-[var(--warning-soft-text)]">
            {MEMORY_CROSSING_GRAPH_IDS[crossing.kind]}
          </span>
          <div className="min-w-0 flex-1">
            {/* Une collision NOMME toujours sa raison (#2128.20) : titre, fait daté, action suggérée. */}
            <Text element="p" size="sm" weight="medium" className="text-[var(--bellum-text-primary)]">
              {tMemory(`crossings.${crossing.kind}.title`)}
            </Text>
            <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
              {factSentence(crossing, tMemory, crossingMonth(crossing, memoryI18n.language))}
            </Text>
            <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
              {tMemory(`actions.${crossing.action}`)}
            </Text>
            {/* #2128.21 — l'activité de CE collègue sur CE compte : la section Historique du dossier. */}
            <button
              type="button"
              onClick={onOpenHistory}
              className="mt-1 min-h-6 text-sm text-[var(--bellum-text-accent)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
            >
              {t('collaboration.seeColleagueActivity', { name: colleagueName(crossing.colleague, tMemory) })}
            </button>
          </div>
        </div>
      ))}
      {crossings.length > 0 ? (
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="min-h-6 text-sm text-[var(--bellum-text-muted)] underline-offset-2 hover:underline pointer-coarse:min-h-11"
        >
          {t('collaboration.continueAnyway')}
        </button>
      ) : null}
    </section>
  )
}

/**
 * Ce que l'équipe a fait du compte, pour « Périmètre & données » : la BU, la dernière activité d'un
 * COLLÈGUE, les noms de ceux qui y ont travaillé. Le porteur n'est pas répété ici : l'identité le porte
 * (GA-26). Chaque fait absent est omis ; rien du tout → `null`.
 */
export function AccountTeamFacts({ account }: { account: Account }) {
  const { t } = useTranslation('accounts')
  const { t: tActivities } = useTranslation('activities')
  const { user } = useSession()
  // MÊME clé de requête que l'onglet Historique : aucun appel réseau de plus.
  const timeline = useTimeline('account', account.id)
  const contributors = useMemo(
    () => colleagueContributors(timeline.data?.items ?? [], user?.id),
    [timeline.data?.items, user?.id],
  )
  const lastTouch = contributors[0] ?? null
  const businessUnit = account.business_unit ?? null
  // #2128 — le sélecteur de BU : MÊME droit que l'API (`records:write`). Droit inconnu / en erreur / lecture seule :
  // jamais rendu (fail-closed), la BU éventuelle se lit seulement.
  const access = useUserPermissions()
  const canEditBusinessUnit = access.status === 'known' && access.permissions.includes('records:write')

  if (!businessUnit && !lastTouch && !canEditBusinessUnit) return null

  const lastTouchText = lastTouch
    ? spokenKind(lastTouch.lastKind)
      ? t('collaboration.lastTeamTouchWhat', {
          name: lastTouch.name,
          what: tActivities(`kinds.${spokenKind(lastTouch.lastKind)}`).toLowerCase(),
          when: formatTimeAgo(lastTouch.lastTouchedAt),
        })
      : t('collaboration.lastTeamTouch', { name: lastTouch.name, when: formatTimeAgo(lastTouch.lastTouchedAt) })
    : null

  return (
    <div data-testid="account-team-facts" className="space-y-1">
      {canEditBusinessUnit ? (
        <AccountBusinessUnitPicker accountId={account.id} currentId={businessUnit?.id ?? null} />
      ) : businessUnit ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          <span className="whitespace-nowrap">{t('collaboration.businessUnitLabel')}</span> {businessUnit.name}
        </Text>
      ) : null}
      {lastTouchText ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-secondary)]">
          {lastTouchText}
        </Text>
      ) : null}
      {/* Des NOMS et rien d'autre : l'ordre est celui de la récence, jamais un classement entre pairs. */}
      {contributors.length > 1 ? (
        <Text element="p" size="sm" className="text-[var(--bellum-text-muted)]">
          {t('collaboration.contributors', { names: contributors.map(c => c.name).join(' · ') })}
        </Text>
      ) : null}
    </div>
  )
}

/**
 * #2128 — « BU : [ Choisir ▾ ] » sur la fiche compte. Écrit `business_unit_id` par l'endpoint de mise à jour
 * existant ; « Aucune BU » détache. Sans aucune BU dans l'espace, rien n'est rendu (pas de liste vide à choisir).
 */
function AccountBusinessUnitPicker({ accountId, currentId }: { accountId: string; currentId: string | null }) {
  const { t } = useTranslation('accounts')
  const list = useQuery({ queryKey: ['business-units'], queryFn: () => businessUnitsApi.list(), staleTime: 60_000 })
  const assign = useAssignAccountBusinessUnit(accountId)
  const units = list.data?.businessUnits ?? []
  if (units.length === 0) return null
  return (
    <div data-testid="account-business-unit-picker" className="flex items-center gap-2">
      <label
        htmlFor={`account-bu-${accountId}`}
        className="whitespace-nowrap text-sm text-[var(--bellum-text-secondary)]"
      >
        {t('collaboration.businessUnitLabel')}
      </label>
      <SelectField
        id={`account-bu-${accountId}`}
        value={currentId ?? ''}
        onChange={next => assign.mutate(next === '' ? null : next)}
        emptyOption={{ label: t('collaboration.businessUnitNone') }}
        options={units.map(unit => ({ value: unit.id, label: unit.name }))}
        disabled={assign.isPending}
      />
    </div>
  )
}

/**
 * #4507 — les trois gestes d'équipe, dans le menu « … » de l'en-tête. Rendus DANS un `DropdownMenuContent`.
 *
 * Les portes sont celles d'avant, à l'identique :
 *  · « Attribuer » est toujours proposé — le serveur accepte ou refuse (un commercial ne prend pas le
 *    compte d'un collègue), jamais un `if` écrit ici ;
 *  · « Demander une validation » est toujours proposé — le serveur pose la tâche sur les habilités ;
 *  · l'équipe du compte est lisible par TOUT membre (« Voir l'équipe du compte ») ; « Ajouter un co-équipier »
 *    (et le retrait, dans la fenêtre) n'est proposé QUE quand l'API dit `can_edit` (le responsable ou
 *    `team:manage`), comme le sélecteur de l'ancienne carte « Équipe du compte ».
 */
export function AccountCollaborationMenuItems({
  account,
  onOpenTeam,
}: {
  account: Account
  /** Ouvre la fenêtre « Équipe du compte » (le même sélecteur que l'ancienne carte). */
  onOpenTeam: () => void
}) {
  const { t } = useTranslation('accounts')
  const { user } = useSession()
  const members = useWorkspaceMembers().data ?? []
  const assign = useAssignAccount()
  const requestValidation = useRequestManagerValidation(account.id)
  const team = useAccountTeam(account.id)
  const owner = account.owner ?? null

  return (
    <>
      <DropdownMenuLabel>{t('header.menu.groupTeam')}</DropdownMenuLabel>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger className="gap-1.5" aria-label={t('collaboration.assign.trigger')}>
          <UserPlus className="size-4" />
          {t('header.menu.assign')}
        </DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="max-h-72 w-60 overflow-y-auto">
          <DropdownMenuLabel>{t('collaboration.assign.menuLabel')}</DropdownMenuLabel>
          {members.length === 0 ? (
            <DropdownMenuItem disabled>{t('collaboration.assign.noMembers')}</DropdownMenuItem>
          ) : (
            members.map(member => (
              <DropdownMenuItem
                key={member.userId}
                onSelect={() => assign.mutate({ accountId: account.id, assignedTo: member.userId })}
              >
                {member.fullName ?? member.email ?? t('collaboration.assign.memberFallback')}
                {member.userId === user?.id && (
                  <span className="ml-1 text-[var(--bellum-text-muted)]">{t('collaboration.assign.selfSuffix')}</span>
                )}
                {owner?.user_id === member.userId && (
                  <Check className="ml-auto size-4 text-[var(--success-soft-text)]" />
                )}
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          {/* Libérer est distinct d'attribuer, et le serveur le tient distinctement. */}
          <DropdownMenuItem onSelect={() => assign.mutate({ accountId: account.id, assignedTo: null })}>
            {t('collaboration.assign.release')}
          </DropdownMenuItem>
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      {/* #2128.13 (épopée #2788) — pose une tâche sur chaque membre habilité (`team:manage`). */}
      <DropdownMenuItem
        className="gap-1.5"
        disabled={requestValidation.isPending}
        onSelect={() => requestValidation.mutate(undefined)}
      >
        <ShieldCheck className="size-4" />
        {t('collaboration.requestValidation.trigger')}
      </DropdownMenuItem>
      {/* #4507 — la LISTE des co-équipiers se lit par tout membre de l'espace (l'API la sert à tous) : l'entrée
          est toujours là. Seuls l'ajout et le retrait — dans la fenêtre — restent réservés à `can_edit`, et le
          nom de l'entrée dit lequel des deux gestes elle ouvre. */}
      <DropdownMenuItem className="gap-1.5" onSelect={onOpenTeam}>
        <Users className="size-4" />
        {team.data?.can_edit ? t('header.menu.addTeammate') : t('header.menu.viewTeam')}
      </DropdownMenuItem>
    </>
  )
}
