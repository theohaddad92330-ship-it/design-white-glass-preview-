import type { ImportObject } from '@bellum/contracts'

/**
 * #2958.106 (recette Antoine) — les préfixes de cache des listes qui MONTRENT
 * un objet importé. Un import écrit relit ces listes : sans cela, l'annuaire
 * ouvert avant l'import restait vide après, alors que 927 contacts venaient
 * d'entrer. Un objet non écrivable n'écrit rien, donc ne fait rien relire.
 */
const LIST_PREFIXES: Partial<Record<ImportObject, readonly (readonly string[])[]>> = {
  account: [['accounts']],
  contact: [['contacts']],
  project: [['projects'], ['opportunities']],
  need: [['open-needs'], ['projects']],
  talent: [['talents']],
  // #2732.1 — l'import de missions écrit réellement : la liste des missions se relit.
  mission: [['missions']],
}

export function importedObjectQueryPrefixes(object: ImportObject | null): readonly (readonly string[])[] {
  return object === null ? [] : (LIST_PREFIXES[object] ?? [])
}
