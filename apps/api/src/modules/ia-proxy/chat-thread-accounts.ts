import { Logger } from '@nestjs/common'

/**
 * #1911.10 — le NOM du compte de chaque fil de Laura, pour ranger la liste
 * « par compte » (décision de Louis du 13/09/2026, batch 11).
 *
 * POURQUOI ICI ET PAS DANS LE NAVIGATEUR. L'écran connaissait les comptes par
 * `useAccounts` — la PREMIÈRE page du portefeuille (25 comptes). Un fil ouvert
 * sur le 26e n'aurait eu aucun nom à afficher, et l'intercalaire n'a pas le
 * droit de le remplacer par un identifiant. La liste des fils est lue ici, le
 * nom de leur compte l'est donc au même endroit, en une requête.
 *
 * Ce que le nom est, et ce qu'il n'est pas (même patron que `chat-message-authors.ts`) :
 *  - lu parmi les comptes de l'ESPACE LU : un `account_id` d'un autre espace ne
 *    rend rien — le nom d'un compte d'une autre ESN ne traverse pas, même par un
 *    message mal rangé ;
 *  - absent quand il est blanc : un intercalaire vide n'apprend rien, et l'écran
 *    ne comble jamais un trou par une valeur de remplissage ;
 *  - absent quand la lecture échoue : la liste s'affiche sans noms (« compte
 *    introuvable ») plutôt que de ne pas s'afficher.
 */

/** Ce dont le résolveur a besoin d'une connexion : une requête paramétrée. */
type SqlRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

type AccountNameRow = { id: string; companyName: string | null }

const logger = new Logger('ChatThreadAccounts')

/**
 * Seuls des uuid partent : `chat_messages.account_id` en est un, mais un seul
 * identifiant malformé ferait échouer le cast `::uuid[]` de TOUTE la requête —
 * et tous les fils perdraient leur nom pour un seul.
 */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const ACCOUNT_NAMES_SQL = `SELECT a.id AS "id", a.company_name AS "companyName"
   FROM accounts a
  WHERE a.workspace_id = $1
    AND a.id = ANY($2::uuid[])`

/** Les noms lisibles, par `account_id`, pour les fils d'UN espace. */
export async function resolveThreadAccountNames(
  runner: SqlRunner,
  workspaceId: string,
  accountIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
  const ids = [...new Set(accountIds.filter((id): id is string => typeof id === 'string' && UUID.test(id)))]
  const names = new Map<string, string>()
  if (ids.length === 0) return names

  let rows: AccountNameRow[]
  try {
    rows = ((await runner.query(ACCOUNT_NAMES_SQL, [workspaceId, ids])) as AccountNameRow[] | null) ?? []
  } catch (error) {
    // Le NOM de l'erreur seulement : un message SQL peut recopier des valeurs liées.
    logger.warn(
      `Noms des comptes des fils illisibles, la liste est rendue sans eux (${error instanceof Error ? error.name : typeof error})`,
    )
    return names
  }

  for (const row of rows) {
    const name = row?.companyName?.trim()
    if (row?.id && name) names.set(row.id, name)
  }
  return names
}
