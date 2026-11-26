import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * `@/router` importe `routeTree.gen`, qui importe TOUTES les routes du produit.
 * Un module qui l'importe STATIQUEMENT rend donc tout ce qui l'utilise
 * dépendant de l'arbre de routes entier — et ferme un cycle dès que ce quelque
 * chose est lui-même dans l'arbre.
 *
 * Mesuré le 18/09/2026, pour UN bouton : brancher la sortie de démonstration
 * sur `DemoModeBanner` (rendu par `CustomerPage`, donc sous `/projects/`) a
 * fermé la boucle
 * `projects/index → … → useLogout → @/router → routeTree.gen → projects/index`.
 * `routeTree.gen.ts:186` lisait alors `.update` sur un import encore indéfini,
 * et TROIS shards web sont partis en rouge sur un `TypeError` qui ne nommait
 * ni le bouton, ni le hook, ni la démonstration.
 *
 * La règle : un hook ou un composant PARTAGÉ — tout ce qui vit sous
 * `components`, ou dans un dossier `hooks` d'une feature — n'importe pas
 * `@/router` en haut de fichier. Il prend le routeur du contexte React
 * (`useRouter`, `useNavigate`), ou le charge à l'usage, par `import()`.
 *
 * Ce qui reste autorisé, et pourquoi c'est dans la liste : `App.tsx` et les
 * routes elles-mêmes SONT le point d'entrée de l'arbre — l'import y est le sens
 * de la flèche, pas un cycle.
 */

const RACINE = join(import.meta.dirname, '..')

/** Le sens de la flèche : ces modules SONT l'entrée de l'arbre de routes. */
const ENTREES_LEGITIMES = ['App.tsx', 'main.tsx', 'router.tsx', 'routeTree.gen.ts']

/** `import … from '@/router'` en haut de fichier — pas `await import('@/router')`. */
const IMPORT_STATIQUE = /^\s*import\s[^;]*?\sfrom\s+['"]@\/router['"]/m

function fichiersSurveilles(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) {
      fichiersSurveilles(chemin, acc)
      continue
    }
    if (!/\.tsx?$/.test(entree) || /\.test\.tsx?$/.test(entree)) continue
    acc.push(chemin)
  }
  return acc
}

describe("un module partagé n'importe pas le routeur en haut de fichier", () => {
  it('aucun hook ni composant partagé ne dépend statiquement de @/router', () => {
    const surveilles = [
      ...fichiersSurveilles(join(RACINE, 'components')),
      ...fichiersSurveilles(join(RACINE, 'features')).filter(f => /[\\/]hooks[\\/]/.test(f)),
    ]

    // Une garde qui ne lit rien est verte pour rien : ce plancher tombe le jour
    // où le chemin change, au lieu de laisser passer la règle en silence.
    expect(surveilles.length).toBeGreaterThan(50)

    const fautifs = surveilles
      .filter(f => !ENTREES_LEGITIMES.includes(f.split(/[\\/]/).pop() as string))
      .filter(f => IMPORT_STATIQUE.test(readFileSync(f, 'utf8')))
      .map(f => f.slice(RACINE.length + 1))

    expect(fautifs).toEqual([])
  })

  it('la garde sait dire NON, et ne se trompe pas de forme', () => {
    expect(IMPORT_STATIQUE.test(`import { router } from '@/router'`)).toBe(true)
    expect(IMPORT_STATIQUE.test(`import { router, x } from "@/router"`)).toBe(true)
    // La forme paresseuse est exactement celle qu'on VEUT : elle doit passer.
    expect(IMPORT_STATIQUE.test(`void import('@/router').then(({ router }) => {})`)).toBe(false)
    expect(IMPORT_STATIQUE.test(`const { router } = await import('@/router')`)).toBe(false)
    // Et elle n'attrape pas ce qu'elle ne vise pas.
    expect(IMPORT_STATIQUE.test(`import { useRouter } from '@tanstack/react-router'`)).toBe(false)
    expect(IMPORT_STATIQUE.test(`// import { router } from '@/router'`)).toBe(false)
    expect(IMPORT_STATIQUE.test(`import { x } from '@/routeur-maison'`)).toBe(false)
  })
})
