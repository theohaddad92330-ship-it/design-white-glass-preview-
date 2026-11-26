/**
 * GA-286 — les deux projets vitest couvrent la suite, et ne la couvrent qu'une fois.
 *
 * Depuis le 16/09/2026 les suites web tournent dans DEUX projets (`node` pour
 * les gardes qui lisent des fichiers, `jsdom` pour tout ce qui rend) — voir
 * `vitest.projects.ts` pour la mesure qui l'a décidé.
 *
 * Le découpage introduit exactement le risque que le shard de `Test (Web)`
 * portait déjà, et que `.github/workflows/ci.yml` formule ainsi : « et si les
 * trois shards rejouaient les mêmes fichiers ? », qui donnerait des jobs verts
 * sur un tiers de la suite. Ici la faute symétrique est pire : un fichier tombé
 * entre les deux projets n'est lancé par PERSONNE, et rien ne rougit.
 *
 * Cette garde lit donc le disque — pas la config — et vérifie que chaque
 * fichier de test réel appartient à un projet et à un seul.
 */
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  ALL_SUITES_INCLUDE,
  NODE_PROJECT_INCLUDE,
  SUITES_NEEDING_DOM,
  belongsToNodeProject,
  matchesGlob,
} from '../test/projects'

const WEB_ROOT = resolve(__dirname, '../..')

function walk(dir: string, found: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, found)
    else found.push(relative(WEB_ROOT, full).split('\\').join('/'))
  }
  return found
}

/** Les fichiers de test que vitest collecterait réellement, lus sur le disque. */
const everySuiteOnDisk = walk(WEB_ROOT).filter(file => ALL_SUITES_INCLUDE.some(pattern => matchesGlob(file, pattern)))

describe('GA-286 — les deux projets couvrent la suite, une seule fois', () => {
  it('lit un corpus réel — une garde sans corpus rend un vert qui ne prouve rien', () => {
    expect(everySuiteOnDisk.length).toBeGreaterThan(1000)
    expect(everySuiteOnDisk).toContain('src/architecture/les-deux-projets-couvrent-la-suite.test.ts')
  })

  it('chaque fichier de test appartient à exactement un projet', () => {
    const orphans = everySuiteOnDisk.filter(file => !belongsToNodeProject(file) && !isCoveredByJsdomProject(file))
    expect(orphans).toEqual([])
  })

  it('le projet node ne prend que son périmètre déclaré', () => {
    const strays = everySuiteOnDisk
      .filter(file => belongsToNodeProject(file))
      .filter(file => !NODE_PROJECT_INCLUDE.some(pattern => matchesGlob(file, pattern)))
    expect(strays).toEqual([])
  })

  it('le périmètre node n\u2019est pas vide — sinon le découpage ne sert à rien', () => {
    expect(everySuiteOnDisk.filter(file => belongsToNodeProject(file)).length).toBeGreaterThan(50)
  })

  it('chaque suite déclarée « a besoin du DOM » existe encore sur le disque', () => {
    const vanished = SUITES_NEEDING_DOM.filter(file => !existsSync(join(WEB_ROOT, file)))
    expect(vanished).toEqual([])
  })

  it('une suite déclarée « a besoin du DOM » sort bien du projet node', () => {
    for (const file of SUITES_NEEDING_DOM) {
      expect(belongsToNodeProject(file)).toBe(false)
    }
  })
})

describe('GA-286 — le classement sait dire NON', () => {
  it('prend une garde d\u2019architecture', () => {
    expect(belongsToNodeProject('src/architecture/une-garde-quelconque.test.ts')).toBe(true)
  })

  // Le témoin des voisins légitimes : ces fichiers-là ne doivent PAS basculer,
  // sinon la garde attraperait ce qu'elle ne vise pas.
  it.each([
    'src/components/primitives/AskLaura.test.tsx',
    'src/routes/dashboard.test.tsx',
    'vite-plugins/quelque-chose.test.ts',
    'src/architecture/pas-un-test.ts',
  ])('ne prend pas %s', file => {
    expect(belongsToNodeProject(file)).toBe(false)
  })
})

/** Le projet jsdom ramasse tout ce que le projet node ne prend pas. */
function isCoveredByJsdomProject(file: string): boolean {
  return ALL_SUITES_INCLUDE.some(pattern => matchesGlob(file, pattern))
}
