import { useQuery } from '@tanstack/react-query'
import type { ContactSendability } from '@bellum/contracts'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { useSession } from '@/lib/hooks/use-session'

/**
 * « Puis-je envoyer un email à ce contact ? », demandé au serveur.
 *
 * Le désabonnement vit dans `email_suppression` (workspace + email) : le client
 * ne peut pas le déduire du contact. Sans cet appel, le commercial peut peaufiner
 * un brouillon destiné à quelqu'un qui ne le recevra jamais — l'envoi n'échouant
 * qu'au tout dernier moment.
 *
 * `enabled` garde l'appel ciblé : uniquement quand un envoi est réellement
 * envisageable à l'écran (canal email, brouillon courant, pas déjà envoyé).
 */
export function useContactSendability(id: string, enabled: boolean) {
  const { user } = useSession()
  return useQuery<ContactSendability>({
    queryKey: contactKeys.sendability(id),
    queryFn: () => contactsApi.getSendability(id),
    enabled: !!user && id.length > 0 && enabled,
    staleTime: 60_000,
  })
}
