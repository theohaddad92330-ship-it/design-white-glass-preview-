import { defineConfig, type Plugin } from 'vitest/config'
import react from '@vitejs/plugin-react-swc'
import { existsSync, readdirSync } from 'node:fs'
import path from 'path'

import { PROJECT_SCOPES, SUITE_TIME_ZONE } from './src/test/projects'

// #perf-web — fuseau FIXÉ UNE FOIS, avant le démarrage des workers (ils héritent
// de l'environnement du process principal). Voir le bloc `pool` ci-dessous.
process.env.TZ = SUITE_TIME_ZONE

/**
 * 20 s, contre les 5 s par défaut de vitest.
 *
 * Ce n'est pas un assouplissement : ces tests prennent 300 à 600 ms sur un
 * poste. Le 30/08/2026, le shard 2 a mis 3 min 41 s en CI quand les deux
 * autres en mettaient 50 — et un test DIFFÉRENT expirait à chaque relance,
 * toujours à 5 000 ms pile. Un délai qui se déclenche sur la contention du
 * runner ne mesure pas la lenteur du test : il produit un rouge faux, et un
 * rouge faux coûte plus cher qu'un délai généreux, parce qu'on finit par
 * relancer sans lire.
 *
 * Ce qui reste tenu : un test réellement bloqué échoue toujours, et une
 * régression de performance d'un facteur quarante se voit encore.
 */
const TEST_TIMEOUT_MS = 20_000

/**
 * ── Pool `threads` + environnement `happy-dom` (05/10/2026) ───────────────────
 * Corpus figé de 60 fichiers (25 des plus lents d'après `test-durations.json`,
 * 25 pris au pas, 8 gardes d'architecture, les 2 fichiers qui touchent `TZ`),
 * 1 510 tests, 2 passes, même machine. Colonnes : durée murale, puis la somme
 * des phases vitest (setup + collect + environment + tests + transform +
 * prepare), qui résiste mieux à la charge de la machine que la durée murale.
 *
 *   variante                          mur (s)      Σ phases (s)   environment   rouges
 *   jsdom + forks (l'état d'avant)    36,4 · 37,4   ≈ 415          13,8 s        0
 *   jsdom + threads                   33,7 · 34,7   ≈ 387          10,6 s        2 (TZ)
 *   happy-dom + forks                 31,5 · 32,1   ≈ 345           7,6 s        0 (1 test instable, voir ci-dessous)
 *   happy-dom + threads               24,2 · 24,5   ≈ 309           7,1 s        2 (TZ)
 *   RETENU : happy-dom + threads,     25,4 · 27,2   ≈ 348           7,5 s        0
 *     fuseau fixé, 2 suites écartées
 *
 * ⚠️ Ces durées ont été prises machine peu chargée. Relevées à charge 10/12, en
 * alternant les variantes, la durée murale s'écrase (33-35 s contre 34-40 s) :
 * un poste saturé masque le gain. Σ phases : −8 % à charge pleine (elle ne
 * bouge pas entre happy-dom + forks et + threads : `threads` gagne en latence
 * de démarrage, pas en CPU — son gain est mural, donc visible surtout sur un
 * runner peu chargé). Sur un
 * runner de 2-4 cœurs, c'est la somme des phases qui compte, pas le mur.
 *
 * Ce qui a été fait, et pourquoi chaque morceau tient :
 *
 *  • `threads` avait été refusé le 16/09 (−17 %) à cause d'UN test :
 *    `thread-groups.test.ts` bascule `process.env.TZ` en cours de test, ce que
 *    Node met en cache pour tout le process d'un worker. Cause corrigée : le
 *    fuseau est posé UNE fois ici (`SUITE_TIME_ZONE`), avant le démarrage des
 *    workers, et la seule suite qui a besoin de plusieurs fuseaux garde son
 *    process (projet `process à part`, `forks`). Aucune autre suite ne mute
 *    `TZ` (`ExpensePolicyPage.test.tsx` pose le fuseau de la suite : sans effet).
 *    La garde `le-fuseau-de-la-suite-est-fixe` empêche le retour du problème.
 *    ⚠️ Effet de bord assumé : la suite tourne désormais en Europe/Paris, y
 *    compris sur un runner CI en UTC.
 *  • `happy-dom` remplace jsdom : `environment` ÷ 2 et `tests` −25 %. Une suite
 *    est instable dessous (2 rouges sur 10 lancements, 0 sur 10 sous jsdom) :
 *    elle reste sur jsdom, voir `SUITES_NEEDING_REAL_JSDOM`. Une seconde passe,
 *    sur 110 AUTRES fichiers tirés au pas, 2 fois : 110/110 verts.
 *  • Refusé : `isolate: false` sur les projets DOM (54 rouges le 16/09, état du
 *    DOM partagé). Le projet `node` garde `isolate: false` et le pool `forks`.
 *
 * ⚠️ Si une suite DOM rougit un jour « seulement sous happy-dom » : la mettre
 * dans `SUITES_NEEDING_REAL_JSDOM` avec la mesure, pas retirer happy-dom.
 */
