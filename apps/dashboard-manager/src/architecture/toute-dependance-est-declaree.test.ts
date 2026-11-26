import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GARDE — ce que la console IMPORTE, son `package.json` le DÉCLARE.
 *
 * L'INCIDENT DU 07/09/2026, ET POURQUOI RIEN NE L'A VU
 * Trois fichiers ont commencé à importer `@bellum/contracts`. En local tout
 * passait — `vitest`, `tsc --noEmit`, `eslint`, la suite entière au vert — parce
 * que pnpm remonte les paquets de l'espace de travail et que TypeScript résout
 * par les chemins du `tsconfig`. Sur Vercel, où l'installation est ISOLÉE au
 * paquet construit, `next build` a répondu :
 *
 *     Module not found: Can't resolve '@bellum/contracts'
 *
 * La production est restée sur le commit précédent, et deux lots ont été merges
 * sans arriver. Le CI l'avait pourtant vu — `Build` et `Check types` étaient
 * rouges ; ils ont été merges sans qu'on les attende. Cette garde ne remplace ni
 * l'un ni l'autre : elle rend l'erreur visible en une seconde plutôt qu'en
 * quatre minutes, et à l'endroit où on l'écrit.
 *
 * ⚠️ CE QU'ELLE NE COUVRE PAS, dit plutôt que supposé : les dépendances hors
 * `@bellum/*` (npm public), qui échouent bruyamment dès le premier `pnpm
 * install`, et toute erreur qui n'existe qu'au moment où Next construit sa
 * table de routes — le second défaut du même jour, un conflit de segments
 * dynamiques, ne se voit QUE dans un `next build`.
 */

const RACINE = join(__dirname, '..')
const PACKAGE_JSON = join(RACINE, '..', 'package.json')

function fichiersSource(dossier: string, acc: string[] = []): string[] {
  for (const entree of readdirSync(dossier)) {
    const chemin = join(dossier, entree)
    if (statSync(chemin).isDirectory()) {
      fichiersSource(chemin, acc)
      continue
    }
    // ⚠️ LES TESTS SORTENT DU CORPUS, et ce n'est pas une commodité.
    // Deux raisons, dans cet ordre : ils ne partent pas dans le paquet construit
    // — `next build` ne les compile pas, donc ils ne peuvent pas produire le
    // défaut qu'on garde ; et CE fichier-ci contient `import '@bellum/ui'` comme
    // CAS DE TEST. Sans cette ligne, la garde se prend elle-même — la troisième
    // variante du défaut « une garde attrapée par sa propre justification »,
    // après le commentaire et le numéro d'issue.
    if (!/\.tsx?$/.test(entree) || /\.test\.tsx?$/.test(entree)) continue
    acc.push(chemin)
  }
  return acc
}

/** Les commentaires d'abord : une garde attrapée par sa propre justification est borgne. */
function sansCommentaires(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** Les paquets de l'espace de travail réellement importés par un fichier. */
export function paquetsBellumImportes(source: string): string[] {
  const propre = sansCommentaires(source)
  const trouves = new Set<string>()
  // `import … from '@bellum/x'`, `import '@bellum/x'`, et `from '@bellum/x/y'`.
  for (const m of propre.matchAll(
    /from\s+['"](@bellum\/[^'"/]+)[^'"]*['"]|import\s+['"](@bellum\/[^'"/]+)[^'"]*['"]/g,
  )) {
    const nom = m[1] ?? m[2]
    if (nom) trouves.add(nom)
  }
  return [...trouves]
}

const FICHIERS = fichiersSource(RACINE)
const MANIFESTE = JSON.parse(readFileSync(PACKAGE_JSON, 'utf8')) as {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}
const DECLARES = new Set([
  ...Object.keys(MANIFESTE.dependencies ?? {}),
  ...Object.keys(MANIFESTE.devDependencies ?? {}),
])

describe('GA — la console déclare ce qu’elle importe', () => {
  it('LIT quelque chose — le corpus et le manifeste sont réels', () => {
    expect(FICHIERS.length).toBeGreaterThan(60)
    // Sans ces deux lignes, un `package.json` illisible rendrait un ensemble
    // vide, et la garde passerait au vert en n'ayant rien comparé.
    expect(DECLARES.size).toBeGreaterThan(5)
    expect(DECLARES.has('next')).toBe(true)
  })

  it('LIT vraiment les imports — `@bellum/contracts` est retrouvé là où il est écrit', () => {
    // Deuxième contrôle positif : la garde doit RETROUVER ce qu'on sait être là.
    // Une lecture cassée rendrait « aucun import », donc « aucun manquant ».
    const importateurs = FICHIERS.filter(f => paquetsBellumImportes(readFileSync(f, 'utf8')).length > 0)
    expect(importateurs.length).toBeGreaterThan(0)
  })

  it('SAIT DIRE NON — les trois formes d’import sont vues', () => {
    expect(paquetsBellumImportes(`import { X } from '@bellum/contracts'`)).toEqual(['@bellum/contracts'])
    expect(paquetsBellumImportes(`import type { X } from '@bellum/contracts'`)).toEqual(['@bellum/contracts'])
    expect(paquetsBellumImportes(`import '@bellum/ui'`)).toEqual(['@bellum/ui'])
    // Un sous-chemin désigne le même paquet.
    expect(paquetsBellumImportes(`import { X } from '@bellum/contracts/schemas'`)).toEqual(['@bellum/contracts'])
  })

  it('ne se prend PAS elle-même — ses propres cas de test sont hors corpus', () => {
    // Ce fichier écrit `import '@bellum/ui'` comme fixture. S'il entrait dans le
    // corpus, la garde rougirait sur une chaîne qui n'importe rien.
    expect(FICHIERS.some(f => f.endsWith('.test.ts') || f.endsWith('.test.tsx'))).toBe(false)
  })

  it('N’ATTRAPE PAS CE QU’ELLE NE VISE PAS', () => {
    expect(paquetsBellumImportes(`import { useState } from 'react'`)).toEqual([])
    expect(paquetsBellumImportes(`import { x } from '@/lib/dates'`)).toEqual([])
    // Sa propre justification, écrite en commentaire, ne la fait pas rougir.
    expect(paquetsBellumImportes(`// on importait '@bellum/contracts' sans le déclarer`)).toEqual([])
    expect(paquetsBellumImportes(`/* from '@bellum/contracts' manquait au manifeste */`)).toEqual([])
  })

  it('aucun paquet de l’espace de travail n’est importé sans être déclaré', () => {
    const manquants = new Map<string, string[]>()
    for (const fichier of FICHIERS) {
      for (const paquet of paquetsBellumImportes(readFileSync(fichier, 'utf8'))) {
        if (DECLARES.has(paquet)) continue
        const liste = manquants.get(paquet) ?? []
        liste.push(fichier.slice(RACINE.length + 1))
        manquants.set(paquet, liste)
      }
    }

    // ⚠️ Si cette liste cesse d'être vide : ajouter `"<paquet>": "workspace:^"`
    // aux `dependencies` d'`apps/dashboard-manager/package.json`. En local tout
    // marchera de toute façon ; c'est Vercel qui refusera, après le merge.
    expect(Object.fromEntries(manquants)).toEqual({})
  })
})
