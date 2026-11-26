import {
  hasPermission,
  workspacePermissionValues,
  workspaceRoleLabels,
  type WorkspacePermission,
  type WorkspaceTeamMember,
} from '@bellum/contracts'
import {
  Box,
  Button,
  Checkbox,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Text,
} from '@bellum/ui'
import { useEffect, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useTeam } from '@/features/team/hooks/useTeam'

/**
 * Les droits accordés EN PROPRE à un membre — l'écran qui manquait.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'IL RÉPARE
 * ─────────────────────────────────────────────────────────────────────────────
 * `PUT /workspaces/members/:userId/permissions` existait, et
 * `WorkspacePermissionGuard` consultait ces exceptions **à chaque requête**.
 * Aucun écran ne les posait, et rien ne les RENDAIT non plus : le mécanisme
 * était armé, sans chargeur. Neuf rôles ne couvriront jamais une ESN réelle —
 * sans exceptions nominatives, la seule réponse au commercial à qui on confie
 * la connexion du CRM est de le monter en `admin`, c'est-à-dire de lui donner
 * huit droits pour en régler un.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * TROIS PROPRIÉTÉS, ET CHACUNE EST DE LA SÉCURITÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * 1. **QUI accorde QUOI à QUI, écrit à l'écran**, et le geste est journalisé
 *    (`member_permissions_changed`). Un privilège qui se déplace sans que le
 *    rôle affiché ne change est le seul mouvement que le journal ne racontait
 *    pas.
 * 2. **La liste envoyée est COMPLÈTE**, parce que la route REMPLACE. D'où la
 *    lecture préalable de `extraPermissions` : envoyer la seule case qu'on
 *    vient de cocher effacerait en silence tout ce qui avait été accordé avant.
 * 3. **Ce que le RÔLE donne déjà n'est pas proposé en exception** — coché,
 *    inerte, et dit comme tel. Le montrer comme un accord laisserait croire à
 *    un privilège là où il n'y en a pas, et l'enregistrer ferait grossir la
 *    liste d'accords redondants à chaque passage.
 *
 * ⚠️ Accorder est irréversible dans ses EFFETS : ce qui a été lu l'a été. C'est
 * pourquoi rien n'est patché optimistiquement (voir `useTeam`).
 */
export function MemberPermissionsDialog({
  member,
  grantedBy,
  open,
  onOpenChange,
}: {
  member: WorkspaceTeamMember
  /** Le nom de celui qui accorde — la moitié du geste que l'écran doit dire. */
  grantedBy: string
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const { t } = useTranslation('team')
  const { setMemberPermissions } = useTeam()
  const stored = member.extraPermissions ?? []
  const [granted, setGranted] = useState<WorkspacePermission[]>(stored)

  // La liste du serveur reprend la main à chaque ouverture : garder un état
  // local d'une session précédente ferait ré-enregistrer une photo périmée.
  useEffect(() => {
    if (open) setGranted(member.extraPermissions ?? [])
  }, [open, member.extraPermissions])

  const isOwner = member.role === 'owner'
  const name = member.fullName ?? member.email ?? t('member.fallbackTarget')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent closeLabel={t('common:actions.close')} className="max-h-[85dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('permissions.title', { name })}</DialogTitle>
          <DialogDescription>
            {isOwner
              ? t('permissions.ownerHasEverything')
              : t('permissions.explain', { name, role: workspaceRoleLabels[member.role], grantedBy })}
          </DialogDescription>
        </DialogHeader>

        {isOwner ? null : (
          <Box className="flex flex-col gap-2">
            {workspacePermissionValues.map(permission => {
              const fromRole = hasPermission(member.role, permission)
              const checked = fromRole || granted.includes(permission)
              return (
                <label
                  key={permission}
                  className="flex min-h-11 cursor-pointer items-start gap-2.5 rounded-md px-1 py-1.5 pointer-coarse:min-h-11"
                >
                  <Checkbox
                    className="mt-0.5"
                    checked={checked}
                    disabled={fromRole || setMemberPermissions.isPending}
                    onCheckedChange={next =>
                      setGranted(current =>
                        next === true
                          ? [...current.filter(value => value !== permission), permission]
                          : current.filter(value => value !== permission),
                      )
                    }
                  />
                  <span className="min-w-0">
                    {/* i18n keys: permissions.value.analysis:run | permissions.value.contacts:enrich | …
                        ⚠️ `nsSeparator: false` est OBLIGATOIRE : le séparateur
                        d'espace de noms d'i18next est `:`, et une permission en
                        porte un. Sans lui, `permissions.value.analysis:run` se
                        lit « espace de noms `permissions.value.analysis`, clé
                        `run` » — et l'écran affiche la clé brute. */}
                    <Text element="span" size="sm" weight="medium" className="block">
                      {t(`permissions.value.${permission}`, { nsSeparator: false })}
                    </Text>
                    <Text element="span" size="xs" color="text-[var(--bellum-text-secondary)]" className="block">
                      {fromRole ? t('permissions.fromRole') : t('permissions.granted')}
                    </Text>
                  </span>
                </label>
              )
            })}
          </Box>
        )}

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            {t('permissions.cancel')}
          </Button>
          {isOwner ? null : (
            <Button
              size="sm"
              disabled={setMemberPermissions.isPending}
              onClick={() =>
                setMemberPermissions.mutate(
                  // La liste COMPLÈTE des accords en propre — sans ce que le
                  // rôle donne déjà, qui n'est une exception pour personne.
                  {
                    userId: member.userId,
                    permissions: granted.filter(permission => !hasPermission(member.role, permission)),
                  },
                  { onSuccess: () => onOpenChange(false) },
                )
              }
            >
              {t('permissions.save')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
