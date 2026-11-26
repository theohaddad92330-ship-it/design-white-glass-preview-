/**
 * Empreinte de lecture d'une spec : les chemins du dépôt qu'elle LIT (readFileSync, readdirSync,
 * glob…) sans les importer — donc invisibles au graphe d'imports de vitest / jest.
 *
 * Une garde qui lit `apps/api/src/migrations` n'a aucune raison de tourner sur une PR qui ne touche
 * que `apps/web/src/features/chat`. Mais on ne la dispense QUE si tous ses chemins se calculent :
 * dès qu'un chemin échappe à l'analyse (variable d'environnement, appel de fonction, template
 * inconnu, helper qui lit lui-même le disque), `resolved: false` et la garde tourne toujours.
 * Le repli est d'en faire PLUS, jamais moins. Détail : docs/tests-rapides.md.
 */
import { posix } from 'node:path'

const FS_CALL =
  /\b(readFileSync|readdirSync|readFile|readdir|statSync|lstatSync|existsSync|accessSync|globSync|glob|opendirSync|realpathSync|createReadStream)\s*\(/g
const PATH_CALL = /(?<![\w$.])(?:(?:path|posix)\.)?(join|resolve)\s*\(/g
const IDENT = /^[A-Za-z_$][\w$]*$/
const MEMBER = /^[A-Za-z_$][\w$]*(\.[A-Za-z_$][\w$]*)+$/

/** Une valeur qui vient d'un paramètre ou d'une boucle : on ne sait pas d'où, mais elle ne crée pas de racine. */
const DERIVED = Symbol('derived')

const lit = s => ({ k: 'lit', s })
const abs = s => ({ k: 'path', s })

/** Texte entre la parenthèse ouvrante en `start` et sa fermante ; `null` si elle manque. */
function balanced(text, start) {
  let depth = 0
  let quote = null
  for (let i = start; i < text.length; i += 1) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') {
      depth -= 1
      if (depth === 0) return text.slice(start + 1, i)
    }
  }
  return null
}

/** Découpe aux virgules de niveau 0 (hors chaînes et parenthèses). */
function splitArgs(text) {
  const out = []
  let depth = 0
  let quote = null
  let from = 0
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i]
    if (quote) {
      if (c === '\\') i += 1
      else if (c === quote) quote = null
      continue
    }
    if (c === "'" || c === '"' || c === '`') quote = c
    else if (c === '(' || c === '[' || c === '{') depth += 1
    else if (c === ')' || c === ']' || c === '}') depth -= 1
    else if (c === ',' && depth === 0) {
      out.push(text.slice(from, i).trim())
      from = i + 1
    }
  }
  const last = text.slice(from).trim()
  if (last) out.push(last)
  return out
}

/** Retire les lignes de commentaire (les chemins cités dans un commentaire ne sont pas lus). */
function stripCommentLines(source) {
  return source
    .split('\n')
    .filter(line => !/^\s*(\/\/|\/\*|\*)/.test(line))
    .join('\n')
}

/** Les `const NOM = <expression>` du fichier : nom → liste des expressions (plusieurs = ambigu). */
function collectConstants(source) {
  const defs = new Map()
  defs.inits = []
  const re = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=\n]+)?=\s*/g
  for (let m = re.exec(source); m; m = re.exec(source)) {
    let depth = 0
    let quote = null
    let end = source.length
    for (let i = re.lastIndex; i < source.length; i += 1) {
      const c = source[i]
      if (quote) {
        if (c === '\\') i += 1
        else if (c === quote) quote = null
        continue
      }
      if (c === "'" || c === '"' || c === '`') quote = c
      else if (c === '(' || c === '[' || c === '{') depth += 1
      else if (c === ')' || c === ']' || c === '}') depth -= 1
      else if ((c === '\n' || c === ';') && depth <= 0) {
        end = i
        break
      }
    }
    defs.set(m[1], [...(defs.get(m[1]) ?? []), source.slice(re.lastIndex, end).trim()])
    defs.inits.push({ name: m[1], start: re.lastIndex, end })
  }
  return defs
}

/** `apps/web` pour `apps/web/src/x.test.ts` : le répertoire de travail de vitest / jest. */
function appDir(file) {
  const m = /^(apps\/[^/]+|packages\/[^/]+)\//.exec(file)
  return m ? m[1] : ''
}

