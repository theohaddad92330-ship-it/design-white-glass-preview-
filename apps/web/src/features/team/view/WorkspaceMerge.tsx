import { ArrowRightLeft } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import type { WorkspaceMergeRequestView, WorkspaceMergeTableCount } from '@bellum/contracts'
import { Box, Button, Card, Text } from '@bellum/ui'
import {
  useMyWorkspaceMerges,
  usePendingWorkspaceMerges,
  useWorkspaceMergeGesture,
} from '@/features/team/hooks/useWorkspaceMerge'
import { useWorkspaces } from '@/features/team/hooks/useWorkspaces'

/**
 * #4158.57 (décision Louis 17/10/2026) — rapatrier l'espace PERSONNEL dans l'espace ESN rejoint.
 *
 * Côté demandeur, trois temps : l'APERÇU (une simulation, rien ne bouge), la VALIDATION de cet aperçu
 * (elle porte sur son empreinte, affichée), puis le SUIVI du job une fois qu'un admin de l'espace cible a
 * accepté. Côté admin, la demande en attente. On n'affiche pas ce qu'on n'a pas : une table sans ligne ne
 * fait aucune ligne, jamais « 0 recopié ».
 */

function TableLines({ tables }: { tables: WorkspaceMergeTableCount[] }) {
  const { t } = useTranslation('team')
  const lines = tables
    .map(row => {
      const parts = [
        row.moving > 0 ? t('workspaceMerge.parts.moving', { count: row.moving }) : null,
        row.duplicates > 0 ? t('workspaceMerge.parts.duplicates', { count: row.duplicates }) : null,
        row.held > 0 ? t('workspaceMerge.parts.held', { count: row.held }) : null,
      ].filter((part): part is string => part !== null)
      return parts.length > 0
        ? {
            table: row.table,
            text: t('workspaceMerge.line', { table: t(`workspaceMerge.tables.${row.table}`), parts: parts.join(', ') }),
          }
        : null
    })
    .filter((line): line is { table: WorkspaceMergeTableCount['table']; text: string } => line !== null)

  if (lines.length === 0) {
    return (
      <Text size="sm" color="text-[var(--bellum-text-secondary)]">
        {t('workspaceMerge.empty')}
      </Text>
    )
  }
  return (
    <ul className="space-y-1">
      {lines.map(line => (
        <li key={line.table}>
          <Text size="sm" color="text-[var(--bellum-text-primary)]">
            {line.text}
          </Text>
        </li>
      ))}
    </ul>
  )
}

function Proposals({ request }: { request: WorkspaceMergeRequestView }) {
  const { t } = useTranslation('team')
  if (request.proposals.length === 0) return null
  return (
    <Box className="space-y-1">
      <Text size="xs" weight="medium" color="text-[var(--bellum-text-secondary)]">
        {t('workspaceMerge.proposalsTitle', { target: request.targetWorkspaceName })}
      </Text>
      <ul className="space-y-0.5">
        {request.proposals.map(item => (
          <li key={`${item.table}-${item.sourceId}`}>
            <Text size="xs" color="text-[var(--bellum-text-primary)]">
              {item.duplicateKey ? `${item.label} — ${t(`workspaceMerge.keys.${item.duplicateKey}`)}` : item.label}
            </Text>
          </li>
        ))}
      </ul>
    </Box>
  )
}

