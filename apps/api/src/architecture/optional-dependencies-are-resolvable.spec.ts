import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * GA-365 — une dépendance `@Optional()` est RÉSOLUBLE, ou EXEMPTÉE avec sa raison.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────────
 * `@Optional()` et `?.` forment un couple qui AVALE la panne. Quand le module
 * qui déclare un fournisseur n'atteint pas le jeton d'un de ses paramètres
 * `@Optional()`, Nest injecte `undefined` : l'application DÉMARRE, le garde
 * GA-20 (repository déclaré) ne voit rien, le typecheck ne voit rien, et les
 * tests unitaires encore moins — ils construisent le service à la main avec un
 * bouchon, donc ils ne passent JAMAIS par l'injection. À l'exécution, l'appel
 * `this.dep?.faire(...)` ne fait rien, n'écrit rien et ne JOURNALISE rien.
 * La capacité est morte, et rien ne le dit.
 *
 * Ce dépôt l'a payé au moins trois fois :
 *
 *  · `CostAlertService` appelait `withSingletonLock` sans que `LocksModule` soit
 *    importé — le verrou existait en toutes lettres et ne verrouillait rien.
 *    L'alerte de coût partait une fois PAR RÉPLIQUE, tous les matins
 *    (cf. le commentaire de `analytics.module.ts`, gardes GA-69 / GA-76) ;
 *
 *  · #2120.57 / #2297.23 — la mesure de durée d'enrichissement. Ici la chaîne
 *    était JUSTE (`AnalyticsModule` est `@Global()` et exporte le service), mais
 *    rien ne l'empêchait de cesser de l'être : retirer une seule entrée d'un
 *    tableau `exports` suffit à rendre la capacité muette sans qu'aucun test ne
 *    tombe. `app-module-boots.spec.ts` verrouille désormais ce couple-là sur le
 *    graphe réel ; la présente garde couvre la CLASSE, pas le cas ;
 *
 *  · `JwtStrategy.sessions` — trouvé PAR cette garde, le 20/09/2026, et non
 *    l'inverse. Voir `SessionRegistryModule`.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET CE QU'ELLE NE SAIT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────────
 * Elle lit les `*.module.ts` (leurs `imports` / `providers` / `exports` /
 * `controllers` et leur `@Global()`), puis le CONSTRUCTEUR de chaque classe
 * qu'un module déclare. Elle retient les paramètres `@Optional()` dont le type
 * est une CLASSE `@Injectable()` du dépôt, et vérifie que le module déclarant
 * peut l'atteindre : fournisseur local, module `@Global()` qui l'exporte, ou
 * module importé (en suivant les ré-exports et les `forwardRef`).
 *
 * Hors périmètre, à dessein — d'autres gardes les tiennent, et les mélanger
 * ferait une garde qui accuse ce qu'elle ne comprend pas :
 *  · `@InjectRepository(...)` → GA-20 (`injected-repositories-declared`) ;
 *  · `@Inject(TOKEN)` (jetons string/Symbol, `useFactory`) → le jeton n'est pas
 *    une classe, la provenance ne se lit pas dans le type ;
 *  · `@InjectQueue(...)` → BullMQ, enregistré par `registerQueue`.
 */

const API_SRC = resolve(__dirname, '..')

// ─────────────────────────────────────────────────────────────────────────────
// LE REGISTRE DES EXEMPTIONS — un cliquet, jamais une échappatoire
// ─────────────────────────────────────────────────────────────────────────────
/**
 * Une `@Optional()` LÉGITIME existe : une dépendance réellement facultative
 * SELON LA CONFIGURATION, dont l'absence est un comportement voulu et écrit.
 *
 * Chaque entrée porte sa raison. La clé est `Module/Classe.paramètre`, si bien
 * qu'une même classe enregistrée par deux modules s'exempte — ou pas — module
 * par module : c'est exactement la distinction que le défaut `JwtStrategy`
 * a coûté.
 *
 * ⚠️ Le cliquet joue dans les DEUX sens. Une entrée qui n'est plus une
 * violation doit être RETIRÉE (le test ci-dessous le vérifie) : sans cela le
 * registre pourrit, et une exemption périmée finit par couvrir un défaut neuf
 * qui porte le même nom.
 *
 * ⚠️ On n'ajoute JAMAIS une ligne ici pour faire passer le test. Une capacité
 * qu'on veut voir marcher se CÂBLE ; on n'écrit une exemption que lorsque le
 * `undefined` est le comportement attendu, et la raison doit dire lequel.
 */
