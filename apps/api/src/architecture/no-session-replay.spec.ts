import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-240 — aucun enregistrement de session (doctrine `c64_analytique_produit`,
 * règle 3, issue #1681).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE PROTÈGE, ET POURQUOI C'EST LA RÈGLE 3 QUI EST GARDÉE
 * ─────────────────────────────────────────────────────────────────────────────
 * La doctrine de l'analytique produit pose cinq règles. Quatre portent sur une
 * INTENTION — l'unité d'analyse, un seuil d'agrégation, la nature d'un
 * identifiant, ce qu'un écran d'opérateur a le droit de montrer — et une garde
 * qui prétendrait les lire dans du code devrait reconnaître une sémantique.
 * Ce dépôt a payé six gardes borgnes en deux jours pour l'avoir tenté ailleurs.
 *
 * La règle 3 est la seule qui porte sur des NOMS : un paquet, un hôte. Elle est
 * donc la seule entièrement décidable, et c'est aussi celle dont la violation
 * serait la plus coûteuse — un rejeu d'écran du produit, c'est le pipe
 * commercial d'un de nos clients exporté chez un tiers, image par image, sans
 * qu'aucune de nos règles d'accès ne s'applique. Une capture de session ne se
 * répare pas après coup : ce qui est parti est parti.
 *
 * ⚠️ Ce que la règle vise n'est PAS « une dépendance analytique ». La mesure
 * d'audience existe et reste autorisée (`apps/web/src/lib/analytics.ts`, derrière
 * la porte de consentement de GA-46). Ce qui est refusé, c'est la CAPTURE de ce
 * qui s'affiche ou de ce qui se tape.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LES TROIS PORTES PAR LESQUELLES UN ENREGISTREUR ENTRE
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. un **`package.json`** — la porte normale, et la seule qui laisse une trace
 *     dans le verrou de dépendances ;
 *  2. un **spécificateur de module** dans du code (`from 'logrocket'`) — ce qui
 *     arrive quand la dépendance est déjà là, transitive ou installée à la main ;
 *  3. un **hôte écrit en clair** — l'extrait de code que ces éditeurs donnent en
 *     premier est un `<script src="…">`, qui n'apparaît dans AUCUN
 *     `package.json`. C'est la porte la plus probable, et celle qu'une garde
 *     lisant les seules dépendances rate entièrement.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI DES SEGMENTS ET DES HÔTES POINTÉS, ET PAS DES MOTS
 * ─────────────────────────────────────────────────────────────────────────────
 * `clarity` est un mot anglais courant ; `session` et `replay` sont dans le
 * dépôt des centaines de fois (`sessionStorage`, `ImportSessionEntity`,
 * `replayFailedJobs`). Une garde qui les interdirait serait rouge sur du code
 * juste — et une garde rouge sur du code juste finit désactivée, ce qui tue la
 * règle avec elle.
 *
 * D'où deux formes seulement, chacune impossible à écrire par accident :
 *
 *  - un **segment** de nom de paquet égal à un éditeur de {@link VENDORS} —
 *    `hotjar`, `react-hotjar`, `@hotjar/browser`, `logrocket-react`,
 *    `rrweb-player` — plus {@link EXACT_BANS} pour les noms dont le segment
 *    serait trop générique (`@microsoft/clarity`, `clarity-js`) ;
 *  - un **hôte** de {@link FORBIDDEN_HOSTS}, qui porte tous un point :
 *    `clarity.ms` se reconnaît là où « clarity » ne se reconnaît pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * ⚠️ CE QUE CETTE GARDE NE PEUT PAS SAVOIR — écrit plutôt qu'élargi
 * ─────────────────────────────────────────────────────────────────────────────
 *  - Un éditeur GÉNÉRALISTE dont le rejeu est une option payante (une plateforme
 *    d'APM, un outil produit qui embarque `rrweb` sous le capot) n'a pas de nom
 *    reconnaissable : son hôte est celui de son offre entière, et l'interdire
 *    reviendrait à interdire des capacités qui n'ont rien à voir. La règle 3
 *    reste alors tenue par la RELECTURE, et cette phrase existe pour qu'on ne
 *    croie pas le sujet clos. `posthog-js` est le cas type : produit d'analytique
 *    dont l'enregistrement est un réglage, absent du dépôt, non banni ici.
 *  - Une capture ÉCRITE À LA MAIN (un `MutationObserver` qui poste le DOM) ne
 *    porte aucun nom d'éditeur. Aucune liste ne l'attrape ; seule une revue de
 *    PR le peut.
 *  - Le fichier de cette garde est EXCLU de son propre corpus : sans cela, la
 *    liste ci-dessous se dénoncerait elle-même — le défaut exact d'une garde du
 *    dépôt qui s'était attrapée sur ses propres numéros d'issue.
 */

/** `apps/api/src/architecture` → quatre niveaux au-dessus = la racine. */
const REPO_ROOT = join(__dirname, '..', '..', '..', '..')

/**
 * Les éditeurs d'enregistrement de session, en jeton de nom de paquet. Un jeton
 * n'est ici que s'il ne peut PAS être un mot ordinaire : `clarity` n'y est pas,
 * il est traité en {@link EXACT_BANS}.
 */
const VENDORS: ReadonlySet<string> = new Set([
  'hotjar',
  'fullstory',
  'logrocket',
  'smartlook',
  'mouseflow',
  'rrweb',
  'inspectlet',
  'sessionstack',
  'luckyorange',
  'contentsquare',
  'glassbox',
  'quantummetric',
  'sessioncam',
  'crazyegg',
])

/** Les noms complets dont aucun segment n'est reconnaissable seul. */
const EXACT_BANS: ReadonlySet<string> = new Set(['@microsoft/clarity', 'clarity-js', 'clarity-tracker'])

/**
 * Les hôtes servant un enregistreur. Chacun porte un POINT : c'est ce qui
 * empêche `clarity.ms` d'attraper le mot « clarity », et `rrweb.io` d'attraper
 * une phrase.
 */
const FORBIDDEN_HOSTS: readonly string[] = [
  'hotjar.com',
  'hotjar.io',
  'fullstory.com',
  'logrocket.io',
  'logrocket.com',
  'lr-ingest.io',
  'smartlook.com',
  'smartlook.cloud',
  'clarity.ms',
  'mouseflow.com',
  'inspectlet.com',
  'luckyorange.com',
  'luckyorange.net',
  'sessionstack.com',
  'quantummetric.com',
  'contentsquare.net',
  'glassboxdigital.io',
  'rrweb.io',
  'sessioncam.com',
  'crazyegg.com',
]

/** `@scope/name/sub` → `@scope/name` ; `name/sub` → `name`. Un chemin relatif
 *  (`./x`) ou absolu ressort tel quel et ne peut correspondre à rien. */
function packageNameOf(specifier: string): string {
  if (specifier.startsWith('@')) {
    const parts = specifier.split('/')
    return parts.length > 1 ? `${parts[0]}/${parts[1]}` : specifier
  }
  return specifier.split('/')[0] ?? specifier
}

/**
 * La raison du refus, ou `null`. Comme GA-64, elle dit CE QU'ELLE A RECONNU :
 * une garde qui répond seulement « non » se contourne par un renommage.
 */
function replayOffence(specifier: string): string | null {
  const name = packageNameOf(specifier).toLowerCase()
  if (!name || name.startsWith('.') || name.startsWith('/')) return null
  if (EXACT_BANS.has(name)) return `paquet d'enregistrement de session (« ${name} »)`
  const scope = name.startsWith('@') ? name.slice(1).split('/')[0] : null
  if (scope && VENDORS.has(scope)) return `éditeur d'enregistrement de session (« ${scope} »)`
  const bare = name.startsWith('@') ? (name.split('/')[1] ?? '') : name
  const segment = bare.split(/[-.]/).find(part => VENDORS.has(part))
  return segment ? `éditeur d'enregistrement de session (« ${segment} »)` : null
}

/** Le premier hôte d'enregistrement trouvé dans un texte, ou `null`. */
function hostOffence(text: string): string | null {
  const lower = text.toLowerCase()
  const host = FORBIDDEN_HOSTS.find(candidate => lower.includes(candidate))
  return host ? `hôte d'enregistrement de session (« ${host} »)` : null
}

const SOURCE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.html']
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'dist', 'build', '.next', 'coverage', '.turbo'])

