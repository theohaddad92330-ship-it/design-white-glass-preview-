import { readFileSync } from 'node:fs'

/**
 * Catalogue JSON lu à la PREMIÈRE lecture seulement (#perf-web, lot CI « ci/3-web-setup »).
 *
 * Pourquoi : `resources.ts` importe ~110 catalogues EN (2,4 Mo) que 85 % des fichiers de test
 * ne lisent jamais ; vite-node les transforme et les évalue PAR FICHIER (≈ 80 ms mesurés sur
 * ~700 ms de `setup`). Ici le catalogue reste le MÊME objet logique, lu de façon synchrone au
 * premier accès (clé, énumération, `has`) : aucune assertion ne change, aucun test n'a à savoir
 * qu'il est paresseux. Branché par le plugin `lazyEnglishCatalogs` de `vitest.config.ts`, qui
 * n'agit que sur `src/i18n/resources.ts` ; le build de production n'y touche pas.
 * Interrupteur : `VITEST_LAZY_EN=0` rend les imports statiques d'origine.
 */
export function lazyJson(path: string): Record<string, unknown> {
  let loaded: Record<string, unknown> | undefined
  const load = (): Record<string, unknown> =>
    (loaded ??= JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>)
  return new Proxy({} as Record<string, unknown>, {
    get: (_t, key) => Reflect.get(load(), key),
    set: (_t, key, value) => Reflect.set(load(), key, value),
    has: (_t, key) => Reflect.has(load(), key),
    deleteProperty: (_t, key) => Reflect.deleteProperty(load(), key),
    ownKeys: () => Reflect.ownKeys(load()),
    getOwnPropertyDescriptor: (_t, key) => {
      const d = Reflect.getOwnPropertyDescriptor(load(), key)
      return d ? { ...d, configurable: true } : undefined
    },
  })
}
