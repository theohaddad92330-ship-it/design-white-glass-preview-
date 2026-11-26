import type { Contact, CreateOutreachCallTaskRequest } from '@bellum/contracts'
import { Button } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, PhoneCall } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { outreachMessagesApi } from '@/features/outreach/api'
import { toastCallTaskCreated, useOpenCallTasks } from '@/features/outreach/lib/openCallTasks'

/** Les bornes de `createOutreachCallTaskRequestSchema`. */
const SHORT_MAX = 500
const PITCH_MAX = 2000

function sentences(text: string): string[] {
  return (text.trim().match(/[^.!?\n]+[.!?]?/g) ?? []).map(sentence => sentence.trim()).filter(Boolean)
}

/**
 * #2366.5 — la raison et l'objectif de l'appel, TIRÉS du script : la raison est
 * celle que le moteur a rédigée (`rationale`), sinon la première phrase du
 * script ; l'objectif est la question que le script pose, sinon sa dernière
 * phrase. Jamais un libellé générique inventé.
 */
export function callTaskFields(script: string, rationale: string | null | undefined) {
  const parts = sentences(script)
  const reason = (rationale?.trim() || parts[0] || '').slice(0, SHORT_MAX)
  const question = [...parts].reverse().find(sentence => sentence.endsWith('?'))
  const objective = (question ?? parts[parts.length - 1] ?? '').slice(0, SHORT_MAX)
  return { reason, objective }
}

/**
 * #2366.5 — « Ajouter aux appels à passer » : le script d'appel préparé devient
 * une TÂCHE D'APPEL (`POST /outreach/call-tasks`), avec sa propre machine
 * d'états (à passer → pas de réponse / à rappeler / qualifié…) distincte de
 * celle du message, suivie dans la section « Appels à passer » de
 * /actions/sequences. Le copilote ne passe pas l'appel : il le prépare, le
 * commercial l'ajoute d'un geste. Une fois ajouté, le bouton se fige.
 */
export function EngagementCreateCallTaskAction({
  contact,
  script,
  rationale,
}: {
  contact: Contact
  script: string
  rationale?: string | null
}) {
  const { t } = useTranslation('engagement')
  const queryClient = useQueryClient()
  const openCallTasks = useOpenCallTasks()
  const { reason, objective } = callTaskFields(script, rationale)
  const pitch = script.trim().slice(0, PITCH_MAX)

  const create = useMutation({
    mutationFn: (input: CreateOutreachCallTaskRequest) => outreachMessagesApi.createCall(input),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['outreach', 'call-tasks'] })
      toastCallTaskCreated(openCallTasks)
    },
    onError: () => toast.error(t('callTask.createError')),
  })

  const created = create.isSuccess
  const disabled = !reason || !objective || created || create.isPending

  return (
    <>
      <Button
        type="button"
        size="xs"
        variant={created ? 'ghost' : 'default'}
        icon={created ? CheckCheck : PhoneCall}
        disabled={disabled}
        isLoading={create.isPending}
        className="rounded-full text-xs pointer-coarse:min-h-11"
        onClick={() => {
          if (!reason || !objective) return
          // #2395.8 (fusion vague 36 ← main, 24/09) — `expected_outcome` est devenu
          // requis par `createOutreachCallTaskRequestSchema`. Le seul autre créateur
          // (`ContactCallTaskDialog.tsx`) le fait taper dans un dialogue ; ce
          // bouton-ci reste un GESTE UNIQUE sur un script déjà rédigé (#2366.5),
          // sans champ libre à offrir. `objective` EST déjà « ce qu'on attend de
          // l'appel » (la question que le script pose) — le réutiliser reste une
          // valeur RÉELLE tirée du script, jamais un texte inventé.
          create.mutate({
            contact_id: contact.id,
            source: 'contacts',
            reason,
            objective,
            pitch,
            expected_outcome: objective,
          })
        }}
      >
        {created ? t('callTask.createdButton') : t('callTask.plan')}
      </Button>
      {/* #4979.2 — le bouton figé dit où retrouver l'appel. */}
      {created ? (
        <Button
          type="button"
          size="xs"
          variant="link"
          className="text-xs pointer-coarse:min-h-11"
          onClick={openCallTasks}
        >
          {t('callTask.seeInCalls')}
        </Button>
      ) : null}
    </>
  )
}