function walk(directory: string): readonly string[] {
  if (!existsSync(directory)) return []
  const found: string[] = []
  for (const entry of readdirSync(directory)) {
    if (SKIPPED_DIRECTORIES.has(entry)) continue
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) found.push(...walk(path))
    else if (SOURCE_EXTENSIONS.some(extension => entry.endsWith(extension))) found.push(path)
  }
  return found
}

/** Tous les `package.json` d'espace de travail — racine comprise. Le verrou de
 *  dépendances n'est pas lu : il porte le graphe TRANSITIF, où `rrweb` peut
 *  apparaître sous une dépendance légitime sans qu'aucun code ne l'appelle.
 *  Ce qu'on garde est ce que le dépôt DEMANDE. */
function workspaceManifests(): readonly string[] {
  const manifests = [join(REPO_ROOT, 'package.json')]
  for (const group of ['apps', 'packages']) {
    const directory = join(REPO_ROOT, group)
    if (!existsSync(directory)) continue
    for (const entry of readdirSync(directory)) {
      const manifest = join(directory, entry, 'package.json')
      if (existsSync(manifest)) manifests.push(manifest)
    }
  }
  const e2e = join(REPO_ROOT, 'e2e', 'package.json')
  if (existsSync(e2e)) manifests.push(e2e)
  return manifests
}

