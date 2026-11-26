import {
  Avatar,
  AvatarFallback,
  Badge,
  Box,
  Button,
  Card,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  TabNav,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { motion } from 'framer-motion'
import {
  ArrowRight,
  ArrowRightLeft,
  CircleCheck,
  Crown,
  KeyRound,
  LifeBuoy,
  Mail,
  RotateCw,
  SlidersHorizontal,
  Trash2,
  UserPlus,
} from 'lucide-react'
import { memo, useState } from 'react'
import { Trans, useTranslation } from 'react-i18next'
import type { WorkspaceRole, WorkspaceTeamInvitation, WorkspaceTeamMember } from '@bellum/contracts'
import {
  assignableWorkspaceRoles,
  effectiveExtraPermissions,
  hasPermission,
  workspaceRoleLabels,
} from '@bellum/contracts'
import { useSession } from '@/lib/hooks/use-session'
import { SettingsBlock, SettingsPageHeader, SettingsStack } from '@/features/settings/components/SettingsBlocks'
import { SettingsTabs } from '@/features/settings/components/SettingsTabs'
import { useTeam } from '@/features/team/hooks/useTeam'
import { readPortfolioVisibility } from '@/features/team/portfolio-visibility'
import { MarketSelector } from '@/features/team/view/MarketSelector'
import { CommunitySharingCard } from '@/features/team/view/CommunitySharingCard'
import { JoinRequestsSection } from '@/features/team/view/JoinRequestsSection'
import { PersonalSpaceMergeCard, WorkspaceMergeRequestsSection } from '@/features/team/view/WorkspaceMerge'
import { MemberOffboardingDialog } from '@/features/team/view/MemberOffboardingDialog'
import { MemberPermissionsDialog } from '@/features/team/view/MemberPermissionsDialog'
import { PortfolioVisibilityCard } from '@/features/team/view/PortfolioVisibilityCard'
import { TeamPolicyCard } from '@/features/team/view/TeamPolicyCard'
import { WorkspaceSwitcher } from '@/features/team/view/WorkspaceSwitcher'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

/** Roles an owner/admin can assign, in seniority order for the selectors. */
type AssignableRole = Exclude<WorkspaceRole, 'owner'>

const ROLE_BADGE_VARIANT: Record<WorkspaceRole, 'default' | 'info' | 'secondary'> = {
  owner: 'default',
  admin: 'info',
  sales_ops: 'info',
  sales: 'secondary',
  tech_admin: 'info',
  member: 'secondary',
  viewer: 'secondary',
  recruiter: 'info',
  finance: 'info',
}

function RoleBadge({ role }: { role: WorkspaceRole }) {
  return (
    <Badge variant={ROLE_BADGE_VARIANT[role]} className="text-xs">
      {role === 'owner' && <Crown className="mr-1 size-3" />}
      {workspaceRoleLabels[role]}
    </Badge>
  )
}

/** The role `<SelectItem>`s shared by the invite form and the member row. */
function RoleOptions({ canGrantAdmin }: { canGrantAdmin: boolean }) {
  return (
    <>
      {/* #4158.1 — « Admin » n'est proposé qu'à qui peut l'attribuer (owner/admin) :
          le serveur répond 403 à un sales_ops, l'écran ne le laisse pas cliquer pour l'apprendre. */}
      {assignableWorkspaceRoles
        .filter(role => canGrantAdmin || role !== 'admin')
        .map(role => (
          <SelectItem key={role} value={role}>
            {workspaceRoleLabels[role]}
          </SelectItem>
        ))}
    </>
  )
}

function initials(member: WorkspaceTeamMember): string {
  const source = member.fullName?.trim() || member.email?.trim() || '?'
  return source
    .split(/\s+/)
    .slice(0, 2)
    .map(part => part.charAt(0).toUpperCase())
    .join('')
}

/* ------------------------------------------------------------------ */
/*  Invite form                                                        */
/* ------------------------------------------------------------------ */

function InviteForm({
  seatsFull,
  canGrantAdmin,
  onDone,
}: {
  seatsFull: boolean
  canGrantAdmin: boolean
  onDone?: () => void
}) {
  const { t } = useTranslation('team')
  const { invite } = useTeam()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AssignableRole>('member')

  const trimmed = email.trim()
  const valid = EMAIL_RE.test(trimmed)

  const submit = () => {
    if (!valid || seatsFull || invite.isPending) return
    invite.mutate(
      { email: trimmed, role },
      {
        onSuccess: () => {
          setEmail('')
          onDone?.()
        },
      },
    )
  }

  return (
    <Box className="flex flex-col gap-3">
      {seatsFull ? (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          <Trans
            t={t}
            i18nKey="invite.seatsFull"
            components={{
              upgradeLink: (
                <Link to="/billing" className="text-[var(--bellum-text-accent)] underline-offset-4 hover:underline" />
              ),
            }}
          />
        </Text>
      ) : (
        <Box display="flex" className="flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            type="email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') submit()
            }}
            placeholder={t('invite.emailPlaceholder')}
            aria-label={t('invite.emailPlaceholder')}
            className="min-h-11 flex-1 bg-[var(--bellum-surface-2)] text-sm"
            spellCheck={false}
            autoComplete="off"
          />
          <Select value={role} onValueChange={next => setRole(next as AssignableRole)}>
            <SelectTrigger className="min-h-11 w-full border-[var(--bellum-border)] bg-[var(--bellum-surface-2)] text-sm sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <RoleOptions canGrantAdmin={canGrantAdmin} />
            </SelectContent>
          </Select>
          <Button
            variant="default"
            className="min-h-11"
            icon={Mail}
            disabled={!valid}
            isLoading={invite.isPending}
            onClick={submit}
          >
            {t('invite.submit')}
          </Button>
        </Box>
      )}
    </Box>
  )
}

