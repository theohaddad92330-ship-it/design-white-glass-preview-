import { useQuery } from '@tanstack/react-query'
import { useMemo } from 'react'
import type { OutreachMessage } from '@bellum/contracts'
import { outreachKeys, outreachMessagesApi } from '@/features/outreach/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * #2366.1 — les messages canoniques d'UN contact : le MÊME objet
 * (`outreach_messages`) que lit le centre d'approbation Outreach, filtré
 * côté serveur par `contact_id` — jamais une copie propre à la fiche Contact.
 */
export function useOutreachMessages(contactId: string) {
  const { user } = useSession()
  return useQuery<OutreachMessage[]>({
    queryKey: outreachKeys.messages(undefined, contactId),
    queryFn: () => outreachMessagesApi.list(undefined, contactId),
    enabled: !!user && contactId.length > 0,
  })
}

/**
 * #2366.2 — un message canonique par IDENTIFIANT : la carte de Laura relit
 * cet objet plutôt que de garder pour toujours le texte figé au moment de sa
 * génération, donc une édition faite ailleurs (centre d'approbation) s'y
 * reflète.
 */
export function useOutreachMessage(id: string | undefined) {
  const { user } = useSession()
  return useQuery<OutreachMessage>({
    queryKey: outreachKeys.message(id ?? ''),
    queryFn: () => outreachMessagesApi.get(id as string),
    enabled: !!user && !!id,
  })
}

/**
 * #2877 — les contacts dont un message est BLOQUÉ dans le centre d'approbation
 * (`view: 'blocked'`). La MÊME lecture que ce centre (même clé de requête, donc
 * un seul appel) : « bloqué » ne se définit qu'une fois, pour l'onglet comme
 * pour la carte « Bloquées » des séquences.
 */
export function useBlockedMessageContactIds(): ReadonlySet<string> {
  const { user } = useSession()
  const { data } = useQuery<OutreachMessage[]>({
    queryKey: outreachKeys.messages(),
    queryFn: () => outreachMessagesApi.list(),
    enabled: !!user,
  })
  return useMemo(
    () => new Set((data ?? []).filter(message => message.view === 'blocked').map(message => message.contact_id)),
    [data],
  )
}
