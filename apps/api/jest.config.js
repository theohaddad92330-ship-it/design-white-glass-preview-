/** @type {import('jest').Config} */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts', 'tsx'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  // ──────────────────────────────────────────────
  // POURQUOI @swc/jest ET PAS ts-jest
  //
  // `ts-jest` re-TYPE-VÉRIFIE chaque fichier à chaque exécution. Le job CI
  // `Check types` fait déjà exactement ce travail, à côté, en 0,5 min — le
  // typage était donc payé deux fois, et la seconde fois était le chemin
  // critique de la CI (`Test (API)` : 8,8 à 20 min, tous les autres jobs
  // ≤ 3 min). `@swc/jest` transpile sans type-vérifier : mesuré sur ce dépôt,
  // la suite entière (499 suites / 6 092 tests) passe de 57,9 s à 16,7 s en
  // local — ×3,5 — pour des résultats identiques à l'unité près (496 suites
  // vertes, 6 078 tests verts, et le même unique échec préexistant sur
  // `database/migrations.spec.ts`).
  //
  // ⚠️ CE QUE ÇA COÛTE, NOMMÉ : `tsconfig.build.json` exclut `**/*.spec.ts`,
  // donc `Check types` ne regarde PAS les fichiers de test. Le seul type-check
  // qu'ils recevaient venait de `ts-jest`. Il est rendu ailleurs, à part, par
  // le script `check-types:tests` (`tsconfig.json`, qui lui inclut `src` et
  // `test`), branché dans le job `Check types` de la CI (mesuré : 7 s en
  // local). Sans lui, ce changement échangerait du temps de CI contre
  // 500 fichiers de test que plus personne ne type-vérifie — un troc qui ne
  // se voit pas le jour où on le fait.
  //
  // ⚠️ `decoratorMetadata` n'est pas décoratif : NestJS et TypeORM lisent les
  // métadonnées de type À L'EXÉCUTION (`design:paramtypes` pour l'injection
  // par type, `@InjectRepository`). Sans cette option, l'injection casse — et
  // ça ne se voit que sur les specs qui démarrent un vrai module Nest
  // (`*.module.spec.ts`, `no-blind-record-writes`, `module-boundaries`).
  //
  // `target` est repris de `packages/tooling/typescript/nestjs.json` (ES2023).
  // Une cible plus basse re-transpilerait du code que Node 22 exécute nativement.
  //
  // ── LES QUATRE FICHIERS QUI RESTENT SUR ts-jest — l'exception est NOMMÉE ──
  //
  // Jest retient le PREMIER motif qui correspond, dans l'ordre d'écriture :
  // ces quatre-là passent donc par `ts-jest`, tout le reste par `@swc/jest`.
  // Ils ne sont pas « en attente de correction » : ils s'appuient chacun sur
  // une particularité d'ÉMISSION de `tsc` que `swc` ne reproduit pas, et les
  // deux comportements de swc sont conformes aux modules ES — c'est `tsc` qui
  // est permissif. Mesuré sur les 1 701 fichiers de `src` : 4 candidats, 3
  // vraies divergences (le 4e, `mailer.service.spec.ts`, a une fabrique qui ne
  // capture rien, donc le remontage lui est indifférent).
  //
  //  1. `ia.client.spec.ts`, `ia.client.rag-ingest.spec.ts` et
  //     `cv-extract-timeout.spec.ts` — la fabrique de
  //     `jest.mock('undici', () => ({ fetch: mockFetch }))` lit un `const`
  //     déclaré AVANT elle, alors que l'`import` qui déclenche la fabrique
  //     vient APRÈS dans la source. `tsc` laisse le `require` à sa place et le
  //     `const` est déjà évalué ; `swc` remonte tous les `require` en tête de
  //     module (ce que la spec ESM demande) et la fabrique lit le `const` dans
  //     sa zone morte → `ReferenceError: Cannot access 'mockFetch' before
  //     initialization`. Aucune option de transformeur ne change cet ordre.
  //
  //     ⚠️ Mesuré sur `cv-extract-timeout.spec.ts` (#2542.M3, 18/09/2026) :
  //     placer le `const mockFetch = jest.fn()` comme TOUTE PREMIÈRE ligne du
  //     fichier, avant même les imports `node:fs`/`node:path`, ne suffit PAS —
  //     `swc` remonte les `import` au-dessus de lui quand même et l'erreur
  //     persiste identique. Le seul remède observé qui fonctionne est CETTE
  //     exception ; ne pas re-tenter le déplacement du `const` en espérant un
  //     résultat différent.
  //
  //  2. `telephony.client.ts` — `telephony.service.spec.ts` fait
  //     `import * as client` puis `jest.spyOn(client, 'listCalls')`. `tsc`
  //     émet `exports.listCalls = listCalls` (réinscriptible) ; `swc` émet
  //     `Object.defineProperty(exports, 'listCalls', { enumerable: true, get })`
  //     — un getter NON configurable, que `jest.spyOn` ne peut pas remplacer
  //     → `TypeError: Cannot redefine property: listCalls`. C'est le MODULE
  //     espionné qu'il faut émettre à l'ancienne, pas la spec qui l'espionne.
  //
  // ⚠️ Une nouvelle spec qui reprend l'un de ces deux motifs échouera, bruyamment
  // et à l'endroit exact — pas silencieusement. Le remède sûr pour le motif 1
  // est CETTE exception nommée (pas un réagencement du `const`, voir ci-dessus) ;
  // pour le motif 2, espionner l'objet exporté plutôt que l'espace de noms du
  // module.
  // ──────────────────────────────────────────────
  transform: {
    '(ia\\.client\\.spec|ia\\.client\\.rag-ingest\\.spec|cv-extract-timeout\\.spec|telephony\\.client)\\.ts$':
      'ts-jest',
    '^.+\\.tsx?$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: true },
          transform: { legacyDecorator: true, decoratorMetadata: true },
          target: 'es2023',
        },
      },
    ],
  },
  moduleNameMapper: {
    // Lot R — point d'entrée séparé (hors index, hors bundle web) : jest lit la source, comme pour l'index.
    '^@bellum/contracts/geo-communes$': '<rootDir>/../../../packages/contracts/src/schemas/geo-communes.ts',
    '^@bellum/([^/]+)$': '<rootDir>/../../../packages/$1/src/index.ts',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  collectCoverageFrom: ['**/*.ts', '!**/node_modules/**'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  // Jest prend `cœurs - 1` workers par défaut (11 ici) et n'a AUCUNE variable
  // d'environnement pour le borner — le plafond doit donc vivre ici. Le créneau
  // du plugin `garde` borne le nombre de suites simultanées sur la machine, pas
  // ce qu'UNE suite prend : deux sessions Claude sur deux dépôts ont mis 24 Go en
  // swap le 15/09/2026.
  //
  // ⚠️ La CLÉ doit DISPARAÎTRE quand on ne la borne pas, et pas valoir
  // `undefined` : jest 29 valide la PRÉSENCE de la clé avant sa valeur et refuse
  // de démarrer sur « maxWorkers has to be of type string or number ». Les quatre
  // shards API sont morts en 31 s le 15/09/2026 pour cette seule raison, et la
  // porte a suivi.
  //
  // ⚠️⚠️ « En CI le runner est seul sur sa machine » — c'était vrai sur
  // `ubuntu-latest`, et c'est FAUX depuis les runners auto-hébergés du
  // 16/09/2026 : quatre conteneurs partagent un CX43 à 8 vCPU. Or un conteneur
  // ne CACHE PAS les cœurs de l'hôte — `os.cpus()` en rend 8 quelle que soit la
  // part réservée, donc jest en déduit 7 workers et les lance pour de bon.
  // Mesuré ce jour-là : UN conteneur à 665 % de CPU, un autre collé à son
  // plafond mémoire, et deux jobs tués en `exit 137`.
  //
  // `JEST_MAX_WORKERS` est donc posé par l'environnement du runner, comme
  // `VITEST_MAX_FORKS` et `TURBO_CONCURRENCY` à côté (§4 de `.claude/projet.md` :
  // un plafond vit dans l'ENVIRONNEMENT, pas dans une ligne de commande qu'on
  // peut réécrire). Absente — c'est le cas sur `ubuntu-latest` — le comportement
  // ne bouge pas d'un octet.
  ...(process.env.JEST_MAX_WORKERS
    ? { maxWorkers: Number(process.env.JEST_MAX_WORKERS) }
    : process.env.CI
      ? {}
      : { maxWorkers: 2 }),
  // Module-compile specs boot real Nest modules (BullMQ/IORedis, Socket.IO
  // gateway) whose background connections aren't fully torn down by
  // `module.close()`. Force the runner to exit once tests finish so CI
  // doesn't hang on a lingering handle. Test outcomes are unaffected.
  forceExit: true,
  // Un test (ou hook) trop long échoue en nommant le test, au lieu des 5 s implicites de jest
  // que les specs qui montent un module Nest dépassent sur un runner chargé.
  //
  // 30 s -> 120 s le 31/10/2026. Ce plafond était déjà une première montée pour CETTE
  // raison, et il ne suffit plus. Mesuré sur TROIS runs du MÊME contenu, après la fusion
  // des 21 PR de #4926 : trois specs DIFFÉRENTES sont tombées sur « Exceeded timeout of
  // 30000 ms » — `sequence-templates.service.spec.ts` (shard 5/6), `document-builders.spec.ts`
  // (shard 1/6), et `demo-seed.service.spec.ts` sur sa propre borne en ms (retirée, #4939).
  // Chaque fois UN seul test rouge sur ~4 850, et chaque fois la suite la plus LENTE du
  // shard (133 s, 131 s) — alors que les mêmes specs tournent en 1,8 s et 15,8 s en local.
  // La cause RACINE est la famine CPU des 6 shards sur une flotte partagée, pas ce plafond :
  // elle appartient au chantier CI (#4930-#4937). Mais tant qu'elle tient, `main` est rouge
  // à la loterie, un shard différent à chaque passage.
  // Ce qu'on ne perd PAS en montant : un VRAI blocage reste attrapé par le chien de garde
  // par FICHIER juste en dessous (600 s), qui nomme le fichier et fait échouer le job.
  // Place disponible : le shard 1/6 a mis 27,8 min pour un plafond d'étape de 45 min.
  testTimeout: 120000,
  // CI seulement (variable lue ici, pas dans le workflow) : un FICHIER sans résultat après
  // JEST_FILE_WATCHDOG_SECONDS (600 s par défaut) est nommé dans le log puis le job sort en échec,
  // plutôt que de rester muet jusqu'au délai de 45 min de l'étape (incident shard 2/3, 22/10/2026).
  ...(process.env.CI
    ? {
        reporters: [
          'default',
          [
            '<rootDir>/../scripts/jest-watchdog-reporter.js',
            { limitSeconds: Number(process.env.JEST_FILE_WATCHDOG_SECONDS || 600) },
          ],
        ],
      }
    : {}),
}