/* ------------------------------------------------------------------ */
/*  Member row                                                         */
/* ------------------------------------------------------------------ */

function MemberRow({
  member,
  canManage,
  canChangeRole,
  canGrantAdmin,
  isSelf,
  grantedBy,
}: {
  member: WorkspaceTeamMember
  canManage: boolean
  /** Propriétaire seul : les droits en propre et leur dialogue (serveur : `assertRole(['owner'])`). */
  canChangeRole: boolean
  /** #4158.1 — owner/admin : attribuent, retirent ou modifient un rôle administrateur. */
  canGrantAdmin: boolean
  isSelf: boolean
  /** Le nom de celui qui accorderait un droit — l'écran doit dire QUI accorde. */
  grantedBy: string
}) {
  const { t } = useTranslation('team')
  const { removeMember, updateMemberRole, setCrossTeamSupport } = useTeam()
  const [offboarding, setOffboarding] = useState(false)
  const [editingPermissions, setEditingPermissions] = useState(false)
  const [editingRole, setEditingRole] = useState(false)
  const { t: tc } = useTranslation('common')
  const isOwner = member.role === 'owner'
  // #4158.1 — un admin ne se retire ni ne se change que par un owner/admin.
  const canTouchThisMember = canManage && !isOwner && (canGrantAdmin || member.role !== 'admin')
  // Ce qu'il gagne VRAIMENT par rapport à son rôle : afficher les onze
  // permissions ne dirait rien, et compter les accords redondants ferait
  // annoncer un privilège là où il n'y en a pas.
  const extras = effectiveExtraPermissions(member.role, member.extraPermissions ?? [])
  const busy =
    (removeMember.isPending && removeMember.variables === member.userId) ||
    (updateMemberRole.isPending && updateMemberRole.variables?.userId === member.userId)

  return (
    <Box
      display="flex"
      className="flex-wrap items-center gap-3 border-b border-[var(--bellum-border)] px-5 py-4 last:border-b-0 sm:flex-nowrap"
    >
      <Avatar className="size-10 shrink-0 rounded-control">
        <AvatarFallback className="rounded-control bg-[var(--accent-soft-bg)] text-sm font-semibold text-[var(--accent-soft-text)]">
          {initials(member)}
        </AvatarFallback>
      </Avatar>
      <Box className="min-w-0 flex-1">
        <Box display="flex" className="items-center gap-2">
          <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]" className="truncate">
            {member.fullName ?? member.email ?? t('member.fallbackName')}
          </Text>
          {isSelf && (
            <Text size="xs" color="text-[var(--bellum-text-secondary)]">
              {t('member.you')}
            </Text>
          )}
        </Box>
        {member.email && (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="truncate">
            {member.email}
          </Text>
        )}
        {/* Ce qu'un siège a EN PLUS de son rôle, dit sur la ligne : sans ça, un
            droit accordé nominativement est invisible depuis l'écran Équipe, et
            le rôle affiché ment par omission. */}
        {member.crossTeamSupport === true && (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="truncate">
            {t('member.crossTeamSupport')}
          </Text>
        )}
        {extras.length > 0 && (
          <Text size="xs" color="text-[var(--warning-soft-text)]" className="truncate">
            {t('permissions.extraCount', { count: extras.length })}
          </Text>
        )}
      </Box>

      {/* Théo D team-admin — le rôle et l'accès se LISENT sur la ligne (chips teintés) ;
          les changer passe par « Rôle », qui ouvre la fenêtre du rôle (#dlg-role). */}
      <RoleBadge role={member.role} />
      <span className="hidden rounded-badge border border-[var(--success-soft-border)] bg-[var(--success-soft-bg)] px-2 py-0.5 text-xs text-[var(--success-soft-text)] sm:inline-flex">
        {t('member.active')}
      </span>

      {(canTouchThisMember || (canChangeRole && !isOwner)) && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          icon={SlidersHorizontal}
          disabled={busy}
          onClick={() => setEditingRole(true)}
          aria-label={t('member.roleAria', { name: member.fullName ?? member.email ?? t('member.fallbackTarget') })}
        >
          {t('member.role')}
        </Button>
      )}
      <Dialog open={editingRole} onOpenChange={setEditingRole}>
        <DialogContent closeLabel={tc('actions.close')}>
          <DialogHeader>
            <DialogTitle>
              {t('member.roleTitle', { name: member.fullName ?? member.email ?? t('member.fallbackTarget') })}
            </DialogTitle>
            <DialogDescription>{t('member.roleHint')}</DialogDescription>
          </DialogHeader>
          {canTouchThisMember ? (
            <label className="grid gap-1.5 text-sm text-[var(--bellum-text-secondary)]">
              {t('member.role')}
              <Select
                value={member.role}
                disabled={busy}
                onValueChange={next => updateMemberRole.mutate({ userId: member.userId, role: next as AssignableRole })}
              >
                <SelectTrigger aria-label={t('member.role')} className="min-h-11">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <RoleOptions canGrantAdmin={canGrantAdmin} />
                </SelectContent>
              </Select>
            </label>
          ) : null}
          {/* « Renfort transversal » (#3387.10) : un drapeau d'orientation, pas un droit —
              `team:manage` suffit, comme pour inviter ou retirer. */}
          {canTouchThisMember && (
            <Button
              type="button"
              variant={member.crossTeamSupport === true ? 'soft' : 'outline'}
              icon={LifeBuoy}
              disabled={busy}
              aria-pressed={member.crossTeamSupport === true}
              title={t('member.crossTeamSupportHelp')}
              onClick={() =>
                setCrossTeamSupport.mutate({ userId: member.userId, enabled: member.crossTeamSupport !== true })
              }
              aria-label={t(
                member.crossTeamSupport === true ? 'member.crossTeamSupportOnAria' : 'member.crossTeamSupportOffAria',
                {
                  name: member.fullName ?? member.email ?? t('member.fallbackTarget'),
                },
              )}
            >
              {t('member.crossTeamSupportHelp')}
            </Button>
          )}
          {/* Les droits en propre sont RÉSERVÉS AU PROPRIÉTAIRE, exactement comme le
              changement de rôle (`assertRole(['owner'])` côté serveur) : accorder
              une exception nominative déplace un privilège sans changer le rôle
              affiché. Le miroir évite de laisser cliquer pour apprendre un 403. */}
          {canChangeRole && !isOwner && (
            <Button
              type="button"
              variant="outline"
              icon={KeyRound}
              disabled={busy}
              onClick={() => setEditingPermissions(true)}
              aria-label={t('permissions.openAria', {
                name: member.fullName ?? member.email ?? t('member.fallbackTarget'),
              })}
            >
              {t('member.ownRights')}
            </Button>
          )}
          <Text size="sm" className="rounded-card bg-[var(--bellum-surface-2)] p-3 text-[var(--bellum-text-secondary)]">
            {t('member.roleBounded')}
          </Text>
        </DialogContent>
      </Dialog>
      {/* Monté seulement à l'ouverture : onze permissions × chaque ligne
          de l'équipe, c'est un écran de droits entier rendu pour rien à
          chaque affichage de la liste. */}
      {editingPermissions && (
        <MemberPermissionsDialog member={member} grantedBy={grantedBy} open onOpenChange={setEditingPermissions} />
      )}

      {canTouchThisMember && !isSelf && (
        <>
          {/* Le départ d'un membre passe par une PRÉVISUALISATION, jamais par un
              clic direct : ce bouton retirait le siège au premier clic, sans
              montrer les quarante comptes que la personne portait (tome 8 §33,
              angle mort n°2). */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={ArrowRightLeft}
            disabled={busy}
            onClick={() => setOffboarding(true)}
            aria-label={t('member.removeAria', { name: member.email ?? member.fullName ?? t('member.fallbackTarget') })}
          >
            {t('member.handover')}
          </Button>
          <MemberOffboardingDialog
            member={member}
            open={offboarding}
            onOpenChange={setOffboarding}
            removing={removeMember.isPending && removeMember.variables === member.userId}
            onRemove={() =>
              removeMember.mutate(member.userId, {
                onSuccess: () => setOffboarding(false),
              })
            }
          />
        </>
      )}
    </Box>
  )
}

