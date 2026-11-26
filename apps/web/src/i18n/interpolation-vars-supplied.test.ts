import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { resources } from '@/i18n/resources'

/**
 * Garde : chaque `{{variable}}` déclarée dans une clé de traduction reçoit une
 * valeur À L'APPEL — dans les deux langues.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI ELLE MANQUAIT — #2592
 * ─────────────────────────────────────────────────────────────────────────
 * `keys-resolve.test.ts` vérifie qu'une clé littérale EXISTE. `parity.test.ts`
 * vérifie que FR et EN déclarent les MÊMES `{{…}}`. Aucune des deux ne
 * vérifie que l'APPEL fournit une valeur pour chaque `{{…}}` déclaré : le
 * 18/09/2026, `DossierReadBlocks.tsx` passait `count` à une clé qui attendait
 * `{{axesCount}}` — la chaîne, juste et bilingue, s'affichait à moitié :
 * « {{axesCount}} axe(s) non mesuré(s)… » littéralement à l'écran.
 *
 * ⚠️ Une garde monolingue est aveugle à l'autre langue (leçon déjà payée) —
 * celle-ci lit les placeholders déclarés dans fr ET en, jamais un seul.
 *
 * ⚠️ Ce qu'elle NE PEUT PAS décider, elle ne le devine pas : une clé
 * dynamique (`t(variable)`), des options passées par une variable
 * (`t('clé', unVariable)`) ou un spread (`{ ...vars }`) sont hors de sa
 * portée — elle les ignore plutôt que de mentir, comme `keys-resolve.test.ts`
 * ignore les clés dynamiques.
 */

const SRC = join(__dirname, '..')
const CATALOG_FR = resources.fr as Record<string, unknown>
const CATALOG_EN = resources.en as Record<string, unknown>
const PLURAL_SUFFIXES = ['_one', '_other', '_zero', '_two', '_few', '_many']

/**
 * Des `{{…}}` qui reçoivent une valeur AILLEURS qu'au `t()` qui les résout —
 * la garde ne les vise pas (« ne pas attraper ce qu'elle ne vise pas ») :
 *  - `brand` / `copilot` : `i18n/index.ts` les pose en `defaultVariables`,
 *    fournis par i18next à CHAQUE interpolation, jamais au call site ;
 *  - `firstName` : `ScreenIntro.tsx` l'injecte lui-même par un
 *    `.replace('{{firstName}}', …)` explicite (jamais via les options de
 *    `t()`) — le design documenté qui gère le cas « pas de prénom connu ».
 */
const GLOBALLY_SUPPLIED = new Set(['brand', 'copilot', 'firstName'])

type Tree = Record<string, unknown>
type Bind = { namespaces: string[]; keyPrefix: string | null }

/** Même garde-fou que `keys-resolve.test.ts` : les commentaires sortent AVANT
 *  la lecture, en épargnant le `//` d'une URL. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(?<!:)\/\/[^\n]*/g, '')
}

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (!/\.tsx?$/.test(entry)) continue
    if (/\.(test|spec)\.tsx?$/.test(entry)) continue
    out.push(full)
  }
  return out
}

/** `useTranslation(...)` → les namespaces liés et le préfixe éventuel — copié
 *  de `keys-resolve.test.ts` pour rester indépendante (une garde ne dépend
 *  pas d'un autre fichier de test). */
function bindsOf(source: string): Map<string, Bind[]> {
  const binds = new Map<string, Bind[]>()
  const pattern =
    /const\s*\{\s*t(?::\s*(\w+))?[^}]*\}\s*=\s*useTranslation\(\s*(\[[^\]]*\]|'[^']*')?\s*(?:,\s*\{[^}]*?keyPrefix:\s*'([^']+)'[^}]*\})?\s*\)/g
  for (const match of source.matchAll(pattern)) {
    const alias = match[1] ?? 't'
    const rawNs = match[2]
    const namespaces = rawNs ? [...rawNs.matchAll(/'([^']+)'/g)].map(m => m[1]) : ['common']
    const list = binds.get(alias) ?? []
    list.push({ namespaces, keyPrefix: match[3] ?? null })
    binds.set(alias, list)
  }
  return binds
}

