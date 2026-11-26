import { useMutation, useQueryClient } from '@tanstack/react-query'
import { targetListsApi } from './api'
import { pickExactCandidate } from './lib/import-list'

/** Ce qui s'est RÉELLEMENT passé — jamais estimé, même discipline que
 *  `useCreateTargetListFromContacts`. Non exporté : seul ce fichier le lit
 *  (`pnpm lint:exports:types`). */
type ImportTargetListOutcome = {
  listId: string
  added: number
  /** Les noms collés SANS correspondance certaine dans l'espace — jamais
   *  inventés, jamais tus. */
  unmatched: string[]
}

type ImportTargetListInput = { listName: string; names: readonly string[] }

/**
 * #2156.55 — « Importer une liste ». Crée la liste (`source: 'import'`), puis
 * cherche CHAQUE nom collé parmi les fiches déjà dans l'espace
 * (`targetListsApi.candidates`) : une correspondance exacte et unique devient
 * un élément (`provenance: 'import'`), tout le reste — introuvable ou
 * ambigu — reste un nom NON TROUVÉ, jamais une fiche créée à la volée
 * (`addTargetListItemSchema` exige un `ref_id` réel).
 *
 * Une correspondance en échec n'interrompt pas les suivantes : comptée,
 * annoncée, comme `useCreateTargetListFromContacts` le fait déjà.
 */
export function useImportTargetList() {
  const queryClient = useQueryClient()

  return useMutation<ImportTargetListOutcome, Error, ImportTargetListInput>({
    mutationKey: ['target-lists', 'import'],
    mutationFn: async ({ listName, names }) => {
      const list = await targetListsApi.create({ name: listName, source: 'import' })
      let added = 0
      const unmatched: string[] = []
      for (const name of names) {
        const candidates = await targetListsApi.candidates(name)
        const match = pickExactCandidate(name, candidates)
        if (!match) {
          unmatched.push(name)
          continue
        }
        try {
          await targetListsApi.addItem(list.id, { kind: match.kind, ref_id: match.id, provenance: 'import' })
          added += 1
        } catch {
          unmatched.push(name)
        }
      }
      return { listId: list.id, added, unmatched }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['target-lists'] })
    },
  })
}
