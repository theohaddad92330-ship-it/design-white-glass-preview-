import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'

/**
 * GA-178 — aucune route LITTÉRALE ne se fait capturer par un `:param`
 * enregistré plus tôt sur le même préfixe.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT QUI L'A FAIT ÉCRIRE — n°20 (30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * `GET /accounts/access-summary` répondait 500 en production. Neuf contrôleurs
 * portent `@Controller('accounts')`. `AccountsController` déclare `@Get(':id')`
 * SANS distinguer les segments ; Nest/Express enregistrent les routes dans
 * l'ordre des MODULES (`app.module.ts`), et `AccountsModule` était importé
 * avant `AccountAccessModule` — si bien que `:id` captait `access-summary`
 * comme s'il s'agissait d'un identifiant de compte, et `WHERE a.id =
 * 'access-summary'` jetait `invalid input syntax for type uuid` côté SQL.
 *
 * Un test unitaire sur `accessSummary()` — ou sur `controller.findOne(id,
 * user)` appelé directement — passait au vert pendant que la production
 * tombait : ni l'un ni l'autre ne passe par le PIPELINE HTTP réel de Nest, où
 * vivent le pipe de validation ET l'ordre d'enregistrement des routes. Le
 * commentaire d'`account-access.controller.ts` le disait déjà, avant même ce
 * correctif : « Route LITTÉRALE déclarée avant `:id/access` : … un `:id`
 * gourmand ne doit jamais pouvoir capturer `access-summary` ». C'était vrai
 * DANS ce fichier — mais la garde qui l'aurait protégé n'existait pas ENCORE,
 * et `AccountsController` vit dans un fichier qu'il ne pouvait pas voir.
 * « La garde protège la forme qu'elle a vue. »
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle reconstruit, pour CHAQUE préfixe de contrôleur du dépôt (`accounts`,
 * `contacts`, `notes`, …) et CHAQUE verbe HTTP, l'ordre RÉEL d'enregistrement
 * des routes — module par module dans l'ordre du tableau `imports: […]` de
 * `app.module.ts`, puis contrôleur par contrôleur dans l'ordre du tableau
 * `controllers: […]` de chaque module, puis route par route dans l'ordre de
 * déclaration DANS le fichier du contrôleur. Une route littérale (aucun
 * segment ne commence par `:`) capturée par un `:param` à un seul segment
 * enregistré plus tôt est une violation.
 *
 * ⚠️ HORS PÉRIMÈTRE, ASSUMÉ : seules les collisions à UN segment sont
 * détectées (`access-summary` vs `:id`) — c'est la forme exacte du n°20, et
 * celle que le §5 du correctif énumère. Une collision à deux segments ou plus
 * (`:id/foo` vs `bar/baz`) n'est pas mesurée ici ; `module-boundaries.spec.ts`
 * et `endpoint-guards.spec.ts` documentent le même choix de maille pour
 * d'autres questions — mesurer plus large sans preuve tournerait à la
 * simulation. Un `@Controller` dont l'argument n'est pas un littéral simple
 * (config objet, décorateur composé) est ignoré, pas supposé sûr.
 *
 * Deux pièges déjà payés dans ce dépôt, évités ici : `RegExp.test()` avec le
 * drapeau `g` est STATEFUL (tout ici passe par `matchAll`, jamais `test` sur
 * un motif global) ; un extracteur de décorateur qui s'arrête à la première
 * parenthèse ne voit qu'un contrôleur sur trois quand plusieurs classes
 * partagent un fichier (`crm-core.controller.ts` en a trois) — celui-ci
 * retrouve, pour CHAQUE classe, le `@Controller(...)` qui lui est propre en
 * cherchant le plus proche AVANT sa déclaration, jamais un `source.includes`
 * global.
 */

const API_SRC = join(__dirname, '..')
const MODULES_DIR = join(API_SRC, 'modules')
const APP_MODULE_PATH = join(API_SRC, 'app.module.ts')

interface RouteEntry {
  method: string
  prefix: string
  segments: string[]
  isLiteral: boolean
  display: string
  file: string
  className: string
}

interface Capture {
  literal: RouteEntry
  capturedBy: RouteEntry
}

/**
 * Retire `/* … *\/` et `// …` AVANT toute extraction. Sans ça, le commentaire
 * du n°20 lui-même — qui MENTIONNE `AccountsModule` en prose — se lisait comme
 * une SECONDE entrée du tableau `imports`, dupliquait chaque route
 * d'`AccountsController` et cassait l'ordre mesuré. Piège déjà nommé ailleurs
 * dans ce dépôt (`kill-switch-registry.spec.ts`) : un commentaire qui CITE un
 * nom n'en est pas une DÉCLARATION.
 */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

function controllerFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...controllerFiles(full))
      continue
    }
    if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

/** `import { XModule } from './modules/…'` → nom du module → chemin de fichier. */
function localModuleImports(moduleSource: string, baseDir: string = API_SRC): Map<string, string> {
  const map = new Map<string, string>()
  const pattern = /import\s*\{\s*([^}]+)\s*\}\s*from\s*'(\.{1,2}\/[^']+)'/g
  for (const match of moduleSource.matchAll(pattern)) {
    const names = (match[1] as string)
      .split(',')
      .map(name => name.trim())
      .filter(Boolean)
    const relPath = match[2] as string
    for (const name of names) {
      if (name.endsWith('Module')) map.set(name, join(baseDir, `${relPath}.ts`))
    }
  }
  return map
}

/**
 * #2160.9 / #4504.3 (garde #944) — l'ordre RÉEL d'enregistrement de Nest est un
 * parcours en profondeur, pré-ordre : un module est inséré, PUIS ses `imports`
 * récursivement. `ContactsModule` importe `CrmCoreModule` : les routes de
 * CrmCore (`PATCH /contacts/:id`) passent donc avant celles d'`AssignmentModule`
 * (`PATCH /contacts/assign`) même quand `AssignmentModule` est listé plus bas
 * dans `app.module.ts`. Lire le seul tableau de l'AppModule ne le voyait pas.
 */
function moduleRegistrationOrder(appModuleSource: string): Map<string, string> {
  const importsArray = bracketArray(appModuleSource, 'imports')
  if (!importsArray) throw new Error('`imports: […]` introuvable dans app.module.ts')
  const appModules = localModuleImports(appModuleSource)
  const order = new Map<string, string>()
  const visit = (name: string, file: string): void => {
    if (order.has(name)) return
    order.set(name, file)
    let source: string
    try {
      source = stripComments(readFileSync(file, 'utf8'))
    } catch {
      return
    }
    const nested = bracketArray(source, 'imports')
    if (!nested) return
    const known = localModuleImports(source, dirname(file))
    for (const child of tokensMatching(nested, 'Module')) {
      const childFile = known.get(child)
      if (childFile) visit(child, childFile)
    }
  }
  for (const name of tokensMatching(importsArray, 'Module')) {
    const file = appModules.get(name)
    if (file) visit(name, file)
  }
  return order
}

/**
 * Le contenu, équilibré en crochets, de `key: [ … ]` — trouve la PREMIÈRE
 * occurrence de `key: [` puis compte les `[`/`]` jusqu'au retour à zéro. Les
 * objets/parenthèses imbriqués (ex. `ThrottlerModule.forRootAsync({...})`) ne
 * faussent rien : seuls `[` et `]` sont comptés, et la syntaxe est bien
 * formée.
 */
function bracketArray(source: string, key: string): string | null {
  const anchor = `${key}: [`
  const start = source.indexOf(anchor)
  if (start < 0) return null
  const openIndex = start + anchor.length - 1
  let depth = 0
  let i = openIndex
  for (; i < source.length; i++) {
    if (source[i] === '[') depth++
    else if (source[i] === ']') {
      depth--
      if (depth === 0) break
    }
  }
  return source.slice(openIndex + 1, i)
}

function tokensMatching(arrayText: string, suffix: string): string[] {
  const pattern = new RegExp(`\\b([A-Z]\\w*${suffix})\\b`, 'g')
  return [...arrayText.matchAll(pattern)].map(match => match[1] as string)
}

/** Nom de classe → { fichier, source, position de `export class Nom`}. */
function controllerClassIndex(): Map<string, { file: string; source: string; start: number }> {
  const map = new Map<string, { file: string; source: string; start: number }>()
  for (const file of controllerFiles(MODULES_DIR)) {
    const source = stripComments(readFileSync(file, 'utf8'))
    for (const match of source.matchAll(/export class (\w+)/g)) {
      map.set(match[1] as string, { file, source, start: match.index as number })
    }
  }
  return map
}

/** Le `@Controller(...)` le plus proche AVANT `start` — propre à CETTE classe,
 *  jamais celui d'une classe voisine dans un fichier à plusieurs classes. */
function extractPrefix(header: string): string | null {
  const idx = header.lastIndexOf('@Controller(')
  if (idx < 0) return null
  const rest = header.slice(idx + '@Controller('.length)
  const quoted = rest.match(/^\s*'([^']*)'/)
  if (quoted) return quoted[1] as string
  if (rest.trimStart().startsWith(')')) return '' // @Controller() — pas de préfixe
  return null // forme non supportée (objet de config, etc.) — ignorée, pas supposée sûre
}