const EXEMPTIONS = new Map<string, string>()

// ─────────────────────────────────────────────────────────────────────────────
// Lecture du source
// ─────────────────────────────────────────────────────────────────────────────

function tsFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...tsFiles(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/** Blanchit les COMMENTAIRES : un mot en prose n'accuse personne. */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  while (i < src.length) {
    const c = src[i]
    const next = src[i + 1]
    if (c === '/' && next === '/') {
      const j = src.indexOf('\n', i)
      const end = j < 0 ? src.length : j
      out += ' '.repeat(end - i)
      i = end
    } else if (c === '/' && next === '*') {
      const j = src.indexOf('*/', i + 2)
      const end = j < 0 ? src.length : j + 2
      out += ' '.repeat(end - i)
      i = end
    } else if (c === '"' || c === "'" || c === '`') {
      let j = i + 1
      while (j < src.length) {
        if (src[j] === '\\') {
          j += 2
          continue
        }
        if (src[j] === c) {
          j += 1
          break
        }
        j += 1
      }
      // ⚠️ Le littéral est CONSERVÉ tel quel : les chemins d'import vivent
      // dedans, et c'est par eux que la garde retrouve le fichier d'une classe.
      // Les blanchir rendait `LOCAL_IMPORTS` vide — donc ZÉRO dépendance
      // analysée, donc une garde verte qui ne lisait plus rien. Mesuré le
      // 20/09/2026, attrapé par l'assertion « LIT quelque chose ».
      out += src.slice(i, j)
      i = j
    } else {
      out += c
      i += 1
    }
  }
  return out
}

/** `i` pointe sur l'ouvrant ; rend le contenu et l'index juste après le fermant. */
function balanced(s: string, i: number, open: string, close: string): { inner: string; end: number } {
  let depth = 0
  for (let j = i; j < s.length; j += 1) {
    if (s[j] === open) depth += 1
    else if (s[j] === close) {
      depth -= 1
      if (depth === 0) return { inner: s.slice(i + 1, j), end: j + 1 }
    }
  }
  return { inner: '', end: s.length }
}

/** Découpe une liste au niveau 0 (les virgules imbriquées ne comptent pas). */
function topLevelSplit(inner: string): string[] {
  const parts: string[] = []
  let depth = 0
  let cur = ''
  for (const ch of inner) {
    if (ch === '[' || ch === '(' || ch === '{') depth += 1
    else if (ch === ']' || ch === ')' || ch === '}') depth -= 1
    if (ch === ',' && depth === 0) {
      parts.push(cur)
      cur = ''
    } else cur += ch
  }
  parts.push(cur)
  return parts.map(p => p.trim()).filter(p => p.length > 0)
}

const FILES = tsFiles(API_SRC).filter(f => !f.endsWith('.spec.ts'))
const SOURCE = new Map<string, string>(FILES.map(f => [f, stripComments(readFileSync(f, 'utf8'))]))

/** fichier -> { nom local importé : fichier résolu } */
const LOCAL_IMPORTS = new Map<string, Map<string, string>>()
for (const [file, src] of SOURCE) {
  const map = new Map<string, string>()
  const re = /import\s+(?:type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const spec = m[2] as string
    if (!spec.startsWith('.')) continue
    let target = `${resolve(dirname(file), spec)}.ts`
    if (!SOURCE.has(target)) {
      const asIndex = join(resolve(dirname(file), spec), 'index.ts')
      if (SOURCE.has(asIndex)) target = asIndex
    }
    for (const rawName of (m[1] as string).split(',')) {
      let name = rawName.trim()
      if (name.startsWith('type ')) name = name.slice(5).trim()
      if (name.includes(' as ')) name = (name.split(' as ').pop() as string).trim()
      if (name) map.set(name, target)
    }
  }
  LOCAL_IMPORTS.set(file, map)
}

type ModuleMeta = {
  file: string
  isGlobal: boolean
  imports: string[]
  providers: string[]
  exports: string[]
  controllers: string[]
}

function arrayField(body: string, key: string): string[] {
  const m = new RegExp(`(?<![A-Za-z0-9_])${key}\\s*:\\s*\\[`).exec(body)
  if (!m) return []
  const { inner } = balanced(body, m.index + m[0].length - 1, '[', ']')
  return topLevelSplit(inner)
}

