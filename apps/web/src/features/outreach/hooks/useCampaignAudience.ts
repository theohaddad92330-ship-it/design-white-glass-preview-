import { useQueries } from '@tanstack/react-query'
import { contactKeys, contactsApi } from '@/features/contacts/api'
import { ApiError } from '@/lib/api-error'
import { useSession } from '@/lib/hooks/use-session'
import { campaignAudience, type CampaignAudience, type CampaignAudienceRead } from '../campaign-audience'

/**
 * #1935.25 — RELIRE LES FICHES D'UNE CAMPAGNE ANNONCÉE PAR L'URL.
 *
 * L'URL ne porte que des identifiants (`campaign-prefill.ts`). Sans cette
 * relecture, l'écran ne pourrait rien pré-remplir : la fenêtre de création
 * attend des contacts, pas des ids — et surtout, elle ne saurait pas dire ce
 * qui a changé depuis la proposition de Laura.
 *
 * ⚠️ AUCUNE ÉCRITURE ici, et aucun appel quand l'URL ne porte aucun contact :
 * le copilote prépare, l'utilisateur décide. La même clé de cache que la fiche
 * contact (`contactKeys.detail`) : ouvrir une campagne réchauffe les fiches que
 * l'écran de détail relira, et inversement — jamais deux lectures pour la même
 * donnée.
 */
export function useCampaignAudience(contactIds: readonly string[]): CampaignAudience {
  const { user } = useSession()
  const results = useQueries({
    queries: contactIds.map(id => ({
      queryKey: contactKeys.detail(id),
      queryFn: () => contactsApi.getOne(id),
      enabled: !!user,
      staleTime: 30_000,
      /**
       * Pas de reprise : une fiche absente rend 404, et réessayer trois fois un
       * 404 ne la fera pas apparaître. Une lecture qui échoue autrement est
       * NOMMÉE « non lue » à l'écran — c'est plus honnête qu'une attente muette,
       * et la personne peut recharger.
       */
      retry: false,
    })),
  })

  // Pas de mémorisation : `useQueries` rend un tableau neuf à chaque rendu, donc
  // toute clé de mémo serait une reconstruction déguisée de ce tableau. Le calcul
  // est une passe sur au plus quelques dizaines d'entrées, et ses lecteurs ne
  // dépendent pas de son identité (l'ouverture de la fenêtre est tenue par un
  // `useRef`, pas par une comparaison d'objets).
  const reads: CampaignAudienceRead[] = contactIds.map((id, index) => {
    const result = results[index]
    if (!result || result.isPending) return { id, state: 'pending' }
    if (result.isError) {
      // 404 = un FAIT (« pas dans ce portefeuille ») ; tout le reste est un aveu
      // d'ignorance. Les confondre ferait dire « introuvable » à une panne.
      const notFound = result.error instanceof ApiError && result.error.status === 404
      return { id, state: notFound ? 'missing' : 'unreadable' }
    }
    return result.data ? { id, state: 'read', contact: result.data } : { id, state: 'unreadable' }
  })
  return campaignAudience(reads)
}
