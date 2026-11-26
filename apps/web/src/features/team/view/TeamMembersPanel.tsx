import {
  Avatar,
  AvatarFallback,
  Badge,
  Box,
  Button,
  Card,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Text,
} from '@bellum/ui'
import { Link } from '@tanstack/react-router'
import { Crown, KeyRound, LifeBuoy, Mail, RotateCw, Trash2, UserPlus } from 'lucide-react'
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
import { useTeam } from '@/features/team/hooks/useTeam'
import { JoinRequestsSection } from '@/features/team/view/JoinRequestsSection'
import { WorkspaceMergeRequestsSection } from '@/features/team/view/WorkspaceMerge'
import { MemberOffboardingDialog } from '@/features/team/view/MemberOffboardingDialog'
import { MemberPermissionsDialog } from '@/features/team/view/MemberPermissionsDialog'

// Théo D team-admin.R1 / R2 / R4 — la gestion des membres (invitations, rôles, droits en propre, départ),
// sortie de `TeamView` pour servir « Équipe › Administration ». Le code est celui de `TeamView`, déplacé tel quel.

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

function InviteForm({ seatsFull, canGrantAdmin }: { seatsFull: boolean; canGrantAdmin: boolean }) {
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
        onSuccess: () => setEmail(''),
      },
    )
  }

  return (
    <Card className="space-y-3 p-4">
      <Box display="flex" className="items-center gap-2">
        <UserPlus className="size-4 text-[var(--bellum-text-secondary)]" />
        <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {t('invite.title')}
        </Text>
      </Box>

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
            className="flex-1 bg-card text-sm"
            spellCheck={false}
            autoComplete="off"
          />
          <Select value={role} onValueChange={next => setRole(next as AssignableRole)}>
            <SelectTrigger className="h-9 w-full border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-sm sm:w-40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <RoleOptions canGrantAdmin={canGrantAdmin} />
            </SelectContent>
          </Select>
          <Button
            variant="default"
            size="sm"
            icon={Mail}
            disabled={!valid}
            isLoading={invite.isPending}
            onClick={submit}
          >
            {t('invite.submit')}
          </Button>
        </Box>
      )}
    </Card>
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
    <Box display="flex" className="items-center gap-3 border-b border-[var(--bellum-border)] py-3 last:border-b-0">
      <Avatar className="size-9 shrink-0">
        <AvatarFallback className="bg-[var(--bellum-surface-2)] text-xs">{initials(member)}</AvatarFallback>
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

      {canTouchThisMember ? (
        <Select
          value={member.role}
          disabled={busy}
          onValueChange={next => updateMemberRole.mutate({ userId: member.userId, role: next as AssignableRole })}
        >
          <SelectTrigger className="h-8 w-36 border-[var(--bellum-border)] bg-[var(--bellum-bg-lighter)] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <RoleOptions canGrantAdmin={canGrantAdmin} />
          </SelectContent>
        </Select>
      ) : (
        <RoleBadge role={member.role} />
      )}

      {/* « Renfort transversal » (#3387.10) : un drapeau d'orientation, pas un droit —
          `team:manage` suffit, comme pour inviter ou retirer. */}
      {canTouchThisMember && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
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
        />
      )}

      {/* Les droits en propre sont RÉSERVÉS AU PROPRIÉTAIRE, exactement comme le
          changement de rôle (`assertRole(['owner'])` côté serveur) : accorder
          une exception nominative déplace un privilège sans changer le rôle
          affiché. Le miroir évite de laisser cliquer pour apprendre un 403. */}
      {canChangeRole && !isOwner && (
        <>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            icon={KeyRound}
            disabled={busy}
            onClick={() => setEditingPermissions(true)}
            aria-label={t('permissions.openAria', {
              name: member.fullName ?? member.email ?? t('member.fallbackTarget'),
            })}
          />
          {/* Monté seulement à l'ouverture : onze permissions × chaque ligne
              de l'équipe, c'est un écran de droits entier rendu pour rien à
              chaque affichage de la liste. */}
          {editingPermissions && (
            <MemberPermissionsDialog member={member} grantedBy={grantedBy} open onOpenChange={setEditingPermissions} />
          )}
        </>
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
            icon={Trash2}
            disabled={busy}
            onClick={() => setOffboarding(true)}
            aria-label={t('member.removeAria', { name: member.email ?? member.fullName ?? t('member.fallbackTarget') })}
          />
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
    <Box display="flex" className="items-center gap-3 border-b border-[var(--bellum-border)] py-3 last:border-b-0">
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
/*  Panel                                                              */
/* ------------------------------------------------------------------ */

/**
 * Tout ce qui GÈRE les personnes de l'espace : invitation, demandes d'accès, rapatriement d'un espace
 * personnel, liste des membres et invitations en attente. Monté par `TeamAdminView` (onglet « Membres &
 * invitations ») et, dans un espace d'une seule personne qui n'a pas d'écran Équipe, par `TeamView`.
 */
export const TeamMembersPanel = memo(function TeamMembersPanel() {
  const { t } = useTranslation('team')
  const { user } = useSession()
  const { team } = useTeam()
  if (!team) return null

  const role = team.workspace.role
  const canManage = hasPermission(role, 'team:manage')
  // Les droits en propre restent réservés au propriétaire (serveur : `assertRole(['owner'])`).
  const canChangeRole = role === 'owner'
  // #4158.1 — seuls owner/admin attribuent, retirent ou modifient un rôle administrateur.
  const canGrantAdmin = role === 'owner' || role === 'admin'
  const seatsFull = team.seats.used >= team.seats.total
  // QUI accorde : l'écran dit l'auteur du geste au moment où on le fait.
  const grantedBy = team.members.find(member => member.userId === user?.id)?.fullName ?? user?.email ?? ''

  return (
    <>
      {canManage && <InviteForm seatsFull={seatsFull} canGrantAdmin={canGrantAdmin} />}

      {/* #2016 — les demandes d'accès d'un nouveau venu du même domaine : la même permission que l'invitation. */}
      {canManage && <JoinRequestsSection />}

      {/* #4158.57 — un membre demande à rapatrier son espace personnel ici : l'admin tranche. */}
      {canGrantAdmin && <WorkspaceMergeRequestsSection />}

      <Box as="section">
        <Text element="h2" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]" className="mb-1">
          {t('sections.members', { count: team.members.length })}
        </Text>
        <Card className="px-4 py-1">
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
        </Card>
      </Box>

      {team.invitations.length > 0 && (
        <Box as="section">
          <Text element="h2" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]" className="mb-1">
            {t('sections.invitations', { count: team.invitations.length })}
          </Text>
          <Card className="px-4 py-1">
            {team.invitations.map(invitation => (
              <InvitationRow
                key={invitation.id}
                invitation={invitation}
                canManage={canManage}
                canGrantAdmin={canGrantAdmin}
              />
            ))}
          </Card>
        </Box>
      )}

      {!canManage && (
        <Text size="xs" color="text-[var(--bellum-text-secondary)]">
          {role === 'viewer' ? t('readOnly.viewer') : t('readOnly.other')}
        </Text>
      )}
    </>
  )
})
