import { useQuery } from '@tanstack/react-query'
import { useSession } from '@/lib/hooks/use-session'
import { contactsApi } from '../api'

/**
 * #2159.26 — les étiquettes EN USAGE sur les contacts de l'espace, options du
 * filtre « Étiquette ». Cache long : la liste ne bouge qu'à un import.
 *
 * `enabled: !!user` — même patron que ses voisins (`useContactsReadyToProcessCount`,
 * `useAccountTags`/`useAccountCompanies`) : `GET /contacts/tags` est une route
 * authentifiée, elle n'a rien à répondre avant que l'utilisateur soit résolu.
 * Sans ce garde, la requête partait AVANT la session — mesuré : `ContactContent`
 * (et tout écran monté sans utilisateur encore résolu) recevait une réponse
 * qui n'était pas un tableau et `tags.map` jetait.
 */
export function useContactTags() {
  const { user } = useSession()
  return useQuery<string[]>({
    queryKey: ['contacts', 'tags'],
    queryFn: () => contactsApi.listTags(),
    enabled: !!user,
    staleTime: 5 * 60_000,
  })
}