const ROUTE_DECORATOR = /@(Get|Post|Patch|Put|Delete)\(\s*(?:'([^']*)')?\s*\)/g

function classBody(source: string, start: number): string {
  const next = source.indexOf('export class', start + 'export class'.length)
  return next < 0 ? source.slice(start) : source.slice(start, next)
}

function extractRoutes(body: string): { method: string; path: string }[] {
  return [...body.matchAll(ROUTE_DECORATOR)].map(match => ({
    method: (match[1] as string).toUpperCase(),
    path: (match[2] as string | undefined) ?? '',
  }))
}

/**
 * Reconstruit, dans l'ordre RÉEL d'enregistrement Nest, toutes les routes de
 * tous les contrôleurs atteints depuis `app.module.ts` : module par module
 * (ordre du tableau `imports`), puis contrôleur par contrôleur (ordre du
 * tableau `controllers` de CE module), puis route par route (ordre de
 * déclaration dans le fichier).
 */
function buildRouteEntries(rawAppModuleSource: string): RouteEntry[] {
  const appModuleSource = stripComments(rawAppModuleSource)
  const modules = moduleRegistrationOrder(appModuleSource)

  const classIndex = controllerClassIndex()
  const entries: RouteEntry[] = []

  for (const moduleFile of modules.values()) {
    let moduleSource: string
    try {
      moduleSource = stripComments(readFileSync(moduleFile, 'utf8'))
    } catch {
      continue // module hors de `modules/` ou introuvable — hors périmètre
    }
    const controllersArray = bracketArray(moduleSource, 'controllers')
    if (!controllersArray) continue
    for (const className of tokensMatching(controllersArray, 'Controller')) {
      const found = classIndex.get(className)
      if (!found) continue
      const header = found.source.slice(0, found.start)
      const prefix = extractPrefix(header)
      if (prefix === null) continue
      const body = classBody(found.source, found.start)
      for (const route of extractRoutes(body)) {
        // Uniquement les segments de la ROUTE — le préfixe est déjà la clé de
        // regroupement (`prefix`) ; l'y ajouter décalerait `access-summary`
        // (un segment) en un faux « deux segments » qui échapperait à la
        // détection tout en RESSEMBLANT à une extraction correcte.
        const segments = route.path.split('/').filter(Boolean)
        entries.push({
          method: route.method,
          prefix,
          segments,
          isLiteral: segments.every(segment => !segment.startsWith(':')),
          display: `${route.method} /${prefix}${route.path ? `/${route.path}` : ''}`,
          file: found.file.slice(MODULES_DIR.length + 1),
          className,
        })
      }
    }
  }
  return entries
}

/**
 * Une route littérale À UN SEGMENT est CAPTURÉE si un `:param` à un seul
 * segment, même méthode, même préfixe, a été enregistré AVANT elle.
 */
function findSingleSegmentCaptures(entries: RouteEntry[]): Capture[] {
  const firstParam = new Map<string, RouteEntry>()
  const captures: Capture[] = []
  for (const entry of entries) {
    if (entry.segments.length !== 1) continue
    const key = `${entry.method} /${entry.prefix}`
    if (entry.isLiteral) {
      const earlier = firstParam.get(key)
      if (earlier) captures.push({ literal: entry, capturedBy: earlier })
    } else if (!firstParam.has(key)) {
      firstParam.set(key, entry)
    }
  }
  return captures
}

describe('GA-178 — le mécanisme, sur un app.module.ts synthétique', () => {
  /**
   * Preuve que le mécanisme lui-même distingue les deux ordres — indépendante
   * du contenu réel de `app.module.ts`, pour isoler « l'algorithme est juste »
   * de « le dépôt est juste aujourd'hui » (vérifié dans le describe suivant).
   */
  function synthetic(order: ['AccountsModule', 'AccountAccessModule'] | ['AccountAccessModule', 'AccountsModule']) {
    return `
import { AccountsModule } from './modules/accounts/accounts.module'
import { AccountAccessModule } from './modules/account-access/account-access.module'
@Module({
  imports: [
    ${order[0]},
    ${order[1]},
  ],
})
export class AppModule {}
`
  }

  it('sait dire NON — AccountsModule avant AccountAccessModule reproduit le n°20', () => {
    const entries = buildRouteEntries(synthetic(['AccountsModule', 'AccountAccessModule']))
    const captures = findSingleSegmentCaptures(entries)
    const hit = captures.find(
      c => c.literal.display === 'GET /accounts/access-summary' && c.capturedBy.display === 'GET /accounts/:id',
    )
    expect(hit).toBeDefined()
    expect(hit?.capturedBy.className).toBe('AccountsController')
    expect(hit?.literal.className).toBe('AccountAccessController')
  })

  it('sait dire NON — import TRANSITIF : ContactsModule (→ CrmCoreModule) avant AssignmentModule reproduit #2160.9', () => {
    const source = `
import { ContactsModule } from './modules/contacts/contacts.module'
import { AssignmentModule } from './modules/assignment/assignment.module'
@Module({ imports: [ContactsModule, AssignmentModule] })
export class AppModule {}
`
    const captures = findSingleSegmentCaptures(buildRouteEntries(source))
    const hit = captures.find(
      c => c.literal.display === 'PATCH /contacts/assign' && c.capturedBy.display === 'PATCH /contacts/:id',
    )
    expect(hit?.capturedBy.className).toBe('ContactRecordController')
    // Et l'ordre inverse est propre pour ce couple.
    const fixed = findSingleSegmentCaptures(
      buildRouteEntries(source.replace('[ContactsModule, AssignmentModule]', '[AssignmentModule, ContactsModule]')),
    )
    expect(fixed.find(c => c.literal.display === 'PATCH /contacts/assign')).toBeUndefined()
  })

  it('dans l’ordre corrigé, plus aucune capture à un segment sous `accounts`', () => {
    const entries = buildRouteEntries(synthetic(['AccountAccessModule', 'AccountsModule']))
    const captures = findSingleSegmentCaptures(entries).filter(c => c.literal.prefix === 'accounts')
    expect(captures).toEqual([])
  })
})

