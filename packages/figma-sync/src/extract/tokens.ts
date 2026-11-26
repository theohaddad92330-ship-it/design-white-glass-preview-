import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { type CssDeclaration, parseCss, splitTopLevel, stripComments } from './css'
import type {
  ColorValue,
  DimensionToken,
  ModeColor,
  MotionTokens,
  PrimitiveColor,
  Rgba,
  ShadowLayer,
  ShadowToken,
  SkippedToken,
  SourceFile,
  TextStyleToken,
  TokenSet,
  TokenSources,
} from './types'

/**
 * tokens.css → `TokenSet`.
 *
 * Règle de l'extracteur : ce qu'il ne sait pas lire va dans `skipped` avec sa
 * source `fichier:ligne` et une raison — il ne remplace JAMAIS une valeur par
 * une autre qu'il aurait devinée (doctrine « jamais de donnée fictive »,
 * appliquée aux tokens : une couleur inventée dans Figma finirait recopiée
 * dans du code).
 */

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..')

const SOURCE_PATHS = {
  tokensCss: 'apps/web/src/styles/tokens.css',
  indexCss: 'apps/web/src/index.css',
  tailwindConfig: 'apps/web/tailwind.config.ts',
  motionTs: 'packages/ui/src/motion.ts',
  // Le thème par défaut de la version de Tailwind que l'app installe (3.4) : c'est LUI qui dit ce
  // que `rounded-xl` ou `shadow-md` valent — et qu'un `shadow-xs` (syntaxe Tailwind 4) ne rend rien.
  tailwindDefaults: 'apps/web/node_modules/tailwindcss/stubs/config.full.js',
} as const

export function readSources(root: string = REPO_ROOT): TokenSources {
  const read = (path: string): SourceFile => ({ path, content: readFileSync(resolve(root, path), 'utf8') })
  return {
    tokensCss: read(SOURCE_PATHS.tokensCss),
    indexCss: read(SOURCE_PATHS.indexCss),
    tailwindConfig: read(SOURCE_PATHS.tailwindConfig),
    motionTs: read(SOURCE_PATHS.motionTs),
    tailwindDefaults: read(SOURCE_PATHS.tailwindDefaults),
  }
}

const PRIMARY_STEPS = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900] as const
const SEMANTIC_PRIMITIVES = ['success', 'warning', 'danger', 'info'] as const

/**
 * L'échelle d'espacement Tailwind réellement utilisée par l'app (n × 4 px).
 * Elle ne vit dans aucun fichier du dépôt : c'est l'échelle par défaut de
 * Tailwind, que `tailwind.config.ts` ne redéfinit pas.
 */
const SPACING_STEPS = [1, 2, 3, 4, 5, 6, 8, 10, 12, 16] as const

// ─── Couleurs ──────────────────────────────────────────────────────────────

type Parsed<T> = { ok: true; value: T } | { ok: false; reason: string }

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n))

function parseHex(hex: string): Rgba | null {
  const h = hex.length <= 4 ? [...hex].map(c => c + c).join('') : hex
  if (!/^[0-9a-f]{6}([0-9a-f]{2})?$/i.test(h)) return null
  const n = (i: number): number => parseInt(h.slice(i, i + 2), 16) / 255
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) : 1 }
}

function parseRgbFunction(inner: string): Rgba | null {
  // `rgba(1, 2, 3, 0.4)` ou `rgb(1 2 3 / 0.4)`
  const parts = inner.includes(',')
    ? inner.split(',').map(s => s.trim())
    : inner
        .replace('/', ' ')
        .split(/\s+/)
        .filter(s => s.length > 0)
  if (parts.length < 3 || parts.length > 4) return null
  const nums = parts.map(p => (p.endsWith('%') ? Number(p.slice(0, -1)) / 100 : Number(p)))
  if (nums.some(n => Number.isNaN(n))) return null
  const [r = 0, g = 0, b = 0, a = 1] = nums
  return { r: clamp01(r / 255), g: clamp01(g / 255), b: clamp01(b / 255), a: clamp01(a) }
}

