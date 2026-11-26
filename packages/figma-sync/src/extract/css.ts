/**
 * Un lecteur CSS volontairement petit : il ne connaît que ce que
 * `tokens.css` écrit (règles plates, `@media` contenant des règles, `@keyframes`).
 * Il ne cherche pas à être un parseur CSS complet — il doit savoir dire « je
 * n'ai pas compris » (en rendant la déclaration avec sa ligne), jamais deviner.
 */

export interface CssDeclaration {
  prop: string
  value: string
  /** Ligne 1-based dans le fichier source. */
  line: number
}

interface CssRule {
  selector: string
  /** Les at-rules englobantes, ex. `['@media (max-width: 767px)']`. */
  atRules: string[]
  declarations: CssDeclaration[]
}

/** Remplace les commentaires par des espaces en GARDANT les sauts de ligne (les numéros de ligne restent justes). */
export function stripComments(src: string, lineComments = false): string {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, m => m.replace(/[^\n]/g, ' '))
  if (lineComments) out = out.replace(/(^|[^:'"])\/\/[^\n]*/g, (m, p: string) => p + ' '.repeat(m.length - p.length))
  return out
}

function lineAt(src: string, offset: number): number {
  let line = 1
  for (let i = 0; i < offset && i < src.length; i++) if (src[i] === '\n') line++
  return line
}

/** Trouve l'accolade fermante qui correspond à celle ouverte en `open`. */
function matchBrace(src: string, open: number): number {
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return src.length
}

/** Découpe sur `sep` au niveau 0 des parenthèses (les virgules d'un `rgba()` ne coupent pas). */
export function splitTopLevel(value: string, sep: string): string[] {
  const parts: string[] = []
  let depth = 0
  let start = 0
  for (let i = 0; i < value.length; i++) {
    const c = value[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === sep && depth === 0) {
      parts.push(value.slice(start, i))
      start = i + 1
    }
  }
  parts.push(value.slice(start))
  return parts.map(p => p.trim()).filter(p => p.length > 0)
}

function parseDeclarations(src: string, from: number, to: number): CssDeclaration[] {
  const body = src.slice(from, to)
  const decls: CssDeclaration[] = []
  let start = 0
  let depth = 0
  const flush = (end: number): void => {
    const raw = body.slice(start, end)
    const colon = raw.indexOf(':')
    if (colon > 0) {
      const lead = raw.length - raw.trimStart().length
      const prop = raw.slice(0, colon).trim()
      const value = raw
        .slice(colon + 1)
        .replace(/\s+/g, ' ')
        .trim()
      if (prop && value) decls.push({ prop, value, line: lineAt(src, from + start + lead) })
    }
  }
  for (let i = 0; i < body.length; i++) {
    const c = body[i]
    if (c === '(') depth++
    else if (c === ')') depth--
    else if (c === ';' && depth === 0) {
      flush(i)
      start = i + 1
    }
  }
  flush(body.length)
  return decls
}

function parseBlock(src: string, from: number, to: number, atRules: string[], rules: CssRule[]): void {
  let i = from
  while (i < to) {
    const open = src.indexOf('{', i)
    if (open === -1 || open >= to) return
    const rawPrelude = src.slice(i, open)
    // `@import …;` / `@tailwind base;` avant la règle : seule la dernière instruction est le sélecteur.
    const prelude = rawPrelude
      .slice(rawPrelude.lastIndexOf(';') + 1)
      .replace(/\s+/g, ' ')
      .trim()
    const close = matchBrace(src, open)
    if (prelude.startsWith('@keyframes')) {
      // Des étapes d'animation, pas des tokens.
    } else if (prelude.startsWith('@')) {
      parseBlock(src, open + 1, close, [...atRules, prelude], rules)
    } else {
      rules.push({ selector: prelude, atRules, declarations: parseDeclarations(src, open + 1, close) })
    }
    i = close + 1
  }
}

export function parseCss(source: string): CssRule[] {
  const src = stripComments(source)
  const rules: CssRule[] = []
  parseBlock(src, 0, src.length, [], rules)
  return rules
}
