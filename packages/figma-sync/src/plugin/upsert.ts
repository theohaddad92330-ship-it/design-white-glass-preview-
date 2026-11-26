import type { CollectionLike, Log, PageLike, SyncApi, VariableLike } from './api'

/**
 * L'IDEMPOTENCE, en un seul endroit : tout objet Figma est RETROUVÉ par son
 * nom, créé seulement s'il manque, puis mis à jour. Relancer la
 * synchronisation deux fois donne le même fichier — jamais un doublon.
 */

export function findOrCreate<T extends { name: string }>(existing: readonly T[], name: string, create: () => T): T {
  const found = existing.find(x => x.name === name)
  if (found) return found
  const created = create()
  created.name = name
  return created
}

export async function upsertCollection(api: SyncApi, name: string): Promise<CollectionLike> {
  const all = await api.variables.getLocalVariableCollectionsAsync()
  return all.find(c => c.name === name) ?? api.variables.createVariableCollection(name)
}

/** Une collection à un seul mode : le mode par défaut est renommé `Value`. */
export function ensureSingleMode(collection: CollectionLike): string {
  const first = collection.modes[0] as { modeId: string; name: string }
  if (first.name !== 'Value') collection.renameMode(first.modeId, 'Value')
  return first.modeId
}

/**
 * Les modes Light / Dark de la collection `Color`. Si le plan du fichier
 * refuse un deuxième mode (Starter), on le JOURNALISE et on continue en Light
 * seul — le fichier reste utilisable, et personne ne croit que le sombre y est.
 */
export function ensureLightDark(collection: CollectionLike, log: Log): { light: string; dark: string | null } {
  const first = collection.modes[0] as { modeId: string; name: string }
  const lightMode = collection.modes.find(m => m.name === 'Light') ?? first
  if (lightMode.name !== 'Light') collection.renameMode(lightMode.modeId, 'Light')
  const existingDark = collection.modes.find(m => m.name === 'Dark')
  if (existingDark) return { light: lightMode.modeId, dark: existingDark.modeId }
  try {
    return { light: lightMode.modeId, dark: collection.addMode('Dark') }
  } catch (e) {
    log.error(
      `Mode Dark refusé par Figma (plan Starter : un seul mode par collection ?) — la collection « ${collection.name} » ` +
        `est écrite en Light SEULEMENT. Détail : ${e instanceof Error ? e.message : String(e)}`,
    )
    return { light: lightMode.modeId, dark: null }
  }
}

/**
 * Retrouve une variable par (collection, nom) ou la crée. Une variable
 * existante d'un AUTRE type n'est pas écrasée (elle peut être liée partout
 * dans le fichier) : on le dit et on la saute.
 */
export function upsertVariable(
  api: SyncApi,
  existing: VariableLike[],
  collection: CollectionLike,
  name: string,
  type: VariableResolvedDataType,
  log: Log,
): VariableLike | null {
  const found = existing.find(v => v.variableCollectionId === collection.id && v.name === name)
  if (found) {
    if (found.resolvedType !== type) {
      log.warn(`« ${collection.name}/${name} » existe en ${found.resolvedType}, attendu ${type} — laissée telle quelle`)
      return null
    }
    return found
  }
  const created = api.variables.createVariable(name, collection, type)
  existing.push(created)
  return created
}

/** Crée les pages manquantes, dans l'ordre donné ; les pages existantes sont réutilisées, jamais recréées. */
export function upsertPages(api: SyncApi, names: readonly string[]): Map<string, PageLike> {
  const out = new Map<string, PageLike>()
  // Un fichier neuf naît avec « Page 1 » : elle devient la première page plutôt que de traîner vide.
  const blank = api.root.children.length === 1 ? api.root.children.find(p => p.name === 'Page 1') : undefined
  if (blank && names[0] && !api.root.children.some(p => p.name === names[0])) blank.name = names[0]
  for (const name of names) {
    out.set(
      name,
      findOrCreate(api.root.children, name, () => api.createPage()),
    )
  }
  return out
}