function parseColor(value: string): Parsed<ColorValue> {
  const v = value.trim()
  const alias = /^var\((--[\w-]+)\)$/.exec(v)
  if (alias?.[1]) return { ok: true, value: { kind: 'alias', ref: alias[1] } }
  if (v.startsWith('color-mix(')) {
    return { ok: false, reason: 'color-mix() : mélange calculé par le navigateur, sans équivalent en variable Figma' }
  }
  if (v.startsWith('#')) {
    const rgba = parseHex(v.slice(1))
    return rgba
      ? { ok: true, value: { kind: 'color', rgba } }
      : { ok: false, reason: `couleur hexadécimale illisible : ${v}` }
  }
  const fn = /^rgba?\((.*)\)$/i.exec(v)
  if (fn?.[1] !== undefined) {
    const rgba = parseRgbFunction(fn[1])
    return rgba ? { ok: true, value: { kind: 'color', rgba } } : { ok: false, reason: `rgb() illisible : ${v}` }
  }
  return { ok: false, reason: `valeur illisible comme couleur : ${v}` }
}

/**
 * Nom Figma d'une couleur, dérivé du nom CSS — déterministe, pour que deux
 * synchronisations nomment la même variable de la même façon.
 *   --bellum-primary-500   → primary/500
 *   --bellum-success       → semantic/success
 *   --accent-soft-bg       → soft/accent/bg
 *   --bellum-text-primary  → text/primary
 *   --bellum-bg            → bg/default
 *   --bg-base (couche historique non préfixée) → legacy/bg-base
 */
/**
 * `color-mix(in srgb, var(--X) N%, transparent)` — l'ordre inversé et la forme
 * à deux pourcentages (tant qu'ils totalisent 100, cas trivial) sont acceptés.
 * Résolu par mode : même RVB que `--X`, alpha × N/100. Tout le reste (deux
 * couleurs opaques, un espace hors srgb, des pourcentages qui ne totalisent
 * pas 100) n'a pas d'équivalent calculable sans le navigateur — laissé écarté.
 */
interface ColorMixVarTransparent {
  ref: string
  /** Pourcentage de `--X` dans le mélange (0..100) = l'alpha final × 100. */
  pct: number
}

type MixComponent = { kind: 'var'; ref: string; pct?: number } | { kind: 'transparent'; pct?: number }

function parseMixComponent(part: string): MixComponent | null {
  const p = part.trim()
  const v = /^var\((--[\w-]+)\)(?:\s+(\d*\.?\d+)%)?$/.exec(p)
  if (v?.[1]) return { kind: 'var', ref: v[1], pct: v[2] !== undefined ? Number(v[2]) : undefined }
  const t = /^transparent(?:\s+(\d*\.?\d+)%)?$/.exec(p)
  if (t) return { kind: 'transparent', pct: t[1] !== undefined ? Number(t[1]) : undefined }
  return null
}

function parseColorMixVarTransparent(value: string): ColorMixVarTransparent | null {
  const m = /^color-mix\(in srgb,\s*(.+?),\s*(.+?)\)$/.exec(value.trim())
  if (!m?.[1] || !m[2]) return null
  const a = parseMixComponent(m[1])
  const b = parseMixComponent(m[2])
  if (!a || !b || a.kind === b.kind) return null
  const varPart = a.kind === 'var' ? a : (b as { kind: 'var'; ref: string; pct?: number })
  const transPart = a.kind === 'transparent' ? a : (b as { kind: 'transparent'; pct?: number })
  if (varPart.pct !== undefined && transPart.pct !== undefined) {
    if (Math.abs(varPart.pct + transPart.pct - 100) > 0.001) return null
    return { ref: varPart.ref, pct: varPart.pct }
  }
  if (varPart.pct !== undefined) return { ref: varPart.ref, pct: varPart.pct }
  if (transPart.pct !== undefined) return { ref: varPart.ref, pct: 100 - transPart.pct }
  return null
}

