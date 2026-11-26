/* ------------------------------------------------------------------ */
/*  Petit socle de persistance locale pour Découvrir.                   */
/*                                                                     */
/*  Toutes les clés vivent sous `DISCOVER_STORAGE_PREFIX` : la purge de */
/*  suppression de compte (`clearAllDiscoverCaches`) balaie le préfixe  */
/*  entier, donc aucune trace locale ne survit à un effacement RGPD.    */
/* ------------------------------------------------------------------ */

export const DISCOVER_STORAGE_PREFIX = 'bellum:discover:'

/** Clé scopée par utilisateur : deux comptes sur la même machine ne se
 *  marchent jamais dessus. */
export function discoverStorageKey(namespace: string, userId: string): string {
  return `${DISCOVER_STORAGE_PREFIX}${namespace}:${userId}`
}

/**
 * Lit une valeur JSON, en la validant avant de la rendre. Toute anomalie
 * (storage indisponible, JSON cassé, forme inattendue) → `undefined` : un
 * cache local ne doit jamais faire tomber l'écran.
 */
export function readJson<T>(key: string, validate: (value: unknown) => value is T): T | undefined {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) return undefined
    const parsed: unknown = JSON.parse(raw)
    return validate(parsed) ? parsed : undefined
  } catch {
    return undefined
  }
}

/** Écrit une valeur JSON. Silencieux si le storage est plein ou désactivé. */
export function writeJson(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* storage plein / désactivé — non fatal */
  }
}

/** Supprime toutes les clés Découvrir, tous utilisateurs confondus. */
export function clearDiscoverStorage(): void {
  try {
    const keys: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key?.startsWith(DISCOVER_STORAGE_PREFIX)) keys.push(key)
    }
    keys.forEach(key => localStorage.removeItem(key))
  } catch {
    /* storage indisponible — rien à purger */
  }
}
