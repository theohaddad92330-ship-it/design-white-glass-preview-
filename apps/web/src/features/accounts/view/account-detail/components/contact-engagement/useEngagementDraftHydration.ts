import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { ConversationEntry } from './conversation'
import { draftKey, type EngagementDraftStore } from './draft-store'
import type { MessageParameters } from './message-parameters'
import { contactsApi } from '@/features/contacts/api'
import type { EngagementChannel } from './types'

/**
 * #3694.7 — lit le brouillon confirmé (brief + fil) depuis le serveur, à
 * l'OUVERTURE du panneau, et le pose dans le magasin partagé (`drafts.hydrate`,
 * sans écraser un brouillon déjà tapé pendant le chargement). Volontairement
 * SÉPARÉ de `useEngagementConversation` : ce hook, très sollicité par ses
 * propres tests, mesure déjà « un seul appel `/ia/message` » sur plusieurs
 * scénarios — y ajouter un appel RÉSEAU automatique au montage y mélangerait
 * deux files d'attente de réponses mockées. Ici, l'appel est le SEUL du hook.
 *
 * Rend `hydrated` : `true` dès que la lecture est TERMINÉE (succès ou échec)
 * — `useEngagementConversation` s'en sert pour savoir si la fermeture a le
 * droit d'écrire (jamais avant, sous peine d'écraser un brouillon pas encore
 * reçu par un cliché vide).
 */
export function useEngagementDraftHydration(
  drafts: EngagementDraftStore | undefined,
  contactId: string,
  channel: EngagementChannel,
): { hydrated: boolean } {
  const key = draftKey(contactId, channel)
  const query = useQuery({
    queryKey: ['engagement-draft', contactId, channel],
    queryFn: () => contactsApi.getEngagementDraft(contactId, channel),
    enabled: Boolean(drafts),
    // Un brouillon confirmé ne change pas sous nos pieds pendant que le
    // panneau reste ouvert sur cette clé : relire à chaque focus n'aiderait
    // personne, et ferait flasher le fil pour rien.
    staleTime: Infinity,
    retry: false,
  })

  useEffect(() => {
    if (!drafts || !query.data) return
    drafts.hydrate(key, {
      // #3694.7 — JSON opaque côté contrat (il ne connaît pas les formes
      // `ConversationEntry`/`MessageParameters`, propres au client) : c'est
      // notre propre écho, jamais une entrée devinée.
      entries: query.data.entries as unknown as ConversationEntry[],
      context: query.data.context,
      parameters: query.data.parameters as MessageParameters,
    })
  }, [drafts, key, query.data])

  return { hydrated: !drafts || query.isFetched }
}