/** Nom de dépendance → manifeste qui la demande. Les quatre sections comptent :
 *  une dépendance de développement s'exécute quand même dans un `dev`. */
function declaredDependencies(): ReadonlyMap<string, string> {
  const found = new Map<string, string>()
  for (const manifest of workspaceManifests()) {
    const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as Record<string, unknown>
    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const block = parsed[section]
      if (!block || typeof block !== 'object') continue
      for (const name of Object.keys(block as Record<string, unknown>)) {
        if (!found.has(name)) found.set(name, manifest.slice(REPO_ROOT.length + 1))
      }
    }
  }
  return found
}

/** Les dossiers de code balayés. `apps/api` en fait partie : un enregistreur ne
 *  tourne que dans un navigateur, mais rien n'empêche l'API de SERVIR le script
 *  qui le charge — et un balayage qui s'arrêterait au front laisserait cette
 *  porte ouverte sans qu'on l'ait décidé. */
const SCANNED_DIRECTORIES = [
  join(REPO_ROOT, 'apps', 'web', 'src'),
  join(REPO_ROOT, 'apps', 'website', 'src'),
  join(REPO_ROOT, 'apps', 'dashboard-manager', 'src'),
  join(REPO_ROOT, 'apps', 'api', 'src'),
  join(REPO_ROOT, 'apps', 'mcp', 'src'),
  join(REPO_ROOT, 'packages'),
]

/** Les fichiers HTML d'entrée, hors de tout `src`. C'est l'endroit exact où un
 *  `<script src="…">` d'éditeur se colle en premier. */
const EXTRA_FILES = [join(REPO_ROOT, 'apps', 'web', 'index.html')]

function scannedFiles(): readonly string[] {
  const files = [...SCANNED_DIRECTORIES.flatMap(walk), ...EXTRA_FILES.filter(existsSync)]
  // Le fichier de cette garde porte les listes : sans cette exclusion, elle se
  // dénoncerait elle-même.
  return files.filter(path => path !== __filename)
}

/** `from 'x'`, `require('x')`, `import('x')` — les trois formes du dépôt. */
const SPECIFIER_PATTERNS: readonly RegExp[] = [
  /\bfrom\s*['"]([^'"]+)['"]/g,
  /\brequire\(\s*['"]([^'"]+)['"]\s*\)/g,
  /\bimport\(\s*['"]([^'"]+)['"]\s*\)/g,
]

