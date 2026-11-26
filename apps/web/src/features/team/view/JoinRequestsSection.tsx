import { UserPlus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SettingsBlock } from '@/features/settings/components/SettingsBlocks'
import { toast } from 'sonner'
import { Box, Button, Text } from '@bellum/ui'
import {
  useDecideWorkspaceJoinRequest,
  usePendingWorkspaceJoinRequests,
} from '@/features/onboarding/hooks/useWorkspaceJoin'

/**
 * #2016 — les demandes d'accès à l'espace, pour qui gère l'équipe.
 *
 * Accepter est un GESTE D'UTILISATEUR : le clic est la décision, sans étape de
 * plus. La personne entre en simple membre, dans la limite des sièges ; son
 * profil d'entreprise est ensuite hérité, rien n'est recopié.
 *
 * Rien ne s'affiche tant qu'aucune demande n'attend — ni titre vide, ni « 0 ».
 */
export function JoinRequestsSection() {
  const { t, i18n } = useTranslation('team')
  const { data: requests } = usePendingWorkspaceJoinRequests(true)
  const decide = useDecideWorkspaceJoinRequest()
  if (!requests || requests.length === 0) return null

  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const busy = (id: string, decision: 'accept' | 'refuse'): boolean =>
    decide.isPending && decide.variables?.id === id && decide.variables.decision === decision

  return (
    <SettingsBlock title={t('joinRequests.title', { count: requests.length })} testId="join-requests">
      <Box>
        {requests.map(request => {
          const who = request.requesterName ?? request.requesterEmail ?? t('joinRequests.unknown')
          return (
            <Box
              key={request.id}
              display="flex"
              className="flex-wrap items-center gap-3 border-b border-[var(--bellum-border)] py-3 last:border-b-0"
            >
              <Box
                rounded="lg"
                display="flex"
                className="size-9 shrink-0 items-center justify-center bg-[var(--bellum-surface-2)]"
              >
                <UserPlus className="size-4 text-[var(--bellum-text-secondary)]" aria-hidden />
              </Box>
              <Box className="min-w-0 flex-1">
                <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]" className="truncate">
                  {who}
                </Text>
                <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="truncate">
                  {[
                    request.requesterName ? request.requesterEmail : null,
                    t('joinRequests.since', { date: new Date(request.createdAt).toLocaleDateString(locale) }),
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </Text>
              </Box>
              <Button
                variant="violet"
                size="sm"
                isLoading={busy(request.id, 'accept')}
                disabled={decide.isPending}
                aria-label={t('joinRequests.acceptAria', { who })}
                onClick={() =>
                  decide.mutate(
                    { id: request.id, decision: 'accept' },
                    { onError: error => toast.error(error.message || t('joinRequests.error')) },
                  )
                }
              >
                {t('joinRequests.accept')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                isLoading={busy(request.id, 'refuse')}
                disabled={decide.isPending}
                aria-label={t('joinRequests.refuseAria', { who })}
                onClick={() =>
                  decide.mutate(
                    { id: request.id, decision: 'refuse' },
                    { onError: error => toast.error(error.message || t('joinRequests.error')) },
                  )
                }
              >
                {t('joinRequests.refuse')}
              </Button>
            </Box>
          )
        })}
      </Box>
    </SettingsBlock>
  )
}
