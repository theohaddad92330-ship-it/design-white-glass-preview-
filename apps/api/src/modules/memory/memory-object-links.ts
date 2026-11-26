import { Logger } from '@nestjs/common'
import type { MemoryItemObjectInput, MemoryItemObjectRef, MemoryItemObjectType } from '@bellum/contracts'
import type { MemoryPinnedFactEntity } from '../../database/entities/memory-pinned-fact.entity'

/**
 * #2260.7 — L'OBJET VISÉ par un élément de mémoire : contact, besoin,
 * consultant ou mission, à côté d'`accountId` (le dossier auquel l'élément est
 * ATTACHÉ, #1918.1). Cette moitié du travail est purement STRUCTURELLE : quelle
 * colonne porte quel type, comment lire la ligne, comment résoudre le NOM
 * affiché — jamais le corps d'un message, jamais deviné.
 *
 * Séparée de `memory.service.ts` (déjà 1900 lignes) parce que c'est une brique
 * autonome, testable sans base réelle (`resolveMemoryObjectNames` prend un
 * `runner` simulable — même forme que `resolveWorkspaceAuthors`,
 * `common/workspace-authors.ts`).
 */

/**
 * Les quatre colonnes `uuid`, une par type — jamais deux renseignées à la fois
 * (contrainte `memory_pinned_facts_object_single_check`, migration
 * `1795694318557`). Non exporté : consommé seulement dans ce fichier
 * (`pnpm lint:exports:types`, knip) — `objectColumnsFor`/`objectLinkOf` sont
 * la porte publique, pas cette forme interne.
 */
type MemoryObjectColumns = Pick<MemoryPinnedFactEntity, 'contact_id' | 'need_id' | 'consultant_id' | 'mission_id'>

const OBJECT_COLUMN_BY_TYPE: Readonly<Record<MemoryItemObjectType, keyof MemoryObjectColumns>> = {
  contact: 'contact_id',
  need: 'need_id',
  consultant: 'consultant_id',
  mission: 'mission_id',
}

/** La colonne SQL qui porte CE type — pour une clause `WHERE`, jamais interpolée avec une valeur d'appelant. */
export function objectColumnFor(type: MemoryItemObjectType): keyof MemoryObjectColumns {
  return OBJECT_COLUMN_BY_TYPE[type]
}

/**
 * Les quatre colonnes à ÉCRIRE pour DÉSIGNER cet objet — les trois autres à
 * `null`. `undefined`/`null` en entrée : les quatre à `null` (aucun objet visé,
 * le comportement historique).
 */
export function objectColumnsFor(object: MemoryItemObjectInput | null | undefined): MemoryObjectColumns {
  return {
    contact_id: object?.type === 'contact' ? object.id : null,
    need_id: object?.type === 'need' ? object.id : null,
    consultant_id: object?.type === 'consultant' ? object.id : null,
    mission_id: object?.type === 'mission' ? object.id : null,
  }
}

/** L'objet visé par CETTE ligne, LU depuis ses quatre colonnes — `null` si aucune n'est renseignée. */
export function objectLinkOf(row: MemoryObjectColumns): MemoryItemObjectInput | null {
  if (row.contact_id) return { type: 'contact', id: row.contact_id }
  if (row.need_id) return { type: 'need', id: row.need_id }
  if (row.consultant_id) return { type: 'consultant', id: row.consultant_id }
  if (row.mission_id) return { type: 'mission', id: row.mission_id }
  return null
}

/** La clé d'un lien, pour indexer une `Map` — un type ET un id, jamais l'un sans l'autre. */
export function objectLinkKey(link: Pick<MemoryItemObjectInput, 'type' | 'id'>): string {
  return `${link.type}:${link.id}`
}

/** Ce dont la résolution a besoin d'une connexion : une requête paramétrée (l'`EntityManager` en production). */
type SqlRunner = { query: (sql: string, params?: unknown[]) => Promise<unknown> }

type NamedRow = { id?: string | null; name?: string | null }

/** Le référentiel de CHAQUE type, et sa colonne de nom — jamais interpolé avec une valeur d'appelant. */
const OBJECT_TABLE_BY_TYPE: Readonly<Record<MemoryItemObjectType, { table: string; nameColumn: string }>> = {
  contact: { table: 'contacts', nameColumn: 'full_name' },
  need: { table: 'project_needs', nameColumn: 'title' },
  consultant: { table: 'consultants', nameColumn: 'full_name' },
  mission: { table: 'missions', nameColumn: 'label' },
}

const logger = new Logger('MemoryObjectLinks')

/**
 * Les NOMS des objets visés, par lien (`type:id`), pour des liens d'UN espace.
 *
 * Batché PAR TYPE (au plus quatre requêtes, jamais une par ligne) — même
 * discipline que `resolveWorkspaceAuthors`. Bornée à `workspace_id` : un
 * identifiant qui pointe vers un AUTRE espace ne rend rien (GA-43, le
 * cloisonnement ne s'agrège jamais entre espaces) — ni erreur, ni fuite, juste
 * un nom absent, que l'écran affiche comme tel.
 *
 * Un identifiant sans ligne correspondante (objet disparu du référentiel) et
 * un nom BLANC (candidat sans nom encore saisi, `consultants.full_name`
 * nullable) rendent tous les deux `null` — jamais deviné, jamais tu.
 *
 * Une lecture en échec rend une carte VIDE : l'écran affiche alors les liens
 * sans nom plutôt que de ne pas s'afficher, jamais un nom inventé.
 */
export async function resolveMemoryObjectNames(
  runner: SqlRunner,
  workspaceId: string,
  links: ReadonlyArray<Pick<MemoryItemObjectInput, 'type' | 'id'> | null | undefined>,
): Promise<Map<string, string | null>> {
  const names = new Map<string, string | null>()
  const idsByType = new Map<MemoryItemObjectType, Set<string>>()
  for (const link of links) {
    if (!link) continue
    const set = idsByType.get(link.type) ?? new Set<string>()
    set.add(link.id)
    idsByType.set(link.type, set)
  }
  if (idsByType.size === 0) return names

  for (const [type, idSet] of idsByType) {
    const { table, nameColumn } = OBJECT_TABLE_BY_TYPE[type]
    const wanted = [...idSet]
    // Toutes les lignes visées commencent « non résolues » : un id absent de la
    // réponse (objet disparu, ou hors espace) reste `null`, jamais deviné.
    for (const id of wanted) names.set(objectLinkKey({ type, id }), null)
    try {
      const rows =
        ((await runner.query(
          `SELECT id, ${nameColumn} AS name FROM ${table} WHERE workspace_id = $1 AND id = ANY($2::uuid[])`,
          [workspaceId, wanted],
        )) as NamedRow[] | null) ?? []
      for (const row of rows) {
        if (!row?.id) continue
        const name = row.name?.trim()
        names.set(objectLinkKey({ type, id: row.id }), name && name.length > 0 ? name : null)
      }
    } catch (error) {
      logger.warn(`Objets de mémoire illisibles (${type}), rendus sans nom: ${String(error)}`)
    }
  }
  return names
}

/**
 * Un `MemoryItemObjectRef` complet à partir d'un lien et de la carte de noms
 * déjà résolue — `null` si le lien lui-même est `null` (aucun objet visé).
 */
export function withResolvedName(
  link: MemoryItemObjectInput | null,
  names: ReadonlyMap<string, string | null>,
): MemoryItemObjectRef | null {
  if (!link) return null
  return { type: link.type, id: link.id, name: names.get(objectLinkKey(link)) ?? null }
}
