import { resolveWorkspaceAuthors, type WorkspaceAuthor } from '../../common/workspace-authors'

/**
 * #1940.4 — QUI A ÉCRIT CE MESSAGE, dans un fil partagé.
 *
 * `chat_messages.user_id` porte l'auteur depuis toujours (écrit par
 * `ChatMessagesService.create` depuis le JWT, jamais depuis le corps) : aucune
 * migration n'était nécessaire, c'est la LECTURE qui manquait. Le fil est une
 * ressource d'équipe (lu par `workspace_id`) — sans auteur, la question d'un
 * collègue et la mienne étaient deux bulles identiques.
 *
 * La RÈGLE (prénom + avatar, membres de l'espace lu, jamais un compte effacé,
 * avatar https seul, jamais d'e-mail ni d'identifiant) vit à UN endroit,
 * `common/workspace-authors.ts`, partagé avec la mémoire de Laura (#1916.16) —
 * deux copies d'une règle d'identité divergeraient au premier changement.
 */
export type ChatMessageAuthor = WorkspaceAuthor

/**
 * Les auteurs, par `user_id`, pour les messages d'UN espace. Accepte des
 * `user_id` nuls (migration `ChatMessageAuthorNullable`) ; une lecture qui
 * échoue rend une carte vide — le fil s'affiche sans prénoms.
 */
export function resolveChatAuthors(
  runner: Parameters<typeof resolveWorkspaceAuthors>[0],
  workspaceId: string,
  userIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, ChatMessageAuthor>> {
  return resolveWorkspaceAuthors(runner, workspaceId, userIds, 'messages du fil')
}