/** Résout `--X` en RGBA pour UN mode, parmi ce qui est déjà connu à ce point de l'assemblage. */
function resolveKnownRef(
  ref: string,
  mode: 'light' | 'dark',
  primitives: PrimitiveColor[],
  colors: ModeColor[],
): Rgba | null {
  const p = primitives.find(x => x.cssVar === ref)
  if (p) return p.value
  const c = colors.find(x => x.cssVar === ref)
  if (!c) return null
  const v = c[mode]
  return v.kind === 'color' ? v.rgba : null
}

/**
 * `color-mix(in srgb, var(--X) N%, transparent)`, PAR MODE : la déclaration
 * claire et la sombre peuvent porter des formules différentes (percentage,
 * voire une autre variable) ; chacune résout `--X` dans SON mode.
 */
function resolveColorMixColor(
  cssVar: string,
  lightText: string,
  darkText: string,
  primitives: PrimitiveColor[],
  colors: ModeColor[],
): ModeColor | null {
  const lightMix = parseColorMixVarTransparent(lightText)
  const darkMix = parseColorMixVarTransparent(darkText)
  if (!lightMix || !darkMix) return null
  const lightRgba = resolveKnownRef(lightMix.ref, 'light', primitives, colors)
  const darkRgba = resolveKnownRef(darkMix.ref, 'dark', primitives, colors)
  if (!lightRgba || !darkRgba) return null
  const mixed = (base: Rgba, pct: number): Rgba => ({ r: base.r, g: base.g, b: base.b, a: base.a * (pct / 100) })
  return {
    name: colorName(cssVar),
    cssVar,
    light: { kind: 'color', rgba: mixed(lightRgba, lightMix.pct) },
    dark: { kind: 'color', rgba: mixed(darkRgba, darkMix.pct) },
  }
}

function colorName(cssVar: string): string {
  const primary = /^--bellum-primary-(\d+)$/.exec(cssVar)
  if (primary) return `primary/${primary[1]}`
  const semantic = /^--bellum-(success|warning|danger|info)$/.exec(cssVar)
  if (semantic) return `semantic/${semantic[1]}`
  const soft = /^--(\w+)-soft-(\w+)$/.exec(cssVar)
  if (soft) return `soft/${soft[1]}/${soft[2]}`
  const bellum = /^--bellum-([a-z0-9]+)(?:-(.+))?$/.exec(cssVar)
  if (bellum) return `${bellum[1]}/${bellum[2] ?? 'default'}`
  return `legacy/${cssVar.replace(/^--/, '')}`
}

// ─── Lecture des blocs de mode ─────────────────────────────────────────────

interface ModeDecls {
  /** `:root` ou `:root:not(.dark)` — ce que voit le thème clair. */
  light?: CssDeclaration
  /** `.dark` — la surcharge sombre. */
  dark?: CssDeclaration
  /** `:root` seul — hérité par le sombre quand `.dark` ne redéfinit pas. */
  root?: CssDeclaration
  /** Première apparition, pour garder l'ordre du fichier. */
  order: number
}

function collectModes(file: SourceFile, skipped: SkippedToken[]): Map<string, ModeDecls> {
  const vars = new Map<string, ModeDecls>()
  const viewportDependent = new Map<string, number>()
  let order = 0
  for (const rule of parseCss(file.content)) {
    const inMedia = rule.atRules.some(a => a.startsWith('@media'))
    for (const d of rule.declarations) {
      if (!d.prop.startsWith('--')) continue
      if (inMedia) {
        viewportDependent.set(d.prop, d.line)
        continue
      }
      const entry = vars.get(d.prop) ?? { order: order++ }
      if (rule.selector === ':root') {
        entry.light = d
        entry.root = d
      } else if (rule.selector === ':root:not(.dark)') entry.light = d
      else if (rule.selector === '.dark') entry.dark = d
      else continue
      vars.set(d.prop, entry)
    }
  }
  for (const [prop, line] of viewportDependent) {
    vars.delete(prop)
    skipped.push({
      cssVar: prop,
      source: `${file.path}:${line}`,
      reason: 'valeur qui dépend du viewport (@media) — pas un token de mode',
      intended: true,
    })
  }
  return vars
}

