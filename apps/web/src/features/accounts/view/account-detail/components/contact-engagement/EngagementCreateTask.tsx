import { PLAN_ACTION_CHANNELS, type Contact, type CreatePlanAction, type PlanActionChannel } from '@bellum/contracts'
import { Button, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@bellum/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CheckCheck, ListPlus } from 'lucide-react'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { planItemsApi } from '@/features/actions/planItems.api'

/** #2901 (#2395.4) — sentinelle du select : Radix n'accepte pas la valeur
 *  `""` sur un `SelectItem`. `null` (canal non précisé) reste le défaut du
 *  contrat (`createPlanActionSchema.channel`) — cette valeur ne voyage jamais
 *  au-delà de ce composant. */
const UNSPECIFIED_CHANNEL = 'unspecified' as const

/** La borne du libellé d'une action (`createPlanActionSchema.label`). */
const LABEL_MAX = 500

/**
 * #2123.72 — le libellé de la tâche : l'intitulé rédigé, sinon la première
 * phrase de la consigne. Jamais un libellé générique inventé.
 */
function contactTaskLabel(subject: string, body: string): string {
  const title = subject.trim()
  if (title) return title.slice(0, LABEL_MAX)
  const firstSentence = body.trim().match(/^[^.!?\n]+[.!?]?/)?.[0] ?? body.trim()
  return firstSentence.trim().slice(0, LABEL_MAX)
}

/**
 * #2123.72 — « Créer la tâche » : la tâche de prise de contact ne s'ENVOIE pas,
 * elle se CRÉE dans les actions du commercial.
 *
 * Elle passe par la porte canonique `POST /plan-items` (#2123.46) : la ligne
 * `action_plan_items` que le plan du compte affiche ET que `/actions` liste.
 * L'objet visé est le contact, NOMMÉ (`target`), et la consigne rédigée devient
 * la raison de l'action. Une fois créée, le bouton se fige : un double clic ne
 * fabrique pas une seconde copie (#2123.47).
 *
 * Un contact rattaché à aucun compte n'a pas de plan où vivre : le bouton est
 * alors désactivé, jamais rattaché à un compte deviné.
 */
export function EngagementCreateTaskAction({
  contact,
  subject,
  body,
}: {
  contact: Contact
  subject: string
  body: string
}) {
  const { t } = useTranslation('engagement')
  const queryClient = useQueryClient()
  const accountId = contact.account_id ?? null
  const label = contactTaskLabel(subject, body)
  // #2871 (#2395.8) — l'objectif est REQUIS : le corps du message, à défaut son
  // objet ; ni l'un ni l'autre ⇒ le bouton reste désactivé.
  const reason = body.trim() || subject.trim() || null
  // #2901 (#2395.4) — le canal choisi dans le composer, jamais deviné depuis
  // le libellé libre : absent (`UNSPECIFIED_CHANNEL`) ⇒ `null` au contrat,
  // comportement inchangé si personne ne le renseigne.
  const [channel, setChannel] = useState<PlanActionChannel | typeof UNSPECIFIED_CHANNEL>(UNSPECIFIED_CHANNEL)

  const create = useMutation({
    mutationFn: (input: CreatePlanAction) => planItemsApi.create(input),
    onSuccess: () => {
      // Le préfixe couvre le plan du compte ET la liste de `/actions`.
      void queryClient.invalidateQueries({ queryKey: ['plan-items'] })
      toast.success(t('task.created'))
    },
    onError: () => toast.error(t('task.createError')),
  })

  const created = create.isSuccess
  const disabled = !accountId || !label || !reason || created || create.isPending

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Select
        value={channel}
        onValueChange={value => setChannel(value as PlanActionChannel | typeof UNSPECIFIED_CHANNEL)}
        disabled={created || create.isPending}
      >
        <SelectTrigger aria-label={t('task.channelLabel')} className="h-8 w-32 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={UNSPECIFIED_CHANNEL}>{t('task.channelUnspecified')}</SelectItem>
          {PLAN_ACTION_CHANNELS.map(value => (
            <SelectItem key={value} value={value}>
              {t(`channel.${value}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Button
        type="button"
        size="xs"
        variant={created ? 'ghost' : 'default'}
        icon={created ? CheckCheck : ListPlus}
        disabled={disabled}
        isLoading={create.isPending}
        title={accountId ? undefined : t('task.noAccount')}
        className="rounded-full text-xs pointer-coarse:min-h-11"
        onClick={() => {
          if (!accountId || !label || !reason) return
          create.mutate({
            account_id: accountId,
            label,
            reason,
            // #2395.8 — résultat attendu : une réponse du contact nommé (gabarit, rien de deviné).
            expected_outcome: t('task.expectedOutcome', { name: contact.full_name }),
            target: { kind: 'contact', id: contact.id, label: contact.full_name },
            owner_name: null,
            channel: channel === UNSPECIFIED_CHANNEL ? null : channel,
          })
        }}
      >
        {created ? t('task.createdButton') : t('task.create')}
      </Button>
    </div>
  )
}