// 06/10/2026 — happy-dom redevient le défaut, après INVENTAIRE COMPLET en CI
// (PR de diagnostic #3728, run 37375458552, coupure désactivée) : 18 fichiers sur
// ~2 180 rougissent sous happy-dom. 17 sont listés dans `SUITES_NEEDING_REAL_JSDOM` ;
// le 18e est une garde du projet « gardes qui rendent », qui reste entier sur jsdom
// (26 fichiers, peu de gain). Un fichier qui rougit « seulement sous happy-dom » :
// l'ajouter à la liste avec sa mesure, ne pas retirer happy-dom.
const DOM_ENVIRONMENT = 'happy-dom' as const

// Les paquets dont l'export `import` pointe `dist/` sont lus depuis `src/` : le sélecteur de tests
// (`vitest list --changed`) et les specs tournent sans `^build` (comme `apps/api/jest.config.js`).
// Tout paquet à `src/index.ts` est aliasé (un paquet transitif, ex. observable, plantait sinon).
const SRC_ALIASED_PACKAGES = readdirSync(path.resolve(__dirname, '../../packages')).filter(name =>
  existsSync(path.resolve(__dirname, `../../packages/${name}/src/index.ts`)),
)

/**
 * Catalogues EN paresseux (lot CI « ci/3-web-setup ») : `resources.ts` importe ~110 JSON EN que
 * la plupart des fichiers ne lisent jamais (≈ 80 ms de `setup` par fichier). Ce plugin remplace
 * CES imports, dans CE fichier et en test seulement, par `lazyJson(chemin)` — lecture synchrone
 * à la première lecture, mêmes données, aucune assertion changée. Garde-fou : si le nombre
 * d'imports remplacés est 0, on échoue (le plugin ne doit jamais devenir un no-op silencieux).
 * Interrupteur : `VITEST_LAZY_EN=0` rend les imports statiques d'origine. Voir docs/ci.md §3.
 */
const lazyEnglishCatalogs = {
  name: 'lazy-english-catalogs',
  enforce: 'pre' as const,
  transform(code: string, id: string) {
    if (process.env.VITEST_LAZY_EN === '0' || !id.endsWith('/src/i18n/resources.ts')) return null
    const dir = path.resolve(__dirname, 'src/i18n/locales/en')
    let remplaces = 0
    const out = code.replace(
      /^import (\w+) from '\.\/locales\/en\/([\w-]+)\.json'\s*$/gm,
      (_m, nom: string, ns: string) => {
        remplaces += 1
        return `const ${nom} = lazyJson(${JSON.stringify(path.join(dir, `${ns}.json`))})`
      },
    )
    if (remplaces === 0) throw new Error('lazy-english-catalogs : aucun import EN reconnu dans resources.ts')
    return `import { lazyJson } from ${JSON.stringify(path.resolve(__dirname, 'src/test/lazy-json.ts'))}\n${out}`
  },
}

const shared = {
  // `react()` est typé par le vite de plugin-react-swc (6.4.5), `defineConfig` par celui de vitest (6.4.4) :
  // deux `Plugin` structurellement égaux mais incompatibles pour tsc, d'où la conversion.
  plugins: [lazyEnglishCatalogs, ...(react() as Plugin[])],
  resolve: {
    alias: [
      { find: '@', replacement: path.resolve(__dirname, './src') },
      ...SRC_ALIASED_PACKAGES.map(name => ({
        find: new RegExp(`^@bellum/${name}$`),
        replacement: path.resolve(__dirname, `../../packages/${name}/src/index.ts`),
      })),
    ],
  },
}