const src = (file: SourceFile, d: CssDeclaration): string => `${file.path}:${d.line}`

// ─── Dimensions ────────────────────────────────────────────────────────────

function parsePx(value: string): number | null {
  const m = /^(-?\d*\.?\d+)(px|rem)?$/.exec(value.trim())
  if (!m?.[1]) return null
  const n = Number(m[1])
  if (m[2] === 'rem') return n * 16
  if (m[2] === 'px' || n === 0) return n
  return null
}

// ─── Ombres ────────────────────────────────────────────────────────────────

function parseShadow(value: string, resolve: (ref: string) => Rgba | null): Parsed<ShadowLayer[]> {
  const layers: ShadowLayer[] = []
  for (const layer of splitTopLevel(value, ',')) {
    const parts = splitTopLevel(layer, ' ')
    const colorPart = parts.pop()
    const nums = parts.map(parsePx)
    if (!colorPart || nums.length < 2 || nums.length > 4 || nums.some(n => n === null)) {
      return { ok: false, reason: `couche d'ombre illisible : ${layer}` }
    }
    const [x = 0, y = 0, blur = 0, spread = 0] = nums as number[]
    const color = parseColor(colorPart)
    if (!color.ok) return { ok: false, reason: color.reason }
    if (color.value.kind === 'color') {
      layers.push({ x, y, blur, spread, color: color.value.rgba })
    } else {
      const resolved = resolve(color.value.ref)
      if (!resolved) return { ok: false, reason: `ombre : couleur ${color.value.ref} introuvable` }
      layers.push({ x, y, blur, spread, color: resolved, ref: color.value.ref })
    }
  }
  return { ok: true, value: layers }
}

// ─── Styles de texte ───────────────────────────────────────────────────────

/** Les alias de police SYSTÈME (CSS) ne sont pas des familles Figma : on les nomme par la police qu'ils
 *  désignent sur le poste de référence (macOS). Une pile sans alias garde sa première famille. */
const SYSTEM_FONT_ALIASES: Readonly<Record<string, string>> = {
  '-apple-system': 'SF Pro',
  BlinkMacSystemFont: 'SF Pro',
  'system-ui': 'SF Pro',
  'ui-sans-serif': 'SF Pro',
  'ui-monospace': 'SF Mono',
  'SFMono-Regular': 'SF Mono',
}

