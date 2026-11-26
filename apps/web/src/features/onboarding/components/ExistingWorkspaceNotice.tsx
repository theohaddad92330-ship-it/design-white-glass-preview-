import { Building2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { ownWorkspaceUnlockAt, type WorkspaceJoinAdmin, type WorkspaceJoinOverview } from '@bellum/contracts'
import { Button, Card, CardContent, Text } from '@bellum/ui'
import { visibleJoinCandidates } from '@/features/onboarding/lib/workspace-join'

/** « Louis S. » — un prénom et une initiale, jamais plus (#2016.5). */
function adminLabel(admin: WorkspaceJoinAdmin): string {
  return admin.lastInitial ? `${admin.firstName} ${admin.lastInitial}.` : admin.firstName
}

type Props = {
  overview: WorkspaceJoinOverview
  /** L'espace dont un geste est en cours d'envoi, pour l'état de chargement. */
  busyWorkspaceId: string | null
  onRequest: (workspaceId: string) => void
  onDismiss: (workspaceId: string) => void
  onCreateOwn: () => void
}

/**
 * #2016 — « UN ESPACE EXISTE DÉJÀ POUR <NOM> » (décision Louis 15/09/2026).
 *
 * Deux gestes par espace détecté : « Demander l'accès » (la demande part à ses
 * administrateurs, nommés sans leurs coordonnées) et « Ce n'est pas mon
 * entreprise » (la détection s'est trompée). Un seul geste pour tous :
 * « Créer mon propre espace », INACTIF tant qu'un espace n'est pas tranché —
 * 72 h de silence, un refus ou « pas mon entreprise » (`canCreateOwnWorkspace`,
 * la règle du contrat, calculée par l'API). Aucun doublon n'est créé tout seul.
 */
export function ExistingWorkspaceNotice({ overview, busyWorkspaceId, onRequest, onDismiss, onCreateOwn }: Props) {
  const { t, i18n } = useTranslation('onboarding')
  const locale = i18n.language === 'fr' ? 'fr-FR' : 'en-GB'
  const candidates = visibleJoinCandidates(overview)
  if (candidates.length === 0) return null

  return (
    <div className="space-y-3">
      {candidates.map(candidate => {
        const { workspaceId, workspaceName, admins, request } = candidate
        const busy = busyWorkspaceId === workspaceId
        return (
          <Card key={workspaceId} className="border-[var(--bellum-border)] bg-[var(--bellum-surface-1)]">
            <CardContent className="space-y-3 p-4">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 size-5 shrink-0 text-[var(--bellum-text-accent)]" aria-hidden />
                <div className="min-w-0 space-y-1">
                  <Text element="h2" size="base" weight="semibold">
                    {t('workspaceJoin.title', { name: workspaceName })}
                  </Text>
                  <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                    {admins.length > 0
                      ? t('workspaceJoin.admins', { names: admins.map(adminLabel).join(', ') })
                      : t('workspaceJoin.adminsUnnamed')}
                  </Text>
                  {request?.status === 'pending' && (
                    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                      {t('workspaceJoin.pending', {
                        date: new Date(ownWorkspaceUnlockAt(request)).toLocaleString(locale, {
                          dateStyle: 'long',
                          timeStyle: 'short',
                        }),
                      })}
                    </Text>
                  )}
                  {request?.status === 'refused' && (
                    <Text size="sm" color="text-[var(--bellum-text-secondary)]">
                      {t('workspaceJoin.refused')}
                    </Text>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {!request && (
                  <Button variant="violet" size="sm" onClick={() => onRequest(workspaceId)} isLoading={busy}>
                    {t('workspaceJoin.request')}
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => onDismiss(workspaceId)} disabled={busy}>
                  {t('workspaceJoin.notMyCompany')}
                </Button>
              </div>
            </CardContent>
          </Card>
        )
      })}
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" onClick={onCreateOwn} disabled={!overview.canCreateOwnWorkspace}>
          {t('workspaceJoin.createOwn')}
        </Button>
        {!overview.canCreateOwnWorkspace && (
          <Text size="xs" color="text-[var(--bellum-text-muted)]" className="min-w-0">
            {t('workspaceJoin.createOwnLocked')}
          </Text>
        )}
      </div>
    </div>
  )
}
