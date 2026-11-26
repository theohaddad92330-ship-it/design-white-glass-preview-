import { BadRequestException } from '@nestjs/common'
import { IsNull, Like } from 'typeorm'
import type { FindOptionsOrder, FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm'

/**
 * Une boîte mail est PERSONNELLE. Un CRM est d'espace.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUE CE FICHIER CORRIGE
 * ─────────────────────────────────────────────────────────────────────────────
 * `google_connections` et `microsoft_connections` portent un index UNIQUE sur
 * `(user_id, provider)` — donc une ligne PAR MEMBRE — et toutes les lectures se
 * faisaient par `workspace_id`, avec un `findOne` sans ordre. Dans un espace où
 * deux commerciaux avaient connecté leur compte, « Ma journée » de l'un pouvait
 * lire le Gmail de l'autre, `getValidAccessToken` rendait le jeton DÉCHIFFRÉ
 * d'un collègue, et « Déconnecter » supprimait la connexion de quelqu'un
 * d'autre.
 *
 * Ce n'était pas un arbitrage produit : le PDF 7 l'inscrit noir sur blanc
 * (BEL-INT-604, « un connecteur personnel n'est jamais visible par un autre
 * membre »), et la migration d'origine avait supposé un espace à un seul siège.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * #3087 — LE REPLI EST RETIRÉ (décision Louis, 26/09/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un premier correctif lisait encore la connexion de l'espace tant que le
 * membre courant n'avait pas la sienne, pour ne pas éteindre la messagerie
 * d'un espace à une seule connexion existante. Un client bêta à deux sièges a
 * montré que ce repli est justement le trou : un admin qui a connecté SON
 * compte Google reste lu par tout collègue sans connexion propre. Une boîte
 * mail est PERSONNELLE, sans exception de confort — un membre sans connexion
 * ne voit AUCUN e-mail et l'écran l'invite à connecter la sienne
 * (`GoogleConnectNotice` / `useGoogleStatus().connected === false`).
 */
/** Les colonnes que porte toute table de connexion du dépôt. */
type ConnectionRow = ObjectLiteral & {
  user_id: string
  workspace_id: string | null
  provider: string
  created_at: Date
}

export async function findPersonalConnection<T extends ConnectionRow>(
  repo: Repository<T>,
  input: { userId: string; workspaceId: string | null; provider: string },
): Promise<T | null> {
  // `FindOptionsWhere<T>` sur un T générique : TypeORM ne sait pas prouver
  // qu'un littéral partiel lui correspond. La CONTRAINTE ci-dessus, elle,
  // garantit que les trois colonnes existent — c'est elle qui rend la
  // conversion honnête, là où un `as never` aurait simplement éteint le typage.
  const ownWhere = { user_id: input.userId, provider: input.provider } as FindOptionsWhere<T>
  return repo.findOne({ where: ownWhere })
}

/** Connexion avec `external_account_id` — #4546 plusieurs boîtes par commercial. */
type ConnectionRowWithMailbox = ConnectionRow & { external_account_id: string | null }

/**
 * #4546 — Cherche une connexion par son `external_account_id` (l'adresse ou l'id
 * de la boîte). C'est cette fonction qui permet PLUSIEURS connexions par
 * fournisseur : reconnecter la même boîte met à jour, connecter une autre boîte
 * crée une nouvelle ligne.
 */
export async function findConnectionByMailbox<T extends ConnectionRowWithMailbox>(
  repo: Repository<T>,
  input: { userId: string; provider: string; externalAccountId: string },
): Promise<T | null> {
  const where = {
    user_id: input.userId,
    provider: input.provider,
    external_account_id: input.externalAccountId,
  } as FindOptionsWhere<T>
  return repo.findOne({ where })
}

/**
 * #4546 — Liste TOUTES les connexions d'un utilisateur pour un fournisseur.
 */
export async function findAllPersonalConnections<T extends ConnectionRow>(
  repo: Repository<T>,
  input: { userId: string; provider: string },
): Promise<T[]> {
  const where = { user_id: input.userId, provider: input.provider } as FindOptionsWhere<T>
  const order = { created_at: 'DESC' } as FindOptionsOrder<T>
  return repo.find({ where, order })
}

/**
 * #4546 — La boîte SANS adresse lisible : `external_account_id` NULL, ou le
 * `legacy:<uuid>` que la migration a posé sur les connexions d'avant. Quand le
 * fournisseur ne rend pas l'adresse (portée de profil absente), on ne peut pas
 * dire de quelle boîte il s'agit : on ne met à jour QUE une boîte déjà sans nom,
 * jamais une boîte nommée — sinon la seconde écraserait la première en silence.
 */
export async function findUnnamedConnection<T extends ConnectionRowWithMailbox>(
  repo: Repository<T>,
  input: { userId: string; provider: string },
): Promise<T | null> {
  const base = { user_id: input.userId, provider: input.provider }
  const where = [
    { ...base, external_account_id: IsNull() },
    { ...base, external_account_id: Like('legacy:%') },
  ] as FindOptionsWhere<T>[]
  return repo.findOne({ where })
}

/**
 * #4546 — Quelle boîte débrancher. Une désignée (`connectionId`) : celle-là, si
 * elle est au demandeur. Aucune désignée : permis seulement s'il n'en a qu'UNE ;
 * à plusieurs, on refuse plutôt que de deviner laquelle disparaît.
 */
export async function resolveDisconnectTarget<T extends ConnectionRow>(
  repo: Repository<T>,
  input: { userId: string; provider: string; connectionId?: string },
): Promise<T | null> {
  if (input.connectionId) {
    const where = {
      id: input.connectionId,
      user_id: input.userId,
      provider: input.provider,
    } as unknown as FindOptionsWhere<T>
    return repo.findOne({ where })
  }
  const all = await findAllPersonalConnections(repo, input)
  if (all.length > 1) {
    throw new BadRequestException('Plusieurs boîtes sont branchées : désignez celle à débrancher.')
  }
  return all[0] ?? null
}
