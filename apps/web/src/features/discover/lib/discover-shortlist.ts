import { discoverStorageKey, readJson, writeJson } from './discover-storage'

/* ------------------------------------------------------------------ */
/*  « Suivre » / « Écarter » — les deux actions GRATUITES de Découvrir. */
/*                                                                     */
/*  Elles sont persistées LOCALEMENT et scopées par utilisateur : un    */
/*  candidat n'a pas encore de compte côté serveur (pas d'`accountId`   */
/*  tant qu'aucune analyse n'a tourné), il n'y a donc rien à rattacher  */
/*  côté API. Dès qu'un endpoint de watchlist acceptera un SIREN nu,    */
/*  seul ce module change — l'UI consomme déjà `readShortlist`.        */
/* ------------------------------------------------------------------ */

const NAMESPACE = 'shortlist'

export interface DiscoverShortlist {
  followed: Set<string>
  dismissed: Set<string>
}

interface StoredShortlist {
  followed: string[]
  dismissed: string[]
}

function isStored(value: unknown): value is Partial<StoredShortlist> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function toSet(value: unknown): Set<string> {
  return new Set(Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string' && v !== '') : [])
}

/** État courant de la shortlist. Toujours exploitable, même storage corrompu. */
export function readShortlist(userId: string | undefined): DiscoverShortlist {
  if (!userId) return { followed: new Set(), dismissed: new Set() }
  const stored = readJson(discoverStorageKey(NAMESPACE, userId), isStored)
  return { followed: toSet(stored?.followed), dismissed: toSet(stored?.dismissed) }
}

function write(userId: string, list: DiscoverShortlist): void {
  writeJson(discoverStorageKey(NAMESPACE, userId), {
    followed: [...list.followed],
    dismissed: [...list.dismissed],
  } satisfies StoredShortlist)
}

/**
 * Applique une mutation et renvoie l'état résultant, pour que l'appelant
 * (le hook React) puisse rendre immédiatement sans relire le storage.
 */
function mutate(userId: string | undefined, apply: (list: DiscoverShortlist) => void): DiscoverShortlist {
  const list = readShortlist(userId)
  if (!userId) return list
  apply(list)
  write(userId, list)
  return list
}

/** Suivre : gratuit, aucun crédit. Annule un écart éventuel — les deux
 *  intentions sont exclusives. */
export function followCandidate(userId: string | undefined, siren: string): DiscoverShortlist {
  return mutate(userId, list => {
    list.followed.add(siren)
    list.dismissed.delete(siren)
  })
}

export function unfollowCandidate(userId: string | undefined, siren: string): DiscoverShortlist {
  return mutate(userId, list => list.followed.delete(siren))
}

/** Écarter : le candidat ne réapparaît plus dans les résultats. */
export function dismissCandidate(userId: string | undefined, siren: string): DiscoverShortlist {
  return mutate(userId, list => {
    list.dismissed.add(siren)
    list.followed.delete(siren)
  })
}

export function undismissCandidate(userId: string | undefined, siren: string): DiscoverShortlist {
  return mutate(userId, list => list.dismissed.delete(siren))
}
