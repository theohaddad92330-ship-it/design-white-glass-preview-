import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import type {
  CreateOutreachCallTaskRequest,
  DeclareOutreachStepOutcomeInput,
  CreateOutreachSequenceRequest,
  CreateOutreachStepInput,
  DeclareOutreachEngagementSignalInput,
  DuplicateOutreachSequenceRequest,
  OutreachCallTask,
  OutreachSequence,
  UpdateOutreachStepInput,
} from '@bellum/contracts'
import { outreachApi, outreachMessagesApi, outreachKeys } from '@/features/outreach/api'
import { i18n } from '@/i18n'
import { ApiError } from '@/lib/api-error'

function useInvalidateOutreach() {
  const qc = useQueryClient()
  return () => qc.invalidateQueries({ queryKey: outreachKeys.all })
}

/**
 * #2380.50 — une collision d'équipe NOMME déjà la séquence en place ; il
 * manquait la PROPOSITION. Le serveur fournit l'identité du propriétaire
 * (`outreach.service.ts#collisionRefusal`), jamais le texte final : celui-ci
 * vit ici pour rester traduit FR/EN. Copié seulement — le copilote PRÉPARE,
 * il n'envoie jamais rien lui-même (un presse-papiers refusé se DIT, comme
 * `CopyContactLinkButton`).
 */
async function copyCollaborationMessage(vars: { owner: string; contact: string; sequence: string }): Promise<void> {
  const text = i18n.t('outreach:toast.collisionMessage', vars)
  try {
    if (!navigator.clipboard) throw new Error('clipboard unavailable')
    await navigator.clipboard.writeText(text)
    toast.success(i18n.t('outreach:toast.collisionCopied'))
  } catch {
    toast.error(i18n.t('outreach:toast.collisionCopyFailed'))
  }
}

/** Programme une séquence (template ou étapes custom). Les étapes email
 *  préparent + rappellent — l'envoi reste un geste manuel (#394). */
export function useCreateOutreachSequence() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, CreateOutreachSequenceRequest>({
    mutationKey: ['outreach', 'create'],
    mutationFn: body => outreachApi.create(body),
    onSuccess: () => {
      invalidate()
      toast.success(i18n.t('outreach:toast.created'))
    },
    onError: (err, body) => {
      const message = err instanceof Error ? err.message : ''
      // Le serveur refuse d'armer une séquence sur un contact dont l'employeur
      // détecté ne correspond pas au compte : la personne l'a probablement
      // quitté (PDF 2 §5.2). Ce n'est pas une erreur technique, c'est une
      // question — donc on la POSE, avec le geste qui y répond, au lieu de
      // n'afficher qu'un refus rouge que l'utilisateur ne peut pas lever.
      if (/probablement quitté/i.test(message) && !body.acknowledge_risk) {
        toast.warning(i18n.t('outreach:toast.riskTitle'), {
          description: message,
          duration: 12_000,
          action: {
            label: i18n.t('outreach:toast.riskConfirm'),
            onClick: () => void outreachApi.create({ ...body, acknowledge_risk: true }).then(invalidate),
          },
        })
        return
      }
      if (err instanceof ApiError && err.code === 'outreach_sequence_collision') {
        const details = err.details as {
          ownerName?: string | null
          ownerEmail?: string | null
          contactName?: string | null
          sequenceName?: string | null
        } | null
        const owner = details?.ownerName || details?.ownerEmail || i18n.t('outreach:toast.collisionOwnerFallback')
        toast.warning(i18n.t('outreach:toast.collisionTitle'), {
          description: message,
          duration: 12_000,
          action: {
            label: i18n.t('outreach:toast.collisionCollaborate', { owner }),
            onClick: () =>
              void copyCollaborationMessage({
                owner,
                contact: details?.contactName || '',
                sequence: details?.sequenceName || '',
              }),
          },
        })
        return
      }
      toast.error(i18n.t('outreach:toast.createFailed'), { description: message || undefined })
    },
  })
}