/* ------------------------------------------------------------------ */
/*  Pending invitation row                                             */
/* ------------------------------------------------------------------ */

function InvitationRow({
  invitation,
  canManage,
  canGrantAdmin,
}: {
  invitation: WorkspaceTeamInvitation
  canManage: boolean
  canGrantAdmin: boolean
}) {
  const { t, i18n } = useTranslation('team')
  const { revokeInvitation, resendInvitation } = useTeam()
  // #4158.1 — les mêmes règles que l'invitation : une invitation admin ne se renvoie ni ne se révoque que par owner/admin.
  const canAct = canManage && (canGrantAdmin || invitation.role !== 'admin')
  // #4158.2 — l'issue du dernier renvoi de CETTE ligne, dite à l'écran (parti / non parti).
  const resent = resendInvitation.data?.invitation.id === invitation.id ? resendInvitation.data : null
  return (
    <Box
      display="flex"
      className="flex-wrap items-center gap-3 border-b border-[var(--bellum-border)] py-3 first:pt-0 last:border-b-0 last:pb-0"
    >
      <Box
        rounded="lg"
        display="flex"
        className="size-9 shrink-0 items-center justify-center bg-[var(--bellum-surface-2)]"
      >
        <Mail className="size-4 text-[var(--bellum-text-secondary)]" />
      </Box>
      <Box className="min-w-0 flex-1">
        <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]" className="truncate">
          {invitation.email}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {t('invitations.pendingExpires', {
            date: new Date(invitation.expiresAt).toLocaleDateString(i18n.language === 'fr' ? 'fr-FR' : 'en-GB'),
          })}
        </Text>
        {resent && (
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" role="status">
            {resent.emailSent ? t('invitations.resendSent') : t('invitations.resendNotSent')}
          </Text>
        )}
      </Box>
      <RoleBadge role={invitation.role} />
      {canAct && (
        <Button
          variant="ghost"
          size="sm"
          icon={RotateCw}
          isLoading={resendInvitation.isPending && resendInvitation.variables === invitation.id}
          onClick={() => resendInvitation.mutate(invitation.id)}
          aria-label={t('invitations.resendAria', { email: invitation.email })}
        >
          {t('invitations.resend')}
        </Button>
      )}
      {canAct && (
        <Button
          variant="ghost"
          size="sm"
          icon={Trash2}
          isLoading={revokeInvitation.isPending && revokeInvitation.variables === invitation.id}
          onClick={() => revokeInvitation.mutate(invitation.id)}
          aria-label={t('invitations.revokeAria', { email: invitation.email })}
        />
      )}
    </Box>
  )
}

