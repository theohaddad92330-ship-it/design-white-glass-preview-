import { Badge, Box, Button, Card, Text } from '@bellum/ui'
import { Building2, Check, User } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { workspaceRoleLabels } from '@bellum/contracts'
import { useWorkspaces } from '@/features/team/hooks/useWorkspaces'

/**
 * "Mes espaces de travail" — the switcher.
 *
 * It renders only when the user actually belongs to more than one workspace, so
 * the overwhelming majority of accounts (one personal workspace, never invited
 * anywhere) see nothing new. For someone who signed up on their own and was then
 * invited by an ESN, this is the screen that makes the invitation mean
 * something: before it, accepting wrote a correct membership row and left them
 * in their own space with no way across.
 *
 * Switching is non-destructive by construction — it changes which of the user's
 * existing memberships is active. Nothing is moved, merged or deleted, and the
 * personal workspace stays in this list with every dossier built in it.
 */
export function WorkspaceSwitcher() {
  const { t } = useTranslation('team')
  const { workspaces, canSwitch, switchWorkspace } = useWorkspaces()

  // One workspace = nothing to switch between. Say nothing rather than show a
  // control that cannot do anything.
  if (!canSwitch) return null

  return (
    <Card className="space-y-3 p-4">
      <Box>
        <Text size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]">
          {t('workspaces.title')}
        </Text>
        <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="mt-0.5">
          {t('workspaces.subtitle')}
        </Text>
      </Box>

      <Box className="space-y-1">
        {workspaces.map(workspace => {
          const busy = switchWorkspace.isPending && switchWorkspace.variables === workspace.id
          const Icon = workspace.isPersonal ? User : Building2
          return (
            <Box
              key={workspace.id}
              display="flex"
              className="items-center gap-3 border-b border-[var(--bellum-border)] py-2.5 last:border-b-0"
            >
              <Box
                rounded="lg"
                display="flex"
                className="size-9 shrink-0 items-center justify-center bg-[var(--bellum-surface-2)]"
              >
                <Icon className="size-4 text-[var(--bellum-text-secondary)]" />
              </Box>

              <Box className="min-w-0 flex-1">
                <Box display="flex" className="items-center gap-2">
                  <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]" className="truncate">
                    {workspace.name}
                  </Text>
                  {workspace.isPersonal && (
                    <Badge variant="secondary" className="shrink-0 text-xs">
                      {t('workspaces.personal')}
                    </Badge>
                  )}
                </Box>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]">
                  {t('workspaces.meta', {
                    role: workspaceRoleLabels[workspace.role],
                    count: workspace.memberCount,
                  })}
                </Text>
              </Box>

              {workspace.isActive ? (
                <Badge variant="default" className="shrink-0 text-xs">
                  <Check className="mr-1 size-3" />
                  {t('workspaces.active')}
                </Badge>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  isLoading={busy}
                  disabled={switchWorkspace.isPending}
                  onClick={() => switchWorkspace.mutate(workspace.id)}
                >
                  {t('workspaces.switch')}
                </Button>
              )}
            </Box>
          )
        })}
      </Box>
    </Card>
  )
}
