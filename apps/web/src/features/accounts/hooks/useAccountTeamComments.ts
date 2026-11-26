import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import type { CreateTeamComment } from '@bellum/contracts'
import { teamCommentsApi } from '@/features/manager/api'

/**
 * #2914 (#2128.10) — LE FIL DE COMMENTAIRES D'UN COMPTE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE MANQUE
 * ─────────────────────────────────────────────────────────────────────────────
 * `TeamCommentEntity.account_id` existait, `POST /team-comments` savait déjà
 * l'écrire (le panneau du cockpit manager envoie même `company_name` résolu
 * quand un commentaire cite un compte) — mais AUCUN écran ne pouvait relire
 * « les commentaires DE CE compte » : ils se noyaient dans le fil général de
 * l'espace, invisibles depuis la fiche compte elle-même. #2914 : « aucun fil
 * de commentaire… sur la fiche compte ».
 *
 * Même porte que le cockpit (`GET`/`POST /team-comments`, `teamCommentsApi`) —
 * pas un second chemin d'écriture (GA-26), exactement le patron déjà posé par
 * `useChatComments` (#1940.6, `features/chat/hooks`) pour un fil `/chat` :
 * `account_id` bascule la lecture en chronologique (le plus ancien d'abord),
 * et le serveur re-vérifie l'accès au compte comme l'ouverture de sa fiche.
 */
export const accountCommentKeys = {
  all: ['accounts', 'team-comments'] as const,
  thread: (accountId: string | null) => ['accounts', 'team-comments', 'thread', accountId] as const,
}

/** Les commentaires d'UN compte — `accountId` absent : la requête ne part pas. */
export function useAccountTeamComments(accountId: string | null) {
  return useQuery({
    queryKey: accountCommentKeys.thread(accountId),
    queryFn: () => teamCommentsApi.list(undefined, accountId ?? undefined),
    enabled: !!accountId,
    staleTime: 15_000,
  })
}

/** Poster un commentaire sur le fil de ce compte, puis rafraîchir. */
export function useCreateAccountTeamComment(accountId: string | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: Omit<CreateTeamComment, 'account_id'>) =>
      teamCommentsApi.create({ ...body, account_id: accountId }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: accountCommentKeys.thread(accountId) })
    },
  })
}