/**
 * Évalue une expression de chemin. Rend `{ k: 'path', s }` (ancré, depuis la racine du dépôt),
 * `{ k: 'lit', s }` (littéral nu : relatif au répertoire de travail), `DERIVED` (paramètre / variable
 * de boucle : acceptable, sans racine propre) ou `null` (inconnu : la garde tournera toujours).
 */
function evaluate(rawExpr, ctx, depth = 0) {
  if (depth > 8) return null
  let expr = rawExpr.trim().replace(/\s+as\s+const$/, '')
  while (expr.startsWith('(') && balanced(expr, 0) === expr.slice(1, -1)) expr = expr.slice(1, -1).trim()
  const literal = /^(['"])((?:\\.|(?!\1).)*)\1$/s.exec(expr)
  if (literal) return lit(literal[2])
  if (expr.startsWith('`') && expr.endsWith('`') && !expr.slice(1, -1).includes('`')) {
    let value = ''
    let anchored = false
    const body = expr.slice(1, -1)
    for (let i = 0; i < body.length; i += 1) {
      if (body[i] === '$' && body[i + 1] === '{') {
        const inner = balanced(body, i + 1)
        if (inner === null) return null
        const part = evaluate(inner, ctx, depth + 1)
        if (part === DERIVED) {
          if (value === '') return DERIVED
          const dir = value.replace(/[^/]*$/, '').replace(/\/$/, '')
          return anchored ? abs(dir || '.') : lit(dir || '.')
        }
        if (part === null) return null
        if (part.k === 'path') anchored = true
        value += part.s
        i += inner.length + 2
      } else value += body[i]
    }
    return anchored ? abs(value) : lit(value)
  }
  if (expr === '__dirname' || expr === 'import.meta.dirname') return abs(posix.dirname(ctx.file))
  if (expr === 'import.meta.url') return abs(ctx.file)
  if (expr === 'process.cwd()') return abs(appDir(ctx.file))
  const call = /^([A-Za-z_$][\w$.]*)\s*\(/.exec(expr)
  if (call && expr.endsWith(')') && balanced(expr, call[0].length - 1) === expr.slice(call[0].length, -1)) {
    const name = call[1].split('.').pop()
    const args = splitArgs(expr.slice(call[0].length, -1))
    if (name === 'fileURLToPath' && args.length === 1) return evaluate(args[0], ctx, depth + 1)
    if (name === 'dirname' && args.length === 1) {
      const inner = evaluate(args[0], ctx, depth + 1)
      return inner === null || inner === DERIVED ? inner : { k: inner.k, s: posix.dirname(inner.s) }
    }
    if (name === 'join' || name === 'resolve') {
      let acc = ''
      let kind = null
      for (const [index, arg] of args.entries()) {
        const value = evaluate(arg, ctx, depth + 1)
        // Sous-chemin dynamique sous une racine connue : la racine (dossier) est l'empreinte.
        if (value === DERIVED) return kind === null ? DERIVED : { k: kind, s: posix.normalize(acc === '' ? '.' : acc) }
        if (value === null || value.s.startsWith('/')) return null
        if (index === 0) kind = value.k
        else if (value.k === 'path') return null
        acc = posix.join(acc, value.s)
      }
      return kind === null ? null : { k: kind, s: posix.normalize(acc === '' ? '.' : acc) }
    }
    return null
  }
  const url = /^new\s+URL\s*\(/.exec(expr)
  if (url && expr.endsWith(')')) {
    const args = splitArgs(expr.slice(url[0].length, -1))
    if (args.length === 2 && args[1] === 'import.meta.url') {
      const rel = evaluate(args[0], ctx, depth + 1)
      return rel === null || rel === DERIVED ? null : abs(posix.join(posix.dirname(ctx.file), rel.s))
    }
    return null
  }
  if (IDENT.test(expr)) {
    const defs = ctx.constants.get(expr)
    if (defs === undefined) return DERIVED
    if (defs.length > 1) return null
    return evaluate(defs[0], ctx, depth + 1)
  }
  if (MEMBER.test(expr)) return ctx.constants.has(expr.split('.')[0]) ? null : DERIVED
  return null
}

/** Les chemins d'une valeur évaluée, depuis la racine : un littéral nu vaut aussi bien `apps/x/<lit>` que `<lit>` (en faire PLUS). */
function variants(value, file) {
  const raw = value.k === 'path' ? [value.s] : [posix.join(appDir(file), value.s), posix.normalize(value.s)]
  return raw.filter(p => !p.startsWith('..') && !p.startsWith('/')).map(p => (p === '.' ? '' : p))
}

/** Préfixe statique d'un motif glob : `apps/web/src/**` → `apps/web/src`. */
function globRoot(value) {
  const cut = value.search(/[*?[{]/)
  if (cut === -1) return value
  return value
    .slice(0, cut)
    .replace(/[^/]*$/, '')
    .replace(/\/$/, '')
}

/**
 * `{ resolved, paths }` : `resolved` vaut vrai si TOUS les chemins lus se calculent. `paths` : fichiers
 * ou dossiers (depuis la racine du dépôt) ; `''` = le dépôt entier.
 */
export function readFootprint(file, rawSource, readSource) {
  const source = stripCommentLines(rawSource)
  const ctx = { file, constants: collectConstants(source) }
  const paths = new Set()
  const unresolved = { resolved: false, paths: [] }

  // Un helper importé qui lit lui-même le disque : sa racine nous échappe.
  const fsPattern = /readFileSync|readdirSync|globSync|fs\/promises|node:fs/
  for (const m of source.matchAll(/from\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
    const target = posix.join(posix.dirname(file), m[1])
    for (const candidate of [target, `${target}.ts`, `${target}.tsx`, `${target}.mjs`, `${target}/index.ts`]) {
      let text = ''
      try {
        text = readSource(candidate)
      } catch {
        continue
      }
      if (fsPattern.test(text)) return unresolved
      break
    }
  }

  // Chaque construction de chemin (join / resolve) doit se calculer, ou n'avoir qu'une partie dérivée.
  const sites = []
  for (const m of source.matchAll(PATH_CALL)) {
    const inner = balanced(source, m.index + m[0].length - 1)
    if (inner === null) return unresolved
    const value = evaluate(`${m[1]}(${inner})`, ctx)
    if (value === null) return unresolved
    sites.push({ start: m.index, end: m.index + m[0].length + inner.length, value })
  }
  // Seuls les sites MAXIMAUX comptent (un `resolve(__dirname, '..')` imbriqué dans un `join` n'est qu'un
  // appui), et une constante qui ne sert que de base à d'autres `join` est une ancre, pas une lecture.
  for (const site of sites) {
    if (site.value === DERIVED) continue
    const nested = sites.some(o => o !== site && o.start <= site.start && o.end >= site.end)
    if (nested) continue
    const init = ctx.constants.inits.find(i => i.start <= site.start && i.end >= site.end)
    if (init) {
      const uses = [
        ...source.matchAll(new RegExp(`(?<![\\w$.])${init.name.replace(/\$/g, '\\$')}(?![\\w$])`, 'g')),
      ].filter(u => u.index < init.start - 1 || u.index > init.end)
      const anchorOnly = uses.every(u =>
        /(?:\bjoin|\bresolve)\s*\(\s*$|\$\{\s*$/.test(source.slice(Math.max(0, u.index - 20), u.index)),
      )
      if (anchorOnly) continue
    }
    for (const p of variants(site.value, file)) paths.add(p)
  }

  let fsCalls = 0
  for (const m of source.matchAll(FS_CALL)) {
    const inner = balanced(source, m.index + m[0].length - 1)
    if (inner === null) return unresolved
    const arg = splitArgs(inner)[0]
    if (arg === undefined) return unresolved
    // `glob`/`globSync` avec `cwd` : la racine est dans l'option.
    if (m[1].startsWith('glob') && /\bcwd\b/.test(inner)) return unresolved
    const value = evaluate(arg, ctx)
    if (value === null) return unresolved
    fsCalls += 1
    if (value === DERIVED) continue
    const root = m[1].startsWith('glob') ? { k: value.k, s: globRoot(value.s) } : value
    const found = variants(root, file)
    if (found.length === 0) return unresolved
    for (const p of found) paths.add(p)
  }

  if (fsCalls === 0 || paths.size === 0) return unresolved
  return { resolved: true, paths: [...paths].sort() }
}

/** Le diff touche-t-il l'un des chemins lus (égalité, ou le chemin est un dossier parent) ? */
export function footprintTouched(paths, changed) {
  return paths.some(p => changed.some(f => p === '' || f === p || f.startsWith(`${p}/`)))
}