/** L'identifiant qu'une entrée enregistre : `X`, `{ provide: X }`, `X.forRoot()`, `forwardRef(() => X)`. */
function identifierOf(entry: string): string | null {
  const fwd = /^forwardRef\s*\(\s*\(\s*\)\s*=>\s*([A-Za-z_]\w*)/.exec(entry)
  if (fwd) return fwd[1] as string
  if (entry.startsWith('{')) {
    const p = /(?<![A-Za-z0-9_])provide\s*:\s*([A-Za-z_]\w*)/.exec(entry)
    return p ? (p[1] as string) : null
  }
  if (/^[A-Za-z_]\w*$/.test(entry)) return entry
  const dyn = /^([A-Za-z_]\w*)\s*\./.exec(entry)
  return dyn ? (dyn[1] as string) : null
}

const MODULES = new Map<string, ModuleMeta>()
for (const [file, src] of SOURCE) {
  if (!file.endsWith('.module.ts')) continue
  const re = /@Module\s*\(/g
  let m: RegExpExecArray | null
  while ((m = re.exec(src)) !== null) {
    const objStart = src.indexOf('{', m.index + m[0].length - 1)
    if (objStart < 0) continue
    const { inner, end } = balanced(src, objStart, '{', '}')
    const named = /export\s+class\s+(\w+)/.exec(src.slice(end, end + 400))
    if (!named) continue
    MODULES.set(named[1] as string, {
      file,
      isGlobal: src.slice(Math.max(0, m.index - 300), m.index).includes('@Global()'),
      imports: arrayField(inner, 'imports'),
      providers: arrayField(inner, 'providers'),
      exports: arrayField(inner, 'exports'),
      controllers: arrayField(inner, 'controllers'),
    })
  }
}

/** Tout ce qu'un module exporte, ré-exports de modules compris. */
function exportClosure(name: string, seen = new Set<string>()): Set<string> {
  const out = new Set<string>()
  const meta = MODULES.get(name)
  if (!meta || seen.has(name)) return out
  seen.add(name)
  for (const entry of meta.exports) {
    const id = identifierOf(entry)
    if (!id) continue
    out.add(id)
    if (MODULES.has(id)) for (const nested of exportClosure(id, seen)) out.add(nested)
  }
  return out
}

/** La règle de Nest : fournisseur local, module `@Global()` exportant, ou import (transitif). */
function resolutionOf(moduleName: string, dependency: string): string | null {
  const meta = MODULES.get(moduleName)
  if (!meta) return null
  if (meta.providers.some(entry => identifierOf(entry) === dependency)) return 'fournisseur local'
  for (const [name, other] of MODULES) {
    if (other.isGlobal && exportClosure(name).has(dependency)) return `@Global ${name}`
  }
  const seen = new Set<string>()
  const stack = meta.imports.map(identifierOf)
  while (stack.length > 0) {
    const id = stack.pop()
    if (!id || seen.has(id) || !MODULES.has(id)) continue
    seen.add(id)
    if (exportClosure(id).has(dependency)) return `import ${id}`
  }
  return null
}

function constructorParams(src: string, className: string): string[] {
  const decl = new RegExp(`(?:export\\s+)?class\\s+${className}\\b`).exec(src)
  if (!decl) return []
  const bodyStart = src.indexOf('{', decl.index + decl[0].length)
  if (bodyStart < 0) return []
  const { inner: body } = balanced(src, bodyStart, '{', '}')
  const ctor = /(?<![A-Za-z0-9_$])constructor\s*\(/.exec(body)
  if (!ctor) return []
  const { inner } = balanced(body, ctor.index + ctor[0].length - 1, '(', ')')
  return topLevelSplit(inner)
}

type OptionalDep = {
  key: string
  moduleName: string
  consumer: string
  param: string
  dependency: string
  resolution: string | null
}

function collect(): OptionalDep[] {
  const found: OptionalDep[] = []
  for (const [moduleName, meta] of MODULES) {
    const localImports = LOCAL_IMPORTS.get(meta.file) ?? new Map<string, string>()
    const declared = [...meta.providers, ...meta.controllers].map(identifierOf)
    for (const consumer of declared) {
      if (!consumer) continue
      const consumerFile = localImports.get(consumer)
      if (!consumerFile) continue
      const consumerSrc = SOURCE.get(consumerFile)
      if (!consumerSrc) continue
      for (const param of constructorParams(consumerSrc, consumer)) {
        if (!param.includes('@Optional()')) continue
        // Familles tenues par d'autres gardes — voir l'en-tête.
        if (/@Inject\(|@InjectRepository\(|@InjectQueue\(/.test(param)) continue
        const typed = /(\w+)\s*\??\s*:\s*([A-Za-z_]\w*)/.exec(param.split('@Optional()').pop() as string)
        if (!typed) continue
        const [, paramName, dependency] = typed as unknown as [string, string, string]
        const dependencyFile = LOCAL_IMPORTS.get(consumerFile)?.get(dependency)
        if (!dependencyFile) continue
        const dependencySrc = SOURCE.get(dependencyFile)
        // Seules les classes `@Injectable()` du dépôt : le reste n'est pas un
        // fournisseur Nest, donc `undefined` n'y est pas une panne silencieuse.
        if (!dependencySrc || !dependencySrc.includes('@Injectable()')) continue
        found.push({
          key: `${moduleName}/${consumer}.${paramName}`,
          moduleName,
          consumer,
          param: paramName,
          dependency,
          resolution: resolutionOf(moduleName, dependency),
        })
      }
    }
  }
  return found
}

const OPTIONAL_DEPS = collect()

describe('GA-365 — une dépendance `@Optional()` est résoluble, ou exemptée avec sa raison', () => {
  it('LIT quelque chose — le graphe de modules et les constructeurs sont vraiment analysés', () => {
    // Un analyseur qui ne lit rien rendrait zéro violation : il serait vert, et
    // faux. Ces bornes sont les mesures du 20/09/2026 (≈130 modules, 156 `@Optional()`
    // typés classe) — elles ne verrouillent pas un chiffre exact, elles refusent
    // qu'on tombe à un sous-ensemble sans s'en apercevoir.
    expect(MODULES.size).toBeGreaterThan(100)
    expect(OPTIONAL_DEPS.length).toBeGreaterThan(100)

    // Et elle lit les bons : le couple de #2120.57, des DEUX côtés.
    const duration = OPTIONAL_DEPS.filter(d => d.dependency === 'EnrichmentDurationService')
    expect(duration.map(d => d.key).sort()).toEqual([
      'ContactsModule/ContactsController.enrichmentDuration',
      'ContactsModule/ContactsService.enrichmentDuration',
    ])
    // Résolu par le module `@Global()` qui l'exporte — pas par un import direct.
    expect(duration.map(d => d.resolution)).toEqual(['@Global AnalyticsModule', '@Global AnalyticsModule'])
  })

  it('sait dire NON — une dépendance que le module déclarant n’atteint pas est une panne silencieuse', () => {
    const unresolved = OPTIONAL_DEPS.filter(d => d.resolution === null && !EXEMPTIONS.has(d.key))
    const report = unresolved.map(
      d =>
        `  · ${d.consumer}.${d.param} (module ${d.moduleName}) n'atteint pas ${d.dependency} — ` +
        `Nest injecte \`undefined\`, l'application DÉMARRE, et l'appel \`this.${d.param}?.…\` ne fait rien.`,
    )
    expect(
      unresolved.length === 0
        ? ''
        : `${unresolved.length} dépendance(s) \`@Optional()\` que leur module ne peut pas résoudre :\n${report.join('\n')}\n` +
            `\nSoit on CÂBLE (importer le module fournisseur, ou extraire un module feuille et l'importer des deux côtés),\n` +
            `soit on EXEMPTE dans \`EXEMPTIONS\` avec la raison pour laquelle \`undefined\` est le comportement VOULU.`,
    ).toBe('')
  })

  it('le registre d’exemptions est un cliquet — une entrée qui n’est plus une violation se retire', () => {
    const stale = [...EXEMPTIONS.keys()].filter(key => {
      const dep = OPTIONAL_DEPS.find(d => d.key === key)
      return dep === undefined || dep.resolution !== null
    })
    expect(
      stale.length === 0
        ? ''
        : `Exemption(s) périmée(s) à retirer de \`EXEMPTIONS\` : ${stale.join(', ')}.\n` +
            `Une exemption qui ne correspond plus à rien finit par couvrir un défaut neuf qui porte le même nom.`,
    ).toBe('')
  })

  it('chaque exemption porte une raison écrite, pas un marqueur', () => {
    for (const [key, reason] of EXEMPTIONS) {
      expect(`${key}: ${reason}`.length).toBeGreaterThan(key.length + 40)
    }
  })
})
