import { Logger } from '@nestjs/common'

/**
 * QUI A ÉCRIT, QUI A ÉPINGLÉ — LA règle d'auteur de l'API, écrite une fois (GA-26).
 *
 * Deux appelants : l'auteur d'un message de Laura dans un fil partagé (#1940.4,
 * `resolveChatAuthors`) et l'auteur d'un élément de mémoire, ou de chaque geste
 * de son historique (#1916.16 / #1916.23, `MemoryService`). Ils l'avaient écrite
 * chacun à l'identique le même jour ; deux copies d'une règle d'identité
 * divergent au premier changement.
 *
 * Ce que l'auteur est, et ce qu'il n'est pas :
 *  - un PRÉNOM et un AVATAR, jamais l'adresse e-mail ni l'identifiant — l'écran
 *    n'a besoin que de reconnaître quelqu'un ;
 *  - résolu parmi les MEMBRES DE L'ESPACE LU : un identifiant qui n'y figure pas
 *    (collègue parti, ligne d'une autre ESN) ne rend rien ;
 *  - absent pour un compte EFFACÉ (`profiles.anonymized_at`, ou identifiant remis
 *    à `null` par l'effacement) et pour un prénom blanc — l'écran ne comble
 *    jamais un trou par une valeur de remplissage ;
 *  - un avatar en `https` seulement : il finit dans un `src`.
 *
 * ⚠️ Une photo s'AFFICHE, elle ne classe rien (doctrine « critères protégés ») :
 * cette identité ne part dans aucun prompt et ne pèse dans aucun rang.
 */
export type WorkspaceAuthor = { firstName: string; avatarUrl: string | null }

/** Ce dont la règle a besoin d'une connexion : une requête paramétrée (l'`EntityManager` en production). */
type SqlRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

type MemberProfileRow = { userId?: string | null; firstName?: string | null; avatarUrl?: string | null }

const logger = new Logger('WorkspaceAuthors')

const WORKSPACE_AUTHORS_SQL = `SELECT m.user_id AS "userId", p.first_name AS "firstName", p.avatar_url AS "avatarUrl"
   FROM workspace_members m
   JOIN profiles p ON p.user_id = m.user_id
  WHERE m.workspace_id = $1
    AND m.user_id = ANY($2::uuid[])
    AND p.anonymized_at IS NULL`

/**
 * Les auteurs connus, par identifiant, pour des lignes d'UN espace.
 *
 * Accepte des identifiants nuls (effacement d'un compte) : rien à résoudre. Une
 * lecture en échec rend une carte VIDE — l'écran s'affiche sans prénoms plutôt
 * que de ne pas s'afficher, et jamais avec un prénom deviné. `readFor` nomme
 * l'écran dans le journal, rien d'autre.
 */
export async function resolveWorkspaceAuthors(
  runner: SqlRunner,
  workspaceId: string,
  userIds: ReadonlyArray<string | null | undefined>,
  readFor = 'lignes',
): Promise<Map<string, WorkspaceAuthor>> {
  const authors = new Map<string, WorkspaceAuthor>()
  const wanted = [...new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0))]
  if (wanted.length === 0) return authors

  let rows: MemberProfileRow[]
  try {
    rows = ((await runner.query(WORKSPACE_AUTHORS_SQL, [workspaceId, wanted])) as MemberProfileRow[] | null) ?? []
  } catch (error) {
    logger.warn(`Auteurs illisibles (${readFor}), rendus sans prénoms: ${String(error)}`)
    return authors
  }

  for (const row of rows) {
    const firstName = row?.firstName?.trim()
    if (!row?.userId || !firstName) continue
    authors.set(row.userId, { firstName, avatarUrl: safeAvatarUrl(row.avatarUrl) })
  }
  return authors
}

/** Une adresse https, ou rien : l'avatar finit dans un `src`, pas question d'y laisser passer un autre schéma. */
function safeAvatarUrl(value: string | null | undefined): string | null {
  const url = value?.trim()
  return url && /^https:\/\//i.test(url) ? url : null
}
