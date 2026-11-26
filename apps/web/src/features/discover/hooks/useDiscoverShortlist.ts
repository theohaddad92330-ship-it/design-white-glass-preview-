import { useCallback, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useSession } from '@/lib/hooks/use-session'
import { accountsApi } from '@/features/accounts/api'
import {
  dismissCandidate,
  followCandidate,
  readShortlist,
  undismissCandidate,
  unfollowCandidate,
  type DiscoverShortlist,
} from '@/features/discover/lib/discover-shortlist'

/** Ce dont le serveur a besoin pour créer le compte — rien de plus que ce que
 *  le registre a déjà donné au candidat. */
interface PortfolioCandidate {
  siren: string
  name: string
  sector?: string | null
}

interface UseDiscoverShortlist {
  followed: ReadonlySet<string>
  dismissed: ReadonlySet<string>
  toggleFollow: (candidate: PortfolioCandidate) => void
  dismiss: (siren: string) => void
  restoreAllDismissed: (sirens: readonly string[]) => void
}

/**
 * État des deux actions GRATUITES de Découvrir (« Ajouter à mon portefeuille »,
 * « Écarter »).
 *
 * Le portefeuille est SERVEUR depuis la décision D6 : ajouter un candidat crée
 * (ou réattribue) le compte et l'attribue à son commercial — le libellé dit
 * enfin ce que le geste fait. La liste locale reste, mais uniquement comme
 * écho immédiat de l'UI : on bascule tout de suite, on appelle l'API, et on
 * REVIENT en arrière si le serveur refuse. Sans ce retour arrière, l'écran
 * afficherait un compte au portefeuille que personne ne possède.
 *
 * Aucun crédit n'est débité : seule l'analyse en consomme.
 */
export function useDiscoverShortlist(): UseDiscoverShortlist {
  const { user } = useSession()
  const userId = user?.id
  const { t } = useTranslation('discover')
  const queryClient = useQueryClient()
  const [list, setList] = useState<DiscoverShortlist>(() => readShortlist(userId))

  const toggleFollow = useCallback(
    (candidate: PortfolioCandidate) => {
      const { siren } = candidate
      const wasFollowed = list.followed.has(siren)

      setList(wasFollowed ? unfollowCandidate(userId, siren) : followCandidate(userId, siren))

      const request = wasFollowed
        ? accountsApi.removeFromPortfolio(siren)
        : accountsApi.addToPortfolio({
            company_name: candidate.name,
            siren,
            ...(candidate.sector ? { sector: candidate.sector } : {}),
          })

      request
        .then(response => {
          // Le portefeuille a changé côté serveur : la liste des comptes doit
          // le refléter sans rechargement.
          void queryClient.invalidateQueries({ queryKey: ['accounts'] })

          // #2149.30 — CONTINUITÉ DÉCOUVRIR → COMPTES : suivre un candidat
          // l'attribue vraiment (D6), mais CE candidat garde `accountId: null`
          // en mémoire tant que la recherche Découvrir elle-même n'est pas
          // rejouée — `invalidateQueries` ne touche que la clé `accounts`,
          // jamais `discover`, pour ne pas relancer une recherche payante.
          // La réponse d'`addToPortfolio` porte déjà l'id du compte créé ou
          // réattribué : c'est la SEULE source fraîche d'un lien direct.
          if (!wasFollowed && 'id' in response) {
            toast.success(t('actions.addedToPortfolio'), {
              action: {
                label: t('actions.seeInAccounts'),
                onClick: () => {
                  // Import dynamique : `@/router` importe `routeTree.gen`, qui
                  // importe TOUTES les routes — un import statique rendrait ce
                  // hook, monté sur /discover, dépendant de l'arbre entier
                  // (même raison que `useLogout.ts`).
                  void import('@/router').then(({ router }) => {
                    void router.navigate({ to: '/accounts/$id', params: { id: response.id } })
                  })
                },
              },
            })
            return
          }

          toast.success(wasFollowed ? t('actions.removedFromPortfolio') : t('actions.addedToPortfolio'))
        })
        .catch(() => {
          setList(wasFollowed ? followCandidate(userId, siren) : unfollowCandidate(userId, siren))
          toast.error(t('actions.portfolioFailed'))
        })
    },
    [list.followed, queryClient, t, userId],
  )

  const dismiss = useCallback((siren: string) => setList(dismissCandidate(userId, siren)), [userId])

  const restoreAllDismissed = useCallback(
    (sirens: readonly string[]) => {
      let next = readShortlist(userId)
      for (const siren of sirens) next = undismissCandidate(userId, siren)
      setList(next)
    },
    [userId],
  )

  return { followed: list.followed, dismissed: list.dismissed, toggleFollow, dismiss, restoreAllDismissed }
}
