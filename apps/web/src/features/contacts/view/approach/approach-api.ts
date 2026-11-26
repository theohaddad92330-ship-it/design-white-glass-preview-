import type { Account, MessageDraftValidation, MessageDraftVersionItem } from '@bellum/contracts'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { accountKeys, accountsApi } from '@/features/accounts/api'
import { apiFetch } from '@/lib/api'
import { useSession } from '@/lib/hooks/use-session'
import { sameDraftContent, type ApproachChannel, type DraftContent } from './approach-model'

const threadKey = (contactId: string, channel: ApproachChannel) =>
  ['message-draft-versions', contactId, channel] as const

/** Le contenu EFFECTIF d'une version : la correction du commercial si elle existe (même règle que l'empreinte côté API). */
export function effectiveContent(item: MessageDraftVersionItem): DraftContent {
  return { subject: item.editedSubject ?? item.subject ?? '', body: item.editedBody ?? item.body }
}

/** Le fil du contact sur ce canal : chaque version, et laquelle a été validée. */
export function useDraftThread(contactId: string, channel: ApproachChannel) {
  const { user } = useSession()
  return useQuery({
    queryKey: threadKey(contactId, channel),
    queryFn: async () => {
      const res = await apiFetch<{ items: MessageDraftVersionItem[] }>({
        path: `/contacts/${contactId}/message-draft-versions?channel=${encodeURIComponent(channel)}`,
        method: 'GET',
      })
      return res?.items ?? []
    },
    enabled: !!user && contactId.length > 0,
    staleTime: 15_000,
  })
}

/** La dernière version validée du fil : c'est ce texte-là, et nul autre, qui a été relu. */
export function latestValidated(items: MessageDraftVersionItem[]): DraftContent | null {
  const validated = [...items].reverse().find(item => Boolean(item.validatedAt))
  return validated ? effectiveContent(validated) : null
}

/**
 * Pose le texte à l'écran dans le fil (« Enregistrer le brouillon ») : une version existante au contenu identique est
 * réutilisée, sinon une NOUVELLE ligne s'ajoute — on ne corrige jamais une version. Rien n'est envoyé.
 */
async function ensureVersion(
  contactId: string,
  channel: ApproachChannel,
  existing: MessageDraftVersionItem[],
  generated: DraftContent,
  current: DraftContent,
): Promise<MessageDraftVersionItem> {
  const match = [...existing].reverse().find(item => sameDraftContent(effectiveContent(item), current))
  if (match) return match
  const edited = !sameDraftContent(generated, current)
  const res = await apiFetch<{ item: MessageDraftVersionItem }>({
    path: `/contacts/${contactId}/message-draft-versions`,
    method: 'POST',
    body: {
      channel,
      subject: (edited ? generated.subject : current.subject) || undefined,
      body: edited ? generated.body : current.body,
      ...(edited ? { editedSubject: current.subject || undefined, editedBody: current.body } : {}),
    },
  })
  return res.item
}

type SaveArgs = {
  contactId: string
  channel: ApproachChannel
  existing: MessageDraftVersionItem[]
  generated: DraftContent
  current: DraftContent
}

export function useSaveDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ contactId, channel, existing, generated, current }: SaveArgs) =>
      ensureVersion(contactId, channel, existing, generated, current),
    onSuccess: (_item, { contactId, channel }) => {
      void queryClient.invalidateQueries({ queryKey: threadKey(contactId, channel) })
      void queryClient.invalidateQueries({ queryKey: ['message-drafts', 'mine'] })
    },
  })
}

/** « Valider le brouillon » : relue puis validée, la version porte sa validation. Aucun envoi. */
export function useValidateDraft() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (args: SaveArgs): Promise<MessageDraftValidation> => {
      const version = await ensureVersion(args.contactId, args.channel, args.existing, args.generated, args.current)
      const res = await apiFetch<{ validation: MessageDraftValidation }>({
        path: `/message-drafts/${version.id}/validate`,
        method: 'POST',
      })
      return res.validation
    },
    onSuccess: (_validation, { contactId, channel }) => {
      void queryClient.invalidateQueries({ queryKey: threadKey(contactId, channel) })
      void queryClient.invalidateQueries({ queryKey: ['message-drafts', 'mine'] })
    },
  })
}

/**
 * #4524.4 — le COMPTE de la personne (« Guerbet »), pas le nom d'entité de son poste. Même clé que `useAccount` et
 * `useAccountRawAnalysis` : aucune requête de plus. `ready` dit que la lecture du compte est terminée (réussie ou non) :
 * la rédaction automatique l'attend, pour que les faits cochés d'emblée soient bien ceux qui partent au moteur.
 */
export function useApproachAccount(accountId: string | null | undefined) {
  const { user } = useSession()
  const enabled = Boolean(accountId) && !!user
  const query = useQuery<Account>({
    queryKey: accountKeys.detail(accountId ?? ''),
    queryFn: () => accountsApi.getOne(accountId!),
    enabled,
    staleTime: 60_000,
  })
  // #4524.9 — `website` : le site du compte, pour écarter les faits d'un homonyme (même lecture que la veille).
  return {
    companyName: query.data?.company_name?.trim() || null,
    website: query.data?.website ?? null,
    ready: !enabled || !query.isPending,
  }
}