describe('GA-178 — le dépôt RÉEL, aujourd’hui', () => {
  const appModuleSource = readFileSync(APP_MODULE_PATH, 'utf8')
  const entries = buildRouteEntries(appModuleSource)

  it('la garde LIT quelque chose — un corpus vide passerait au vert pour toujours', () => {
    expect(entries.length).toBeGreaterThan(200)
    const accountsEntries = entries.filter(e => e.prefix === 'accounts')
    // Les neuf contrôleurs `@Controller('accounts')` vérifiés au 30/08/2026 —
    // si ce nombre baisse fortement, un contrôleur n'est plus atteint depuis
    // `app.module.ts` et le reste de cette garde tourne sur un corpus amputé.
    expect(accountsEntries.length).toBeGreaterThanOrEqual(30)
    expect(new Set(accountsEntries.map(e => e.className)).size).toBeGreaterThanOrEqual(9)
  })

  it('elle reconnaît bien la route qui a cassé le n°20, dans sa forme réelle', () => {
    const accessSummary = entries.find(e => e.display === 'GET /accounts/access-summary')
    const findOneById = entries.find(e => e.display === 'GET /accounts/:id')
    expect(accessSummary).toEqual(
      expect.objectContaining({ className: 'AccountAccessController', isLiteral: true, segments: ['access-summary'] }),
    )
    expect(findOneById).toEqual(
      expect.objectContaining({ className: 'AccountsController', isLiteral: false, segments: [':id'] }),
    )
  })

  it('AccountAccessModule est bien enregistré AVANT AccountsModule', () => {
    // Sans `stripComments`, le docblock du n°20 juste au-dessus de
    // `AccountAccessModule,` — qui MENTIONNE les deux noms en prose — se lit
    // comme une entrée du tableau et aurait fait passer ce test pour la
    // mauvaise raison. Même piège que `buildRouteEntries`, tenu séparément ici
    // parce que ce test n'y passe pas.
    const importsArray = bracketArray(stripComments(appModuleSource), 'imports') as string
    const order = tokensMatching(importsArray, 'Module')
    const accessIndex = order.indexOf('AccountAccessModule')
    const accountsIndex = order.indexOf('AccountsModule')
    expect(accessIndex).toBeGreaterThanOrEqual(0)
    expect(accountsIndex).toBeGreaterThanOrEqual(0)
    expect(accessIndex).toBeLessThan(accountsIndex)
  })

  it('aucune route littérale à un segment n’est capturée par un `:param` plus tôt — tout préfixe confondu', () => {
    const captures = findSingleSegmentCaptures(entries)
    if (captures.length > 0) {
      throw new Error(
        [
          'Route(s) littérale(s) capturée(s) par un `:param` enregistré plus tôt :',
          ...captures.map(
            c =>
              `  - ${c.literal.display} (${c.literal.file}) capturée par ${c.capturedBy.display} (${c.capturedBy.file})`,
          ),
          '',
          'Corrige en important le module de la route littérale AVANT celui du `:param`',
          'dans `app.module.ts` (voir le commentaire du n°20), ou en ajoutant un pipe de',
          "validation qui rejette le `:param` sur cette forme — mais l'ordre est le VRAI",
          'correctif, le pipe n’est que la ceinture.',
        ].join('\n'),
      )
    }
    expect(captures).toEqual([])
  })
})