type SequenceAction = 'pause' | 'resume' | 'cancel'

/** pause / reprise / annulation d'une séquence possédée. */
export function useOutreachSequenceAction() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, { id: string; action: SequenceAction }>({
    mutationKey: ['outreach', 'sequence-action'],
    mutationFn: ({ id, action }) => outreachApi[action](id),
    onSuccess: () => invalidate(),
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/** Marque une étape faite → la séquence avance (jamais d'envoi déclenché ici). */
export function useOutreachStepDone() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, { id: string; stepId: string }>({
    mutationKey: ['outreach', 'step-done'],
    mutationFn: ({ id, stepId }) => outreachApi.stepDone(id, stepId),
    onSuccess: () => invalidate(),
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/** #2153.39 — ajoute une étape à une séquence encore vivante : la cadence
 *  n'est pas une liste figée après sa création. */
export function useOutreachAddStep() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, { id: string; input: CreateOutreachStepInput }>({
    mutationKey: ['outreach', 'add-step'],
    mutationFn: ({ id, input }) => outreachApi.addStep(id, input),
    onSuccess: () => {
      invalidate()
      toast.success(i18n.t('outreach:toast.stepAdded'))
    },
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/** #2378.5 / #2378.6 — retouche une étape encore à faire, gabarit ou custom :
 *  jamais figée après création. Les gardes de cadence se rejouent côté serveur. */
export function useOutreachUpdateStep() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, { id: string; stepId: string; input: UpdateOutreachStepInput }>({
    mutationKey: ['outreach', 'update-step'],
    mutationFn: ({ id, stepId, input }) => outreachApi.updateStep(id, stepId, input),
    onSuccess: () => {
      invalidate()
      toast.success(i18n.t('outreach:toast.stepUpdated'))
    },
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/** #2378.5 — retire une étape à faire : ARCHIVÉE côté serveur, jamais effacée. */
export function useOutreachRemoveStep() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, { id: string; stepId: string }>({
    mutationKey: ['outreach', 'remove-step'],
    mutationFn: ({ id, stepId }) => outreachApi.removeStep(id, stepId),
    onSuccess: () => {
      invalidate()
      toast.success(i18n.t('outreach:toast.stepRemoved'))
    },
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/**
 * #2909 (#2378.2) — déclare (ou efface) le signal d'ouverture/clic RAPPORTÉ
 * par le commercial sur une étape. Jamais détecté automatiquement.
 */
export function useOutreachDeclareEngagementSignal() {
  const invalidate = useInvalidateOutreach()
  return useMutation<
    OutreachSequence,
    Error,
    { id: string; stepId: string; input: DeclareOutreachEngagementSignalInput }
  >({
    mutationKey: ['outreach', 'declare-engagement-signal'],
    mutationFn: ({ id, stepId, input }) => outreachApi.declareEngagementSignal(id, stepId, input),
    onSuccess: () => {
      invalidate()
      toast.success(i18n.t('outreach:toast.engagementSignalDeclared'))
    },
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/**
 * #2203.62 / #2378.7 — dupliquer une séquence VERS UN AUTRE CONTACT.
 *
 * `POST /outreach/sequences/:id/duplicate` est gardé et testé côté serveur
 * depuis 1255e7a34 (reprend le rythme à venir, l'originale et ses inscriptions
 * ne bougent pas — mono-contact, c74) : cette mutation est le SEUL appelant
 * qui manquait à l'écran (doctrine : chercher l'appelant, pas la fonction).
 * Même repli « risque » que `useCreateOutreachSequence` — la copie repasse
 * par `create`, donc par la même garde `assertNotStaleContact`.
 */
export function useOutreachDuplicateSequence() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, { id: string; input: DuplicateOutreachSequenceRequest }>({
    mutationKey: ['outreach', 'duplicate'],
    mutationFn: ({ id, input }) => outreachApi.duplicate(id, input),
    onSuccess: () => {
      invalidate()
      toast.success(i18n.t('outreach:toast.duplicated'))
    },
    onError: (err, { id, input }) => {
      const message = err instanceof Error ? err.message : ''
      if (/probablement quitté/i.test(message) && !input.acknowledge_risk) {
        toast.warning(i18n.t('outreach:toast.riskTitle'), {
          description: message,
          duration: 12_000,
          action: {
            label: i18n.t('outreach:toast.riskConfirm'),
            onClick: () => void outreachApi.duplicate(id, { ...input, acknowledge_risk: true }).then(invalidate),
          },
        })
        return
      }
      toast.error(i18n.t('outreach:toast.duplicateFailed'), { description: message || undefined })
    },
  })
}

/**
 * #2366.5 — le SEUL appelant manquant : `POST /outreach/call-tasks` (gardé,
 * testé côté serveur) n'avait aucun créateur écran. Invalide le même préfixe
 * de clé que `listCalls` (`['outreach', 'call-tasks']`), donc le centre
 * d'approbation voit l'appel proposé sans rechargement.
 */
export function useCreateOutreachCallTask() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachCallTask, Error, CreateOutreachCallTaskRequest>({
    mutationKey: ['outreach', 'create-call-task'],
    mutationFn: body => outreachMessagesApi.createCall(body),
    onSuccess: () => {
      invalidate()
      toast.success(i18n.t('outreach:toast.callProposed'))
    },
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/** Lot L-B — réordonne les étapes encore à faire (glisser OU clavier). */
export function useOutreachReorderSteps() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, { id: string; stepIds: string[] }>({
    mutationKey: ['outreach', 'reorder-steps'],
    mutationFn: ({ id, stepIds }) => outreachApi.reorderSteps(id, { step_ids: stepIds }),
    onSuccess: () => invalidate(),
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/** Lot L-B — déclare (ou efface) l'issue d'une étape : jamais détectée, toujours déclarée. */
export function useOutreachDeclareOutcome() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, { id: string; stepId: string; input: DeclareOutreachStepOutcomeInput }>({
    mutationKey: ['outreach', 'declare-outcome'],
    mutationFn: ({ id, stepId, input }) => outreachApi.declareOutcome(id, stepId, input),
    onSuccess: () => invalidate(),
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/** Lot L-B — « RDV pris » : la séquence se termine, les étapes restantes sont sautées. */
export function useOutreachMeetingBooked() {
  const invalidate = useInvalidateOutreach()
  return useMutation<OutreachSequence, Error, { id: string; stepId?: string }>({
    mutationKey: ['outreach', 'meeting-booked'],
    mutationFn: ({ id, stepId }) => outreachApi.meetingBooked(id, stepId),
    onSuccess: () => {
      invalidate()
      toast.success(i18n.t('outreach:toast.meetingBooked'))
    },
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/** Lot L-B — pause vacances : toutes mes séquences actives, jusqu'à une date. */
export function useOutreachStartVacation() {
  const invalidate = useInvalidateOutreach()
  return useMutation<{ paused: number }, Error, { until: string }>({
    mutationKey: ['outreach', 'start-vacation'],
    mutationFn: ({ until }) => outreachApi.startVacation(until),
    onSuccess: ({ paused }) => {
      invalidate()
      toast.success(i18n.t('outreach:toast.vacationStarted', { count: paused }))
    },
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}

/** Lot L-B — reprise anticipée : les échéances restantes sont décalées de la durée de pause. */
export function useOutreachResumeVacation() {
  const invalidate = useInvalidateOutreach()
  return useMutation<{ resumed: number }, Error, void>({
    mutationKey: ['outreach', 'resume-vacation'],
    mutationFn: () => outreachApi.resumeVacation(),
    onSuccess: ({ resumed }) => {
      invalidate()
      toast.success(i18n.t('outreach:toast.vacationResumed', { count: resumed }))
    },
    onError: err => {
      toast.error(i18n.t('outreach:toast.actionFailed'), {
        description: err instanceof Error ? err.message : undefined,
      })
    },
  })
}