function figmaFamily(stack: string): string | undefined {
  const first = stack
    .split(',')[0]
    ?.trim()
    .replace(/^['"]|['"]$/g, '')
  if (!first) return undefined
  return SYSTEM_FONT_ALIASES[first] ?? first
}

function extractTextStyles(file: SourceFile, skipped: SkippedToken[]): TextStyleToken[] {
  const styles: TextStyleToken[] = []
  for (const rule of parseCss(file.content)) {
    const cls = /^\.text-([\w-]+)$/.exec(rule.selector)
    if (!cls?.[1]) continue
    const get = (prop: string): CssDeclaration | undefined => rule.declarations.find(d => d.prop === prop)
    const font = get('font')
    const m = font ? /^(\d{3}) (\d*\.?\d+)px\/(\d*\.?\d+) (?:'([^']+)'|var\((--[\w-]+)\))/.exec(font.value) : null
    // Coque Théo (23/10) — la famille passe par une variable (`var(--bellum-font-sans)`, pile système) :
    // on lit sa déclaration dans le même fichier, et la pile système se nomme comme Figma la connaît.
    const viaVar = m?.[5] ? new RegExp(`${m[5]}\\s*:\\s*([^;]+);`).exec(file.content)?.[1] : undefined
    const family = m?.[4] ?? (viaVar ? figmaFamily(viaVar) : undefined)
    const color = /^var\((--[\w-]+)\)$/.exec(get('color')?.value ?? '')
    if (!m?.[1] || !m[2] || !m[3] || !family || !color?.[1]) {
      const line = font?.line ?? rule.declarations[0]?.line ?? 0
      skipped.push({
        cssVar: rule.selector,
        source: `${file.path}:${line}`,
        reason: 'style de texte sans `font: <poids> <taille>px/<interligne> <famille>` ni `color: var(…)` lisibles',
      })
      continue
    }
    const ls = /^(-?\d*\.?\d+)em$/.exec(get('letter-spacing')?.value ?? '0em')
    styles.push({
      name: cls[1],
      className: rule.selector,
      fontFamily: family,
      fontWeight: Number(m[1]),
      fontSize: Number(m[2]),
      lineHeight: Number(m[3]),
      letterSpacingEm: ls?.[1] ? Number(ls[1]) : 0,
      color: color[1],
    })
  }
  return styles
}

/**
 * Théo DS §1.2 — un rayon ou une ombre PAR RÔLE (`--bellum-radius-card`) se range
 * sous `role/…`, à côté de l'échelle historique (`--radius-sm` → `sm`) : les deux
 * coexistent, et un même nom (`card`) ne peut pas désigner deux valeurs.
 */
function roleName(cssVar: string, legacyPrefix: string, rolePrefix: string): string {
  return cssVar.startsWith(rolePrefix) ? `role/${cssVar.slice(rolePrefix.length)}` : cssVar.replace(legacyPrefix, '')
}

// ─── Fichiers TS (tailwind, motion) ────────────────────────────────────────

/**
 * Les classes Tailwind de rayon et d'ombre que les composants de `packages/ui` citent sans
 * variable CSS — relevé par `rg -o "rounded-(sm|md|xl)|shadow-(xs|sm|md|lg)" packages/ui/src`.
 * Leur valeur ne se devine pas : elle se lit dans `tailwind.config.ts` (qui étend `sm`/`md`/`lg`
 * en `calc(var(--radius) - n)`), sinon dans le thème par défaut de la version INSTALLÉE.
 */
const TAILWIND_RADIUS = ['sm', 'md', 'xl'] as const
const TAILWIND_SHADOWS = ['xs', 'sm', 'md', 'lg'] as const

interface ThemeEntry {
  value: string
  line: number
}

/** Les entrées `clé: 'valeur'` du bloc `<key>: { … }` d'un fichier de thème, avec leur ligne. */
function themeEntries(file: SourceFile, key: string): Map<string, ThemeEntry> {
  const out = new Map<string, ThemeEntry>()
  const code = stripComments(file.content, true)
  const block = new RegExp(`\\b${key}:\\s*\\{([^}]*)\\}`).exec(code)
  if (!block?.[1]) return out
  const start = block.index + block[0].indexOf('{') + 1
  for (const m of block[1].matchAll(/['"]?([\w-]+)['"]?:\s*'([^']*)'/g)) {
    if (!m[1] || m[2] === undefined) continue
    out.set(m[1], { value: m[2], line: code.slice(0, start + (m.index ?? 0)).split('\n').length })
  }
  return out
}

/** Le config de l'app d'abord (il étend), sinon le thème par défaut installé. */
function themeLookup(sources: TokenSources, key: string, name: string): { found?: ThemeEntry; file: SourceFile } {
  const fromConfig = themeEntries(sources.tailwindConfig, key).get(name)
  if (fromConfig) return { found: fromConfig, file: sources.tailwindConfig }
  return { found: themeEntries(sources.tailwindDefaults, key).get(name), file: sources.tailwindDefaults }
}

function extractTailwindRadius(
  sources: TokenSources,
  shadcnPx: number | null,
  skipped: SkippedToken[],
): DimensionToken[] {
  const out: DimensionToken[] = []
  for (const key of TAILWIND_RADIUS) {
    const className = `rounded-${key}`
    const { found, file } = themeLookup(sources, 'borderRadius', key)
    if (!found) {
      skipped.push({ cssVar: className, source: file.path, reason: `\`${key}\` absent du borderRadius Tailwind` })
      continue
    }
    const calc = /^calc\(var\(--radius\)\s*-\s*(\d+)px\)$/.exec(found.value)
    let px: number | null
    if (found.value === 'var(--radius)') px = shadcnPx
    else if (calc?.[1]) px = shadcnPx === null ? null : shadcnPx - Number(calc[1])
    else px = parsePx(found.value)
    if (px === null) {
      skipped.push({
        cssVar: className,
        source: `${file.path}:${found.line}`,
        reason: `rayon illisible : ${found.value}`,
      })
      continue
    }
    out.push({ name: className, className, value: px })
  }
  return out
}

function extractTailwindShadows(sources: TokenSources, skipped: SkippedToken[]): ShadowToken[] {
  const out: ShadowToken[] = []
  for (const key of TAILWIND_SHADOWS) {
    const className = `shadow-${key}`
    const { found, file } = themeLookup(sources, 'boxShadow', key)
    if (!found) {
      skipped.push({
        cssVar: className,
        source: file.path,
        reason: `\`${key}\` absent du boxShadow de la version installée : la classe ne génère aucune CSS — le code n’affiche aucune ombre`,
      })
      continue
    }
    const layers = parseShadow(found.value, () => null)
    if (!layers.ok) {
      skipped.push({ cssVar: className, source: `${file.path}:${found.line}`, reason: layers.reason })
      continue
    }
    // Une ombre Tailwind ne change pas avec le thème : la même valeur en clair et en sombre.
    out.push({ name: key, className, light: layers.value, dark: layers.value })
  }
  return out
}

function extractZIndex(file: SourceFile, skipped: SkippedToken[]): DimensionToken[] {
  const code = stripComments(file.content, true)
  const block = /zIndex:\s*\{([^}]*)\}/.exec(code)
  const out: DimensionToken[] = []
  for (const m of block?.[1]?.matchAll(/(\w+):\s*'(\d+)'/g) ?? []) {
    if (m[1] && m[2]) out.push({ name: m[1], value: Number(m[2]) })
  }
  if (out.length === 0)
    skipped.push({ cssVar: 'zIndex', source: file.path, reason: 'bloc `zIndex: { … }` absent ou vide' })
  return out
}

function extractMotion(file: SourceFile, skipped: SkippedToken[]): MotionTokens {
  const code = stripComments(file.content, true)
  const ease: MotionTokens['ease'] = []
  const easeBlock = /export const EASE = \{([\s\S]*?)\} as const/.exec(code)
  for (const m of easeBlock?.[1]?.matchAll(/(\w+):\s*\[([^\]]+)\]/g) ?? []) {
    const nums = (m[2] ?? '').split(',').map(s => Number(s.trim()))
    if (m[1] && nums.length === 4 && nums.every(n => !Number.isNaN(n))) {
      ease.push({ name: m[1], bezier: nums as [number, number, number, number] })
    }
  }
  if (ease.length === 0)
    skipped.push({ cssVar: 'EASE', source: file.path, reason: '`export const EASE` absent ou illisible' })
  const durations: MotionTokens['durations'] = []
  const durBlock = /export const DURATION = \{([\s\S]*?)\} as const/.exec(code)
  for (const m of durBlock?.[1]?.matchAll(/(\w+):\s*(\d*\.?\d+)/g) ?? []) {
    if (m[1] && m[2]) durations.push({ name: m[1], ms: Math.round(Number(m[2]) * 1000) })
  }
  if (durations.length === 0) {
    skipped.push({ cssVar: 'DURATION', source: file.path, reason: '`export const DURATION` absent ou illisible' })
  }
  return { ease, durations }
}

// ─── Assemblage ────────────────────────────────────────────────────────────

export function extractTokens(sources: TokenSources): TokenSet {
  const skipped: SkippedToken[] = []
  const file = sources.tokensCss
  const vars = [...collectModes(file, skipped).entries()].sort((a, b) => a[1].order - b[1].order)

  const primitives: PrimitiveColor[] = []
  let colors: ModeColor[] = []
  const radius: DimensionToken[] = []
  const shadowDecls: [string, ModeDecls][] = []

  for (const [cssVar, decls] of vars) {
    const light = decls.light
    const dark = decls.dark ?? decls.root
    // Théo DS §3.2 — les jetons CSS de mouvement RECOPIENT motion.ts (gardé par
    // `theo-ds-tokens.test.ts`) : la valeur se lit là-bas, pas ici.
    if (cssVar.startsWith('--bellum-motion-') || cssVar === '--bellum-ease-out') {
      const line = (light ?? dark) as CssDeclaration
      skipped.push({
        cssVar,
        source: src(file, line),
        reason: 'jeton de mouvement dérivé de packages/ui/src/motion.ts — lu dans motion.ts',
        intended: true,
      })
      continue
    }
    if (cssVar.startsWith('--shadow-') || cssVar.startsWith('--bellum-shadow-')) {
      shadowDecls.push([cssVar, decls])
      continue
    }
    if (!light) {
      skipped.push({
        cssVar,
        source: src(file, dark ?? (decls.dark as CssDeclaration)),
        reason: 'absent en clair (:root)',
      })
      continue
    }
    if (cssVar.startsWith('--radius-') || cssVar.startsWith('--bellum-radius-')) {
      const px = parsePx(light.value)
      if (px === null) skipped.push({ cssVar, source: src(file, light), reason: `rayon illisible : ${light.value}` })
      else radius.push({ name: roleName(cssVar, '--radius-', '--bellum-radius-'), cssVar, value: px })
      continue
    }
    const isPrimitive =
      /^--bellum-primary-\d+$/.test(cssVar) || SEMANTIC_PRIMITIVES.some(s => cssVar === `--bellum-${s}`)
    if (!isPrimitive && dark && light.value.startsWith('color-mix(')) {
      const mixed = resolveColorMixColor(cssVar, light.value, dark.value, primitives, colors)
      if (mixed) {
        colors.push(mixed)
        continue
      }
    }
    const lightColor = parseColor(light.value)
    if (!lightColor.ok) {
      skipped.push({ cssVar, source: src(file, light), reason: lightColor.reason })
      continue
    }
    if (isPrimitive) {
      if (lightColor.value.kind !== 'color') {
        skipped.push({ cssVar, source: src(file, light), reason: 'une primitive doit être une valeur, pas un alias' })
      } else primitives.push({ name: colorName(cssVar), cssVar, value: lightColor.value.rgba })
      continue
    }
    if (!dark) {
      skipped.push({ cssVar, source: src(file, light), reason: 'absent en sombre (.dark) — aucune valeur devinée' })
      continue
    }
    const darkColor = parseColor(dark.value)
    if (!darkColor.ok) {
      skipped.push({ cssVar, source: src(file, dark), reason: darkColor.reason })
      continue
    }
    colors.push({ name: colorName(cssVar), cssVar, light: lightColor.value, dark: darkColor.value })
  }

  // Les paliers de rampe absents sont NOMMÉS, pas comblés.
  const known = new Set([...primitives.map(p => p.cssVar), ...skipped.map(s => s.cssVar)])
  for (const step of PRIMARY_STEPS) {
    const cssVar = `--bellum-primary-${step}`
    if (!known.has(cssVar))
      skipped.push({ cssVar, source: file.path, reason: 'palier de la rampe primaire absent de tokens.css' })
  }

  // Un alias vers un token inconnu (ou lui-même écarté) est écarté à son tour — jusqu'à point fixe.
  const primitiveVars = new Set(primitives.map(p => p.cssVar))
  for (;;) {
    const colorVars = new Set(colors.map(c => c.cssVar))
    const valid = (v: ColorValue): boolean => v.kind === 'color' || primitiveVars.has(v.ref) || colorVars.has(v.ref)
    const broken = colors.filter(c => !valid(c.light) || !valid(c.dark))
    if (broken.length === 0) break
    for (const c of broken) {
      const d = vars.find(([v]) => v === c.cssVar)?.[1]
      const line = d?.light ?? d?.dark
      skipped.push({
        cssVar: c.cssVar,
        source: line ? src(file, line) : file.path,
        reason: 'alias vers un token inconnu',
      })
    }
    colors = colors.filter(c => !broken.includes(c))
  }

  // Résolution d'une couleur pour un mode (ombres).
  const resolveIn =
    (mode: 'light' | 'dark') =>
    (ref: string, depth = 0): Rgba | null => {
      if (depth > 8) return null
      const p = primitives.find(x => x.cssVar === ref)
      if (p) return p.value
      const c = colors.find(x => x.cssVar === ref)
      if (!c) return null
      const v = c[mode]
      return v.kind === 'color' ? v.rgba : resolveIn(mode)(v.ref, depth + 1)
    }

  const shadows: ShadowToken[] = []
  for (const [cssVar, decls] of shadowDecls) {
    const lightDecl = decls.light
    const darkDecl = decls.dark ?? decls.root
    if (!lightDecl || !darkDecl) {
      const any = (lightDecl ?? darkDecl) as CssDeclaration
      skipped.push({ cssVar, source: src(file, any), reason: `ombre sans valeur ${lightDecl ? 'sombre' : 'claire'}` })
      continue
    }
    const l = parseShadow(lightDecl.value, r => resolveIn('light')(r))
    const d = parseShadow(darkDecl.value, r => resolveIn('dark')(r))
    if (!l.ok || !d.ok) {
      skipped.push({
        cssVar,
        source: src(file, l.ok ? darkDecl : lightDecl),
        reason: l.ok ? (d.ok ? '' : d.reason) : l.reason,
      })
      continue
    }
    shadows.push({ name: roleName(cssVar, '--shadow-', '--bellum-shadow-'), cssVar, light: l.value, dark: d.value })
  }

  // Le `--radius` shadcn de index.css.
  const shadcn = parseCss(sources.indexCss.content)
    .filter(r => r.selector === ':root' && !r.atRules.some(a => a.startsWith('@media')))
    .flatMap(r => r.declarations)
    .find(d => d.prop === '--radius')
  if (!shadcn) {
    skipped.push({ cssVar: '--radius', source: sources.indexCss.path, reason: 'rayon shadcn absent de :root' })
  } else {
    const px = parsePx(shadcn.value)
    if (px === null) {
      skipped.push({
        cssVar: '--radius',
        source: src(sources.indexCss, shadcn),
        reason: `rayon illisible : ${shadcn.value}`,
      })
    } else radius.push({ name: 'shadcn', cssVar: '--radius', value: px })
  }
  const shadcnPx = radius.find(r => r.name === 'shadcn')?.value ?? null
  radius.push(...extractTailwindRadius(sources, shadcnPx, skipped))
  shadows.push(...extractTailwindShadows(sources, skipped))

  return {
    sources: Object.values(sources).map((s: SourceFile) => s.path),
    primitives,
    colors,
    radius,
    spacing: SPACING_STEPS.map(n => ({ name: String(n), value: n * 4 })),
    zIndex: extractZIndex(sources.tailwindConfig, skipped),
    shadows,
    textStyles: extractTextStyles(file, skipped),
    motion: extractMotion(sources.motionTs, skipped),
    skipped,
  }
}