/* ------------------------------------------------------------------ */
/*  Screen                                                             */
/* ------------------------------------------------------------------ */

const ADMIN_TABS = ['members', 'rights', 'rules'] as const
type AdminTab = (typeof ADMIN_TABS)[number]

export const TeamView = memo(function TeamView() {
  const { t } = useTranslation('team')
  const { t: tc } = useTranslation('common')
  const [tab, setTab] = useState<AdminTab>('members')
  const [inviting, setInviting] = useState(false)
  const { user } = useSession()
  const { team, isLoading, isError } = useTeam()

  const role = team?.workspace.role ?? 'member'
  // Server is the source of truth (WorkspacePermissionGuard); the UI just mirrors
  // the same matrix so a viewer/sales never sees actions they'd be 403'd on.
  const canManage = hasPermission(role, 'team:manage')
  // Les droits en propre restent réservés au propriétaire (serveur : `assertRole(['owner'])`).
  const canChangeRole = role === 'owner'
  // #4158.1 — seuls owner/admin attribuent, retirent ou modifient un rôle administrateur ;
  // sales_ops (`team:manage`) gère les rôles non admin.
  const canGrantAdmin = role === 'owner' || role === 'admin'
  // Market changes stay owner/admin server-side (PATCH /workspaces/market) — the
  // selector mirrors that exact gate rather than the broader team:manage.
  const canManageMarket = role === 'owner' || role === 'admin'
  const seatsFull = team ? team.seats.used >= team.seats.total : false
  // QUI accorde. Le journal enregistre l'auteur de toute façon ; l'écrire à
  // l'écran est ce qui rend le geste conscient au moment où on le fait.
  const grantedBy = team?.members.find(member => member.userId === user?.id)?.fullName ?? user?.email ?? ''

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: 'easeOut' as const }}
      className="w-full space-y-6"
    >
      <Box display="flex" className="items-start justify-between gap-4">
        <Box>
          {/* Théo D team-admin — « Un espace bien administré. » : le titre à point d'accent et sa phrase. */}
          <h1 className="text-4xl font-bold tracking-tight text-[var(--bellum-text-primary)] md:text-5xl">
            {t('header.theoTitle')}
            <span className="text-[var(--bellum-text-accent)]">.</span>
          </h1>
          <Text size="base" color="text-[var(--bellum-text-secondary)]" className="mt-2">
            {t('header.theoTagline')}
          </Text>
          <Text size="sm" color="text-[var(--bellum-text-secondary)]" className="mt-1">
            {t('header.subtitle', { name: team?.workspace.name ?? t('header.workspaceFallback') })}
          </Text>
          {/* #3386 — le rôle métier et la taille de l'ESN pilotent les recommandations mais se règlent
              dans le profil (GA-26 : un réglage, un endroit) : l'écran Équipe le DIT au lieu de le dupliquer. */}
          <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-1">
            <Trans
              t={t}
              i18nKey="header.roleAndStageHint"
              components={{
                profileLink: (
                  <Link
                    to="/settings/profile"
                    className="text-[var(--bellum-text-accent)] underline-offset-4 hover:underline"
                  />
                ),
              }}
            />
          </Text>
        </Box>
        {team && (
          <Badge variant={seatsFull ? 'warning' : 'secondary'} className="shrink-0 text-xs">
            {/* #4669.1 — jamais « 2 / 1 » : au-delà du forfait, l'écart se nomme. */}
            {team.seats.used > team.seats.total
              ? t('header.seatsOver', { count: team.seats.used - team.seats.total })
              : t('header.seats', { used: team.seats.used, total: team.seats.total })}
          </Badge>
        )}
      </Box>

      {isError && (
        <Card className="p-4">
          <Text size="sm" color="text-[var(--danger-soft-text)]">
            {t('errors.load')}
          </Text>
        </Card>
      )}

      {isLoading && !team && (
        <Card className="p-4">
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('states.loading')}
          </Text>
        </Card>
      )}

      {team && (
        <div className="space-y-6">
          {/* Second niveau d'onglets : des pastilles (GA-127), la forme qui filtre
              ce qu'on regarde plutôt que celle qui change d'écran. */}
          <nav aria-label={t('tabs.label')}>
            <TabNav
              variant="pill"
              activeTab={tab}
              onTabChange={key => setTab(key as AdminTab)}
              tabs={ADMIN_TABS.map(entry => ({ key: entry, label: t(`tabs.${entry}`) }))}
            />
          </nav>

          {tab === 'members' && (
            <div className="space-y-6">
              {/* Renders itself only when the user belongs to several workspaces —
                the case an invitation to an existing account creates. */}
              <WorkspaceSwitcher />
              {/* #4158.57 — rapatrier l'espace personnel dans cet espace : n'apparaît que si l'utilisateur
                en a un à côté de l'espace actif (aperçu, validation, suivi du job). */}
              <PersonalSpaceMergeCard />
              {/* #2016 — les demandes d'accès d'un nouveau venu du même domaine :
                la même permission que l'invitation, qui va dans l'autre sens. */}
              {canManage && <JoinRequestsSection />}
              {/* #4158.57 — un membre demande à rapatrier son espace personnel ici : l'admin tranche
                (le serveur exige owner/admin de CET espace, au-delà de team:manage). */}
              {canGrantAdmin && <WorkspaceMergeRequestsSection />}
              {/* Théo D `.t8-panel` — l'en-tête du panneau porte le titre, le compte des
                  places et « Inviter un membre » ; les lignes suivent dans le même cadre. */}
              <section
                aria-labelledby="team-people"
                className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card"
              >
                <Box
                  display="flex"
                  className="flex-wrap items-center justify-between gap-3 border-b border-[var(--bellum-border)] px-5 py-4"
                >
                  <Box>
                    <Text
                      element="h2"
                      id="team-people"
                      size="xl"
                      weight="semibold"
                      color="text-[var(--bellum-text-primary)]"
                    >
                      {t('sections.people')}
                    </Text>
                    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                      {t('sections.peopleSummary', { count: team.members.length, seats: team.seats.total })}
                    </Text>
                  </Box>
                  {canManage && (
                    <Button variant="default" icon={UserPlus} onClick={() => setInviting(true)}>
                      {t('invite.open')}
                    </Button>
                  )}
                </Box>
                <div>
                  {team.members.map(member => (
                    <MemberRow
                      key={member.userId}
                      member={member}
                      canManage={canManage}
                      canChangeRole={canChangeRole}
                      canGrantAdmin={canGrantAdmin}
                      isSelf={member.userId === user?.id}
                      grantedBy={grantedBy}
                    />
                  ))}
                </div>
              </section>
              <section
                aria-labelledby="team-invitations"
                className="overflow-hidden rounded-card border border-[var(--bellum-border)] bg-card"
              >
                <Text
                  element="h2"
                  id="team-invitations"
                  size="xl"
                  weight="semibold"
                  color="text-[var(--bellum-text-primary)]"
                  className="px-5 pt-4"
                >
                  {t('sections.pendingTitle')}
                </Text>
                {team.invitations.length > 0 ? (
                  <div className="px-5 pb-1">
                    {team.invitations.map(invitation => (
                      <InvitationRow
                        key={invitation.id}
                        invitation={invitation}
                        canManage={canManage}
                        canGrantAdmin={canGrantAdmin}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-2 px-5 py-10 text-center">
                    <CircleCheck aria-hidden="true" className="size-6 text-[var(--bellum-text-muted)]" />
                    <Text size="base" weight="semibold" color="text-[var(--bellum-text-primary)]">
                      {t('invitations.emptyTitle')}
                    </Text>
                    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                      {t('invitations.emptyHint')}
                    </Text>
                  </div>
                )}
              </section>
              {canManage && (
                <Dialog open={inviting} onOpenChange={setInviting}>
                  <DialogContent closeLabel={tc('actions.close')}>
                    <DialogHeader>
                      <DialogTitle>{t('invite.title')}</DialogTitle>
                      <DialogDescription>{t('invite.description')}</DialogDescription>
                    </DialogHeader>
                    <InviteForm seatsFull={seatsFull} canGrantAdmin={canGrantAdmin} onDone={() => setInviting(false)} />
                  </DialogContent>
                </Dialog>
              )}
              {!canManage && (
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {role === 'viewer' ? t('readOnly.viewer') : t('readOnly.other')}
                </Text>
              )}
            </div>
          )}

          {tab === 'rights' && (
            <div className="space-y-6">
              <Box>
                <Text element="h2" size="xl" weight="semibold" color="text-[var(--bellum-text-primary)]">
                  {t('sections.rights')}
                </Text>
                <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                  {t('sections.rightsHint')}
                </Text>
              </Box>
              {/* Qui voit quels comptes (décision D5). Il vient AVANT le partage
                communautaire parce qu'il décide de ce qui circule DEDANS, quand
                l'autre décide de ce qui SORT — et les deux sont réservés au
                propriétaire pour la même raison : ils changent d'un coup ce que
                toute l'équipe voit. */}
              <PortfolioVisibilityCard
                visibility={readPortfolioVisibility(team.workspace)}
                canManage={team.workspace.role === 'owner'}
              />
              {/* Le partage communautaire (tome 2 §5.3) : décoché par défaut,
                propriétaire uniquement, et le texte dit les DEUX moitiés du
                marché — ce qui remonte, et ce qu'on reçoit en échange. */}
              <CommunitySharingCard
                sharing={team.workspace.communityDataSharing}
                canManage={team.workspace.role === 'owner'}
              />
            </div>
          )}

          {tab === 'rules' && (
            <div className="space-y-6">
              <Box>
                <Text element="h2" size="xl" weight="semibold" color="text-[var(--bellum-text-primary)]">
                  {t('sections.rules')}
                </Text>
                <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                  {t('sections.rulesHint')}
                </Text>
              </Box>
              <div className="grid gap-6 lg:grid-cols-[2fr_1fr]">
                <div className="space-y-6">
                  <MarketSelector canManage={canManageMarket} />
                  {/* #2770.37 — la politique d'équipe que Laura applique aux journées de chacun :
                    lue par tous, saisie sous `team:manage` (même gate que le serveur). */}
                  <TeamPolicyCard canManage={canManage} />
                </div>
                {/* Théo D `.t8-policy-aside` — « Un seul moteur d'action » : les règles donnent
                    le cadre, les actions et les automatisations font le reste. */}
                <aside className="h-fit space-y-3 rounded-card border border-[var(--bellum-accent-line)] bg-[var(--bellum-accent-bg)] p-5">
                  <Text
                    size="xs"
                    weight="semibold"
                    className="uppercase tracking-widest text-[var(--bellum-text-muted)]"
                  >
                    {t('rulesAside.eyebrow')}
                  </Text>
                  <Text element="h3" size="xl" weight="semibold" color="text-[var(--bellum-text-primary)]">
                    {t('rulesAside.title')}
                    <br />
                    <span className="text-[var(--bellum-text-accent)]">{t('rulesAside.titleAccent')}</span>
                  </Text>
                  <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                    {t('rulesAside.body')}
                  </Text>
                  <Button asChild variant="soft" icon={ArrowRight}>
                    <Link to="/actions/automatisations">{t('rulesAside.cta')}</Link>
                  </Button>
                </aside>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  )
})
