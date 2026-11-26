import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import type { ProjectCrmExportResponse } from '@bellum/contracts'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api-error'
import { projectsApi } from '../api'

/** HTTP status behind an ``apiFetch`` failure, when we can read it. */
function statusOf(err: unknown): number | null {
  if (err instanceof ApiError) return err.status
  if (err instanceof Error && typeof err.cause === 'number') return err.cause
  return null
}

/**
 * Le CRM qui a répondu s'appelle « ton CRM » — jamais par son éditeur.
 *
 * Arbitrage du 02/08, reconduit le 25/08 (« capacité partout, sans exception »).
 * Le serveur rend bien `provider`, et on le reçoit : on ne l'AFFICHE pas. Ce que
 * le message doit dire est ce qui a été créé — un deal, une note, une tâche —
 * pas chez qui.
 */

/** Success message keyed by the CRM object actually created — the toast confirms
 *  honestly what was pushed (a deal, a note, a task), never a generic "done".
 *  Falls back to the neutral message if the server omits/returns an unknown kind. */
function successMessage(provider: string, object: ProjectCrmExportResponse['object'] | undefined): string {
  const key =
    object === 'deal' || object === 'note' || object === 'task' || object === 'opportunity'
      ? `projects:crmExport.success.${object}`
      : 'projects:crmExport.success.default'
  return i18n.t(key, { provider })
}

/**
 * « Ajouter au CRM » (Théo TF1 p39) — `POST /opportunities/:id/export-crm`.
 * Pushes the besoin as its idiomatic object into whichever CRM is connected: a
 * Deal (HubSpot, Pipedrive), a Note on the Company (Attio), a Task (Salesforce).
 *
 * The whole point of this hook is honest failure handling:
 *  - **409 (no CRM connected)** is the expected, actionable case: nothing is
 *    written, nothing is faked. We surface a distinct warning that sends the
 *    user to Réglages › Intégrations to connect a CRM — never a raw error.
 *  - the CRM's own rejection (502) or anything else stays a plain error toast.
 *
 * Nothing is invalidated on success: the export writes to the CRM, not to any
 * Bellum query we cache. We only confirm which provider took it and what it made.
 */
export function useExportProjectToCrm() {
  return useMutation<ProjectCrmExportResponse, Error, string>({
    mutationKey: ['opportunities', 'exportToCrm'],
    mutationFn: (id: string) => projectsApi.exportToCrm(id),
    onSuccess: ({ provider, object }) => {
      toast.success(successMessage(i18n.t('projects:crmExport.capability'), object))
    },
    onError: err => {
      if (statusOf(err) === 409) {
        toast.warning(i18n.t('projects:crmExport.noProviderTitle'), {
          description: i18n.t('projects:crmExport.noProviderDescription'),
          action: {
            label: i18n.t('projects:crmExport.connectCrm'),
            onClick: () => window.location.assign('/integrations'),
          },
          duration: 8_000,
        })
        return
      }
      toast.error(err.message || i18n.t('projects:crmExport.error'))
    },
  })
}