export default defineConfig({
  ...shared,
  test: {
    /**
     * Trois projets, parce que `exclude` l'emporte sur `include` dans vitest :
     * on ne peut pas retirer `src/architecture/**` du projet jsdom puis y
     * ré-inclure les dix-sept gardes qui rendent du JSX. Elles ont donc leur
     * propre projet plutôt qu'une ré-inclusion qui ne s'appliquerait jamais.
     *
     * La garde GA-286 (`les-deux-projets-couvrent-la-suite`) lit le DISQUE et
     * vérifie que chaque fichier de test tombe dans un projet et un seul — un
     * fichier oublié entre deux projets ne serait lancé par personne, et rien
     * ne rougirait.
     */
    projects: [
      {
        ...shared,
        test: {
          name: 'node',
          globals: true,
          environment: 'node',
          /**
           * Pas d'isolation par fichier sur ce projet SEULEMENT : le graphe
           * importé par setup-node.ts se charge une fois par worker. Mesuré le
           * 24/09/2026 : 160 fichiers / 1391 tests, 87,5 s → 43,5 s (−50 %),
           * même compte, tous verts. Refusé sur jsdom (54 rouges : état DOM
           * partagé entre fichiers) — ne pas l'étendre sans remesurer.
           */
          isolate: false,
          setupFiles: ['./src/test/setup-node.ts'],
          include: [...PROJECT_SCOPES.node.include],
          exclude: [...PROJECT_SCOPES.node.exclude],
          testTimeout: TEST_TIMEOUT_MS,
        },
      },
      {
        ...shared,
        test: {
          // 22/10/2026 — les `*.test.ts` sans DOM (liste générée, mesurée). Isolation
          // par fichier CONSERVÉE : l'état de module partagé fait des rouges.
          name: 'node (pur)',
          globals: true,
          environment: 'node',
          setupFiles: ['./src/test/setup-node.ts'],
          include: [...PROJECT_SCOPES['node (pur)'].include],
          exclude: [...PROJECT_SCOPES['node (pur)'].exclude],
          testTimeout: TEST_TIMEOUT_MS,
        },
      },
      {
        ...shared,
        test: {
          name: 'jsdom',
          globals: true,
          environment: DOM_ENVIRONMENT,
          pool: 'threads',
          setupFiles: ['./src/test/setup.ts'],
          include: [...PROJECT_SCOPES.jsdom.include],
          exclude: [...PROJECT_SCOPES.jsdom.exclude],
          testTimeout: TEST_TIMEOUT_MS,
        },
      },
      {
        ...shared,
        test: {
          name: 'jsdom (jsdom réel)',
          globals: true,
          environment: 'jsdom',
          pool: 'threads',
          setupFiles: ['./src/test/setup.ts'],
          include: [...PROJECT_SCOPES['jsdom (jsdom réel)'].include],
          testTimeout: TEST_TIMEOUT_MS,
        },
      },
      {
        ...shared,
        test: {
          name: 'jsdom (process à part)',
          globals: true,
          environment: DOM_ENVIRONMENT,
          pool: 'forks',
          setupFiles: ['./src/test/setup.ts'],
          include: [...PROJECT_SCOPES['jsdom (process à part)'].include],
          testTimeout: TEST_TIMEOUT_MS,
        },
      },
      {
        ...shared,
        test: {
          name: 'jsdom (gardes qui rendent)',
          globals: true,
          // jsdom, pas happy-dom : `table-columns-stay-readable` (GA-119) mesure le
          // débordement d'un tableau, que happy-dom ne calcule pas (inventaire 06/10/2026).
          environment: 'jsdom',
          pool: 'threads',
          setupFiles: ['./src/test/setup.ts'],
          include: [...PROJECT_SCOPES['jsdom (gardes qui rendent)'].include],
          testTimeout: TEST_TIMEOUT_MS,
        },
      },
    ],
  },
})
