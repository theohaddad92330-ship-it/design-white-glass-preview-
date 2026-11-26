import { useMutation, useQueryClient } from '@tanstack/react-query'
import { accountsApi } from '@/features/accounts/api'
import { projectsApi, projectQueryKeys } from '../api'

/**
 * #2174.1 / #2174.14 — LE PROJET IMPLICITE, et la résolution d'entité qui va
 * avec (arbitrage de Louis du 16/09/2026).
 *
 * ─────────────────────────────────────────────────────────────────────────
 * DEUX GESTES, UN SEUL CLIC — ET DANS CET ORDRE
 * ─────────────────────────────────────────────────────────────────────────
 * Un projet n'existe pas sans compte (`opportunities.account_id` est NOT
 * NULL). Quand le commercial tape un nom d'entreprise que le portefeuille ne
 * connaît pas, il faut donc RÉSOUDRE l'entreprise avant de créer le projet.
 *
 * ⚠️ Cette résolution n'est PAS à écrire : `POST /accounts/portfolio`
 * (`accountsApi.addToPortfolio`) la fait déjà depuis Découvrir (D6) — « crée le
 * compte s'il n'existe pas, ne duplique jamais, aucun crédit débité ». La
 * rejouer ici en aurait fait une deuxième, et deux résolutions d'entité
 * divergent au premier cas limite.
 *
 * L'ordre compte : le compte D'ABORD, le projet ENSUITE. L'inverse n'existe
 * pas, et un échec à la première étape ne laisse rien derrière lui — le compte
 * créé sans projet reste un compte du portefeuille, qui est un état légitime.
 */
/**
 * #2558.1 — LE CLIENT SEUL, sans projet derrière.
 *
 * Même résolution d'entité que ci-dessous — `POST /accounts/portfolio`, celle
 * de Découvrir (D6) : « crée le compte s'il n'existe pas, ne duplique jamais,
 * aucun crédit débité ». Ce qui change est ce qu'on fait ENSUITE : rien. La
 * majorité des missions d'ESN ne produisent aucun signal public (retour bêta
 * du 17/09/2026) ; leur ouvrir une affaire vide pour pouvoir enregistrer le
 * besoin fabriquait de la donnée creuse.
 *
 * Un compte du portefeuille sans projet est un état parfaitement légitime —
 * c'est déjà ce que dit le docblock de `useCreateImplicitProject` sur son
 * chemin d'échec.
 */
export function useResolveAccountForNeed() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (companyName: string): Promise<string> => {
      const account = await accountsApi.addToPortfolio({ company_name: companyName.trim() })
      return account.id
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    },
  })
}

export function useCreateImplicitProject() {
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (companyName: string): Promise<{ projectId: string; accountId: string }> => {
      const account = await accountsApi.addToPortfolio({ company_name: companyName.trim() })
      // Le projet porte le nom du COMPTE tel que la résolution l'a rendu, pas
      // la saisie : « acme » tapé à la volée devient « ACME », et deux
      // saisies différentes du même nom ne font pas deux projets.
      // #2174.1 / #2195.33 — UNE SEULE porte de création (`POST /projects`), et
      // elle rend l'affaire entière : ce parcours n'en lit que l'identifiant.
      const { project } = await projectsApi.create({ account_id: account.id, label: account.company_name })
      return { projectId: project.id, accountId: account.id }
    },
    onSuccess: () => {
      // Le nouveau projet doit apparaître dans la liste que l'étape 1 lit,
      // sinon le besoin se rattacherait à un identifiant absent de l'écran.
      void queryClient.invalidateQueries({ queryKey: ['opportunities', 'list'] })
      void queryClient.invalidateQueries({ queryKey: projectQueryKeys.all })
    },
  })
}
