import { getMetadataArgsStorage } from 'typeorm'
import { RETIRED_TABLES, TABLE_SCOPES, type TableScope } from '@bellum/contracts'
import { ENTITIES } from '../../database/database.module'

/**
 * L'INVENTAIRE COMPLET DES TABLES, avec la portée de chacune.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI IL EXISTE, ET POURQUOI `TABLE_SCOPES` NE SUFFISAIT PAS
 * ─────────────────────────────────────────────────────────────────────────────
 * `TABLE_SCOPES` (`packages/contracts`) ne porte QUE les exceptions : les tables
 * dont l'appartenance ne se déduit d'aucune colonne. Il en compte vingt-sept,
 * pas cent quarante — et c'est un choix délibéré, écrit dans son en-tête :
 * « recopier à la main les 127 tables qui portent déjà `workspace_id` ou
 * `user_id` produirait une liste qui diverge du schéma à la première
 * migration ».
 *
 * La section « ce que vous n'emportez pas » a pourtant besoin de la liste
 * ENTIÈRE : dire à un dirigeant ce qu'il laisse derrière en ne regardant que
 * les exceptions serait le contraire d'une réversibilité affichée.
 *
 * On la reconstruit donc comme GA-65 le fait : les métadonnées TypeORM sont la
 * liste que l'application reçoit vraiment au démarrage, et une colonne de
 * portée SUFFIT à classer une table `scoped`. Le registre écrit l'emporte
 * toujours — c'est lui qui sait qu'`impersonation_audit` n'est à personne
 * malgré son `target_user_id`.
 *
 * ⚠️ Cet inventaire vit dans l'API et non dans les contrats : lui aussi
 * dépend de `ENTITIES`, qui n'existe que côté serveur. Le CALCUL, lui
 * (`withheldFromExport`), reste pur et partagé.
 */

/**
 * Les colonnes qui BORNENT une ligne, et elles seules.
 *
 * ⚠️ `owner_user_id`, `author_user_id`, `target_user_id` en sont absentes :
 * ce sont des colonnes d'AUTEUR. Les accepter classerait `impersonation_audit`
 * « d'un utilisateur », ce qui est exactement l'erreur que le registre écrit
 * corrige. Même liste que GA-65, pour la même raison.
 */
const SCOPE_COLUMNS = ['workspace_id', 'user_id'] as const

/** Le nom de table et les colonnes de chaque entité réellement enregistrée. */
function registeredTables(): { name: string; columns: string[] }[] {
  const storage = getMetadataArgsStorage()
  const out: { name: string; columns: string[] }[] = []
  for (const target of ENTITIES) {
    const table = storage.tables.find(entry => entry.target === target)
    if (!table?.name) continue
    // Les colonnes sont attachées à la classe QUI LES DÉCLARE : une entité qui
    // hérite verrait les siennes manquer sans la remontée de prototype.
    const columns: string[] = []
    for (const column of storage.columns) {
      let current: unknown = target
      while (typeof current === 'function') {
        if (column.target === current) {
          columns.push(column.options.name ?? column.propertyName)
          break
        }
        current = Object.getPrototypeOf(current)
      }
    }
    out.push({ name: table.name, columns })
  }
  return out
}

/**
 * Toutes les tables, classées. Le registre écrit gagne ; le reste se déduit de
 * sa colonne de portée. Une table RETIRÉE n'y figure pas : classer ce qui
 * n'existe plus gonflerait le décompte affiché sans rien dire de vrai.
 */
export function tableInventory(): Record<string, TableScope> {
  const inventory: Record<string, TableScope> = {}

  for (const table of registeredTables()) {
    if (table.name in RETIRED_TABLES) continue
    const column = SCOPE_COLUMNS.find(candidate => table.columns.includes(candidate))
    if (!column) continue // sans colonne de portée, seul le registre écrit tranche
    inventory[table.name] = {
      category: 'scoped',
      by: column === 'workspace_id' ? 'workspace_column' : 'user_column',
      reason: `Déduite de la colonne \`${column}\` (métadonnées TypeORM).`,
    }
  }

  for (const [table, scope] of Object.entries(TABLE_SCOPES)) {
    if (table in RETIRED_TABLES) continue
    inventory[table] = scope
  }

  return inventory
}