/** La carte du DEMANDEUR — visible seulement s'il a un espace personnel à côté de l'espace actif. */
export function PersonalSpaceMergeCard() {
  const { t } = useTranslation('team')
  const { workspaces } = useWorkspaces()
  const { data: mine } = useMyWorkspaceMerges()
  const gesture = useWorkspaceMergeGesture()

  const personal = workspaces?.find(workspace => workspace.isPersonal && !workspace.isActive)
  const target = workspaces?.find(workspace => workspace.isActive && !workspace.isPersonal)
  if (!personal || !target) return null

  const request = mine?.find(row => row.sourceWorkspaceId === personal.id && row.status !== 'cancelled')
  const onError = { onError: (error: Error) => toast.error(error.message || t('workspaceMerge.error')) }
  const preview = (label: string) => (
    <Button
      variant="violet"
      size="sm"
      isLoading={gesture.isPending && gesture.variables?.kind === 'preview'}
      disabled={gesture.isPending}
      onClick={() => gesture.mutate({ kind: 'preview', targetWorkspaceId: target.id }, onError)}
    >
      {label}
    </Button>
  )

  return (
    <Box as="section">
      <Text element="h2" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]" className="mb-1">
        {t('workspaceMerge.title')}
      </Text>
      <Card className="space-y-3 p-4">
        <Box display="flex" className="items-start gap-3">
          <ArrowRightLeft className="mt-0.5 size-4 shrink-0 text-[var(--bellum-text-secondary)]" aria-hidden />
          <Text size="sm" color="text-[var(--bellum-text-secondary)]">
            {t('workspaceMerge.subtitle', { source: personal.name, target: target.name })}
          </Text>
        </Box>

        {!request && preview(t('workspaceMerge.preview'))}

        {request?.status === 'previewed' && (
          <>
            <TableLines tables={request.tables} />
            <Proposals request={request} />
            <Text size="xs" color="text-[var(--bellum-text-secondary)]" className="break-all">
              {t('workspaceMerge.hash', { hash: request.previewHash.slice(0, 12) })}
            </Text>
            <Box display="flex" className="flex-wrap gap-2">
              <Button
                variant="violet"
                size="sm"
                disabled={gesture.isPending}
                onClick={() => gesture.mutate({ kind: 'confirm', id: request.id, hash: request.previewHash }, onError)}
              >
                {t('workspaceMerge.confirm')}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                disabled={gesture.isPending}
                onClick={() => gesture.mutate({ kind: 'cancel', id: request.id }, onError)}
              >
                {t('workspaceMerge.cancel')}
              </Button>
            </Box>
          </>
        )}

        {request?.status === 'awaiting_admin' && (
          <>
            <TableLines tables={request.tables} />
            <Text size="sm" color="text-[var(--bellum-text-primary)]">
              {t('workspaceMerge.awaiting', { target: request.targetWorkspaceName })}
            </Text>
            <Box>
              <Button
                variant="ghost"
                size="sm"
                disabled={gesture.isPending}
                onClick={() => gesture.mutate({ kind: 'cancel', id: request.id }, onError)}
              >
                {t('workspaceMerge.cancel')}
              </Button>
            </Box>
          </>
        )}

        {(request?.status === 'approved' || request?.status === 'running') && (
          <Text size="sm" color="text-[var(--bellum-text-primary)]" role="status">
            {t('workspaceMerge.running', { done: request.progress.done, total: request.progress.total })}
          </Text>
        )}

        {request?.status === 'failed' && (
          <>
            <Text size="sm" color="text-[var(--danger-soft-text)]">
              {t('workspaceMerge.failed')}
            </Text>
            <Box>
              <Button
                variant="violet"
                size="sm"
                disabled={gesture.isPending}
                onClick={() => gesture.mutate({ kind: 'resume', id: request.id }, onError)}
              >
                {t('workspaceMerge.resume')}
              </Button>
            </Box>
          </>
        )}

        {request?.status === 'done' && (
          <>
            <Text size="sm" color="text-[var(--bellum-text-primary)]">
              {t('workspaceMerge.done', { target: request.targetWorkspaceName })}
            </Text>
            <Proposals request={request} />
          </>
        )}

        {request?.status === 'rejected' && (
          <>
            <Text size="sm" color="text-[var(--bellum-text-secondary)]">
              {t('workspaceMerge.rejected', { target: request.targetWorkspaceName })}
            </Text>
            {preview(t('workspaceMerge.previewAgain'))}
          </>
        )}
      </Card>
    </Box>
  )
}

/** Côté ADMIN de l'espace cible : les demandes à trancher, et le suivi de celles acceptées. */
export function WorkspaceMergeRequestsSection() {
  const { t } = useTranslation('team')
  const { data: requests } = usePendingWorkspaceMerges(true)
  const gesture = useWorkspaceMergeGesture()
  if (!requests || requests.length === 0) return null
  const onError = { onError: (error: Error) => toast.error(error.message || t('workspaceMerge.error')) }
  const awaiting = requests.filter(request => request.status === 'awaiting_admin')

  return (
    <Box as="section">
      <Text element="h2" size="sm" weight="semibold" color="text-[var(--bellum-text-primary)]" className="mb-1">
        {t('workspaceMerge.admin.title', { count: awaiting.length || requests.length })}
      </Text>
      <Card className="px-4 py-1">
        {requests.map(request => (
          <Box key={request.id} className="space-y-2 border-b border-[var(--bellum-border)] py-3 last:border-b-0">
            <Text size="sm" weight="medium" color="text-[var(--bellum-text-primary)]">
              {t('workspaceMerge.admin.who', { source: request.sourceWorkspaceName })}
            </Text>
            <TableLines tables={request.tables} />
            <Proposals request={request} />
            {request.status === 'awaiting_admin' ? (
              <Box display="flex" className="flex-wrap gap-2">
                <Button
                  variant="violet"
                  size="sm"
                  disabled={gesture.isPending}
                  aria-label={t('workspaceMerge.admin.approveAria', { source: request.sourceWorkspaceName })}
                  onClick={() =>
                    gesture.mutate({ kind: 'approve', id: request.id, hash: request.previewHash }, onError)
                  }
                >
                  {t('workspaceMerge.admin.approve')}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={gesture.isPending}
                  aria-label={t('workspaceMerge.admin.rejectAria', { source: request.sourceWorkspaceName })}
                  onClick={() => gesture.mutate({ kind: 'reject', id: request.id }, onError)}
                >
                  {t('workspaceMerge.admin.reject')}
                </Button>
              </Box>
            ) : request.status === 'failed' ? (
              <Button
                variant="ghost"
                size="sm"
                disabled={gesture.isPending}
                onClick={() => gesture.mutate({ kind: 'resume', id: request.id }, onError)}
              >
                {t('workspaceMerge.resume')}
              </Button>
            ) : (
              <Text size="xs" color="text-[var(--bellum-text-secondary)]" role="status">
                {t('workspaceMerge.running', { done: request.progress.done, total: request.progress.total })}
              </Text>
            )}
          </Box>
        ))}
      </Card>
    </Box>
  )
}