describe('GA-240 — aucun enregistrement de session', () => {
  const dependencies = declaredDependencies()
  const files = scannedFiles()

  const specifiers = new Map<string, string>()
  const hosts: string[] = []
  for (const path of files) {
    const source = readFileSync(path, 'utf8')
    const relative = path.slice(REPO_ROOT.length + 1)
    for (const pattern of SPECIFIER_PATTERNS) {
      // ⚠️ Une RegExp `g` est STATEFUL : `matchAll` repart de zéro à chaque
      // appel, `test()` non — piège déjà payé par ce dépôt.
      for (const match of source.matchAll(pattern)) {
        const specifier = match[1]
        if (specifier && !specifiers.has(specifier)) specifiers.set(specifier, relative)
      }
    }
    const offence = hostOffence(source)
    if (offence) hosts.push(`${relative} — ${offence}`)
  }

  it('lit un corpus non vide, sur les trois portes', () => {
    // Une garde qui ne lit rien est verte pour toujours. Chaque témoin EXISTE
    // aujourd'hui : si un extracteur casse, ceci tombe avant la règle.
    // Mesuré le 07/09/2026 : 173 dépendances déclarées sur 21 manifestes,
    // 5 763 fichiers balayés, 5 250 spécificateurs distincts. Les bornes sont
    // volontairement basses — c'est un plancher contre un corpus VIDE, pas un
    // compte à maintenir.
    expect(dependencies.has('react')).toBe(true)
    expect(dependencies.has('typescript')).toBe(true)
    expect(dependencies.size).toBeGreaterThan(100)
    expect(specifiers.has('react')).toBe(true)
    expect(specifiers.size).toBeGreaterThan(1000)
    expect(files.length).toBeGreaterThan(3000)
    // Le fichier d'entrée HTML est bien dans le corpus : c'est la porte n°3.
    expect(files.some(path => path.endsWith('apps/web/index.html'))).toBe(true)
  })

  it('lit bien le mot « clarity » et le laisse passer — la garde vise un OUTIL, pas un mot', () => {
    // Le témoin de non-sur-attrapage : `clarity` seul reste possible, seuls
    // `@microsoft/clarity` et l'hôte `clarity.ms` sont refusés.
    expect(replayOffence('clarity')).toBeNull()
    expect(replayOffence('@microsoft/clarity')).not.toBeNull()
    expect(hostOffence('const clarity = computeClarityScore()')).toBeNull()
  })

  it('aucun `package.json` ne demande un enregistreur de session', () => {
    const offenders = [...dependencies]
      .map(([name, manifest]) => {
        const offence = replayOffence(name)
        return offence ? `${manifest} : ${name} — ${offence}` : null
      })
      .filter((entry): entry is string => entry !== null)
    expect(offenders.sort()).toEqual([])
  })

  it('aucun module d’enregistrement n’est importé', () => {
    const offenders = [...specifiers]
      .map(([specifier, file]) => {
        const offence = replayOffence(specifier)
        return offence ? `${file} : ${specifier} — ${offence}` : null
      })
      .filter((entry): entry is string => entry !== null)
    expect(offenders.sort()).toEqual([])
  })

  it('aucun hôte d’enregistrement n’est écrit en clair', () => {
    expect(hosts.sort()).toEqual([])
  })

  it('la garde sait dire NON — les formes sous lesquelles la demande revient', () => {
    for (const forbidden of [
      'hotjar',
      'react-hotjar',
      '@hotjar/browser',
      '@fullstory/browser',
      'logrocket',
      'logrocket-react',
      '@logrocket/react-native',
      'smartlook-client',
      'mouseflow',
      'rrweb',
      'rrweb-player',
      '@rrweb/record',
      '@microsoft/clarity',
      'clarity-js',
      'inspectlet',
      'crazyegg',
    ]) {
      expect(`${forbidden} → ${replayOffence(forbidden) !== null}`).toBe(`${forbidden} → true`)
    }
    for (const snippet of [
      '<script src="https://static.hotjar.com/c/hotjar-1234.js"></script>',
      "script.src = 'https://edge.fullstory.com/s/fs.js'",
      'https://cdn.lr-ingest.io/LogRocket.min.js',
      '<script src="https://www.clarity.ms/tag/abcd"></script>',
      "import('https://cdn.rrweb.io/record.js')",
    ]) {
      expect(`${snippet} → ${hostOffence(snippet) !== null}`).toBe(`${snippet} → true`)
    }
  })

  it('la garde n’interdit PAS ce qui est légitime', () => {
    // Chacun de ces noms est soit dans le dépôt, soit une capacité que la
    // doctrine autorise explicitement. Une garde qui interdit trop est un défaut
    // au même titre qu'une garde borgne.
    for (const allowed of [
      'react',
      'zod',
      '@bellum/contracts',
      'express-session',
      'connect-redis',
      'clarity',
      './analytics',
      '../lib/analytics',
      'node:crypto',
      '@vercel/analytics',
      '@vercel/speed-insights',
      'plausible-tracker',
      '@sentry/node',
      'session-file-store',
      'replay-queue',
    ]) {
      expect(`${allowed} → ${replayOffence(allowed)}`).toBe(`${allowed} → null`)
    }
    for (const innocent of [
      'const sessionId = crypto.randomUUID()',
      'await this.replayFailedJobs()',
      'ImportSessionEntity',
      "logger.warn('session expired')",
      'https://plausible.io/js/script.js',
      'https://app.bellum-ai.com/sessions',
    ]) {
      expect(`${innocent} → ${hostOffence(innocent)}`).toBe(`${innocent} → null`)
    }
  })
})