function valueAt(tree: Tree, path: string): unknown {
  let cursor: unknown = tree
  for (const part of path.split('.')) {
    if (typeof cursor !== 'object' || cursor === null || !(part in (cursor as Record<string, unknown>)))
      return undefined
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return cursor
}

function resolves(catalog: Record<string, unknown>, ns: string, path: string): boolean {
  const tree = catalog[ns] as Tree | undefined
  if (!tree) return false
  if (typeof valueAt(tree, path) === 'string') return true
  return PLURAL_SUFFIXES.some(suffix => typeof valueAt(tree, path + suffix) === 'string')
}

/** Les chaînes réellement résolues pour cette clé — la base, ou ses variantes
 *  de pluriel i18next quand la base n'existe pas. */
function resolvedStrings(catalog: Record<string, unknown>, ns: string, path: string): string[] {
  const tree = catalog[ns] as Tree | undefined
  if (!tree) return []
  const base = valueAt(tree, path)
  if (typeof base === 'string') return [base]
  return PLURAL_SUFFIXES.map(suffix => valueAt(tree, path + suffix)).filter((v): v is string => typeof v === 'string')
}

function placeholdersOf(value: string): Set<string> {
  return new Set([...value.matchAll(/\{\{\s*([\w.]+)\s*\}\}/g)].map(m => m[1]))
}

/** Union des `{{…}}` déclarés côté fr ET côté en pour cette clé. */
function declaredPlaceholders(ns: string, path: string): Set<string> {
  const out = new Set<string>()
  for (const value of [...resolvedStrings(CATALOG_FR, ns, path), ...resolvedStrings(CATALOG_EN, ns, path)]) {
    for (const p of placeholdersOf(value)) out.add(p)
  }
  return out
}

/** Trouve la `}` qui referme le `{` situé à `openIndex`, en ignorant les
 *  accolades qui vivent dans une chaîne ou un template literal. */
function scanBalanced(source: string, openIndex: number): number {
  let depth = 0
  let i = openIndex
  while (i < source.length) {
    const ch = source[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      i++
      while (i < source.length) {
        if (source[i] === '\\') {
          i += 2
          continue
        }
        if (quote === '`' && source[i] === '$' && source[i + 1] === '{') {
          i += 2
          let tdepth = 1
          while (i < source.length && tdepth > 0) {
            if (source[i] === '{') tdepth++
            else if (source[i] === '}') tdepth--
            i++
          }
          continue
        }
        if (source[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    if (ch === '{') depth++
    else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
    i++
  }
  return -1
}

/** Les propriétés top-level d'un corps d'objet (entre ses accolades), en
 *  respectant les niveaux `{}[]()`. */
function splitTopLevel(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  let i = 0
  while (i < body.length) {
    const ch = body[i]
    if (ch === "'" || ch === '"' || ch === '`') {
      const quote = ch
      current += ch
      i++
      while (i < body.length) {
        current += body[i]
        if (body[i] === '\\') {
          i++
          if (i < body.length) current += body[i]
          i++
          continue
        }
        if (body[i] === quote) {
          i++
          break
        }
        i++
      }
      continue
    }
    if ('{[('.includes(ch)) depth++
    if ('}])'.includes(ch)) depth--
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
      i++
      continue
    }
    current += ch
    i++
  }
  if (current.trim()) parts.push(current)
  return parts
}

function keysOfObjectEntries(body: string, supplied: Set<string>): boolean {
  let sawSpread = false
  for (const raw of splitTopLevel(body)) {
    const entry = raw.trim()
    if (!entry) continue
    if (entry.startsWith('...')) {
      sawSpread = true
      continue
    }
    const kv = /^(['"]?)([A-Za-z_$][\w$]*)\1\s*:/.exec(entry)
    if (kv) {
      const key = kv[2]
      supplied.add(key)
      // i18next accepte aussi `replace: { … }` pour passer les variables.
      if (key === 'replace') {
        const braceIdx = entry.indexOf('{')
        if (braceIdx !== -1) {
          const innerEnd = scanBalanced(entry, braceIdx)
          if (innerEnd !== -1) keysOfObjectEntries(entry.slice(braceIdx + 1, innerEnd), supplied)
        }
      }
      continue
    }
    const shorthand = /^([A-Za-z_$][\w$]*)$/.exec(entry)
    if (shorthand) supplied.add(shorthand[1])
    // Une clé calculée (`[expr]: …`) ou autre chose d'illisible : ignorée,
    // ni comptée fournie ni comptée manquante.
  }
  return sawSpread
}

type ParsedOptions = { supplied: Set<string> } | 'opaque'

/** Ce qui suit la clé littérale d'un `t('clé'…)` : un objet d'options
 *  littéral (lu), rien (aucune variable), ou autre chose (opaque — la garde
 *  ne devine pas ce qu'une variable ou un spread contient). */
function parseCallOptions(source: string, index: number): ParsedOptions {
  let i = index
  while (i < source.length && /\s/.test(source[i])) i++
  if (source[i] === ')') return { supplied: new Set() }
  if (source[i] !== ',') return 'opaque'
  i++
  while (i < source.length && /\s/.test(source[i])) i++
  if (source[i] === ')') return { supplied: new Set() }
  if (source[i] !== '{') return 'opaque'
  const end = scanBalanced(source, i)
  if (end === -1) return 'opaque'
  const supplied = new Set<string>()
  const sawSpread = keysOfObjectEntries(source.slice(i + 1, end), supplied)
  if (sawSpread) return 'opaque'
  return { supplied }
}

/** Les manques trouvés dans une source : `"ns:clé → {{var}}"`. Exportée pour
 *  la preuve que la garde sait dire NON. */
export function missingInterpolations(rawSource: string): string[] {
  const source = stripComments(rawSource)
  const binds = bindsOf(source)
  const offenders: string[] = []
  for (const [alias, pairs] of binds) {
    const callPattern = new RegExp(`\\b${alias}\\(\\s*'([^']+)'`, 'g')
    for (const match of source.matchAll(callPattern)) {
      const key = match[1]
      const parsed = parseCallOptions(source, match.index + match[0].length)
      if (parsed === 'opaque') continue

      const candidates: Array<[string, string]> = []
      if (key.includes(':')) candidates.push([key.slice(0, key.indexOf(':')), key.slice(key.indexOf(':') + 1)])
      for (const bind of pairs) {
        const full = bind.keyPrefix ? `${bind.keyPrefix}.${key}` : key
        for (const ns of bind.namespaces) candidates.push([ns, full])
      }
      const resolved = candidates.find(([ns, path]) => resolves(CATALOG_FR, ns, path) || resolves(CATALOG_EN, ns, path))
      if (!resolved) continue // clé introuvable : le rôle de keys-resolve.test.ts, pas le nôtre.

      const [ns, path] = resolved
      const missing = [...declaredPlaceholders(ns, path)].filter(
        v => !parsed.supplied.has(v) && !GLOBALLY_SUPPLIED.has(v),
      )
      if (missing.length > 0) offenders.push(`${ns}:${path} → {{${missing.join('}}, {{')}}}`)
    }
  }
  return offenders
}

describe('chaque {{variable}} déclarée reçoit une valeur à l’appel (fr + en)', () => {
  const files = sourceFiles(SRC)

  it('lit un corpus non vide', () => {
    expect(files.length).toBeGreaterThan(400)
  })

  it('sait dire NON — clé réelle, variable manquante', () => {
    const source = `
      const { t } = useTranslation('accountDetail')
      const x = t('dossierRead.unknownOutOfScore', { count: 2, axes: 'a, b' })
    `
    expect(missingInterpolations(source)).toEqual(['accountDetail:dossierRead.unknownOutOfScore → {{axesCount}}'])
  })

  it('ne rougit pas à tort quand l’appel fournit tout', () => {
    const source = `
      const { t } = useTranslation('accountDetail')
      const x = t('dossierRead.unknownOutOfScore', { axesCount: 2, axes: 'a, b' })
    `
    expect(missingInterpolations(source)).toEqual([])
  })

  it('ne rougit pas à tort sur une clé sans aucune variable', () => {
    const source = `
      const { t } = useTranslation('accountDetail')
      const x = t('dossierRead.worthTitle')
    `
    expect(missingInterpolations(source)).toEqual([])
  })

  it('ignore ce qu’elle ne peut pas décider (options dynamiques, spread) sans mentir', () => {
    const dynamic = `
      const { t } = useTranslation('accountDetail')
      const opts = { axes: 'a' }
      const x = t('dossierRead.unknownOutOfScore', opts)
    `
    const spread = `
      const { t } = useTranslation('accountDetail')
      const rest = { axesCount: 2 }
      const x = t('dossierRead.unknownOutOfScore', { ...rest, axes: 'a' })
    `
    expect(missingInterpolations(dynamic)).toEqual([])
    expect(missingInterpolations(spread)).toEqual([])
  })

  it('aucune {{variable}} déclarée ne manque à l’appel, sur tout le corpus', () => {
    const offenders: string[] = []
    for (const file of files) {
      for (const offense of missingInterpolations(readFileSync(file, 'utf8'))) {
        offenders.push(`${relative(SRC, file)} → ${offense}`)
      }
    }
    expect(offenders).toEqual([])
  })
})
