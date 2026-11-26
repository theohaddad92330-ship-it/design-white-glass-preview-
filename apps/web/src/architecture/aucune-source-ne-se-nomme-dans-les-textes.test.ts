import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import ts from 'typescript'
import { supplierNamesIn } from '@bellum/contracts'
import { describe, expect, it } from 'vitest'

/**
 * #4074.3 — aucun NOM DE SOURCE, et plus de « Mémoire marché », dans une valeur i18n.
 *
 * #4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10/2026 (#4068).
 * La règle du 18/09 laissait les sources PUBLIQUES se nommer (BOAMP, France Travail…).
 * Celle du 12/10 : aucune source ne se nomme, publique ou payante ; un fait se dit par
 * sa NATURE et sa date (« besoin observé sur le marché », « annonce légale »). Seule
 * exception : l'outil que l'espace a lui-même branché (« Votre CRM »), et l'écran
 * Réglages › Intégrations, où « Connecter » doit dire ce qu'il connecte.
 *
 * La garde lit les VALEURS des catalogues FR et EN (jamais les clés : `marketMemory`,
 * `pappers` restent des identifiants de code). Les fichiers d'intégration sont exemptés.
 */

export const SOURCE_NAME_PATTERN =
  /\b(BODACC|BOAMP|DECP|France\s+Travail|APEC|Welcome to the Jungle|WTTJ|INSEE|INPI|Pappers|P[ôo]le\s+emploi|Sirene|Infogreffe|Zefix|Societe\.com)\b/i
export const MARKET_MEMORY_PATTERN = /m[ée]moire\s+(?:de\s+|du\s+)?march[ée]|market\s+memory/i

/** Réglages › Intégrations : le seul endroit où un outil ou une source se nomme. */
const INTEGRATION_FILES: ReadonlySet<string> = new Set(['integrations.json', 'integrationCenter.json', 'settings.json'])
/** Lots voisins encore en cours : fichiers exemptés temporairement (vide depuis #4068.4 / #4074.1 — discover.json est gardé). */
const NEIGHBOUR_LOT_FILES: ReadonlySet<string> = new Set<string>()

export function offendingValues(node: unknown, path = ''): string[] {
  if (typeof node === 'string') {
    // #4074.2 — NOS fournisseurs (`OUR_SUPPLIERS`) comptent comme les registres publics.
    const names = SOURCE_NAME_PATTERN.test(node) || MARKET_MEMORY_PATTERN.test(node) || supplierNamesIn(node).length > 0
    return names ? [`${path} = ${node.slice(0, 80)}`] : []
  }
  if (node !== null && typeof node === 'object') {
    return Object.entries(node).flatMap(([key, value]) => offendingValues(value, path === '' ? key : `${path}.${key}`))
  }
  return []
}

/**
 * #4074.2'' — la garde lit aussi les LITTÉRAUX VISIBLES des `.ts` / `.tsx` : une chaîne, un gabarit, un texte JSX.
 * Les commentaires, les imports et les identifiants en minuscules (`'bodacc'`, clé de classification venue de
 * l'API) ne sont PAS visibles ; un mot seul n'est visible que s'il est écrit comme un lecteur le lirait
 * (`'BODACC'`, `'Pappers'`). Un littéral à plusieurs mots est visible, quelle que soit sa casse.
 */
const NAME_AS_WRITTEN =
  /\b(BODACC|BOAMP|DECP|France\s+Travail|APEC|Welcome to the Jungle|WTTJ|INSEE|INPI|Pappers|P[ôo]le\s+emploi|Sirene|Infogreffe|Zefix|Societe\.com)\b/

function isVisibleLiteral(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  return /\s/.test(trimmed) || NAME_AS_WRITTEN.test(trimmed) || MARKET_MEMORY_PATTERN.test(trimmed)
}

/** Un littéral qu'on COMPARE à une donnée (`s.includes('france travail')`, `=== 'BODACC'`, `case`) n'est pas montré. */
const MATCHER_METHODS: ReadonlySet<string> = new Set([
  'includes',
  'startsWith',
  'endsWith',
  'indexOf',
  'has',
  'test',
  'match',
  'split',
])
function isMatcherOperand(node: ts.Node): boolean {
  const parent = node.parent
  if (parent === undefined) return false
  if (ts.isCaseClause(parent)) return true
  if (ts.isBinaryExpression(parent)) {
    return [
      ts.SyntaxKind.EqualsEqualsToken,
      ts.SyntaxKind.EqualsEqualsEqualsToken,
      ts.SyntaxKind.ExclamationEqualsToken,
      ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ].includes(parent.operatorToken.kind)
  }
  return (
    ts.isCallExpression(parent) &&
    ts.isPropertyAccessExpression(parent.expression) &&
    MATCHER_METHODS.has(parent.expression.name.text)
  )
}

export function visibleLiteralsIn(source: string, fileName: string): string[] {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const out: string[] = []
  const visit = (node: ts.Node): void => {
    const isModuleSpecifier =
      node.parent !== undefined &&
      (ts.isImportDeclaration(node.parent) ||
        ts.isExportDeclaration(node.parent) ||
        ts.isExternalModuleReference(node.parent))
    if (
      (ts.isStringLiteral(node) && !isModuleSpecifier) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      if (isVisibleLiteral(node.text) && !isMatcherOperand(node)) out.push(node.text)
    }
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

export function offendingLiterals(source: string, fileName: string): string[] {
  return visibleLiteralsIn(source, fileName).flatMap(text => offendingValues(text))
}

/**
 * `observability-alerts.service.ts` est EXEMPTÉ À DESSEIN (décision Louis 17/10/2026) : c'est de l'ops INTERNE
 * (alertes vers l'équipe Bellum), jamais un écran client — nommer le fournisseur en panne y est le but.
 */
const OPS_INTERNAL_EXEMPT: ReadonlySet<string> = new Set([
  'apps/api/src/modules/analytics/observability-alerts.service.ts',
])

/** Les fichiers hors `apps/web/src` qui portent des textes pouvant remonter à l'écran (vérification de marché). */
const EXTRA_SCANNED_FILES: readonly string[] = [
  'packages/contracts/src/schemas/market-verification.ts',
  'apps/api/src/modules/consultants/verification/market-verification.service.ts',
]

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const WEB_SRC = join(__dirname, '..')

function walkSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : walkSources(full)
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec|stories|d)\.tsx?$/.test(entry.name) ? [full] : []
  })
}

function sourceFindings(): string[] {
  const files = [...walkSources(WEB_SRC), ...EXTRA_SCANNED_FILES.map(file => join(REPO_ROOT, file))]
  return files.flatMap(file => {
    const rel = file.startsWith(REPO_ROOT) ? file.slice(REPO_ROOT.length + 1) : file
    if (OPS_INTERNAL_EXEMPT.has(rel) || /(^|\/)(integrations?|settings)\//i.test(rel)) return []
    return offendingLiterals(readFileSync(file, 'utf8'), file).map(hit => `${rel} › ${hit}`)
  })
}

const LOCALES_DIR = join(__dirname, '..', 'i18n', 'locales')

function catalogueFindings(): string[] {
  const out: string[] = []
  for (const locale of ['fr', 'en']) {
    for (const file of readdirSync(join(LOCALES_DIR, locale)).filter(name => name.endsWith('.json'))) {
      if (INTEGRATION_FILES.has(file) || NEIGHBOUR_LOT_FILES.has(file)) continue
      const parsed: unknown = JSON.parse(readFileSync(join(LOCALES_DIR, locale, file), 'utf8'))
      for (const hit of offendingValues(parsed)) out.push(`${locale}/${file} › ${hit}`)
    }
  }
  return out
}

describe('#4074.3 — aucune source ne se nomme dans un texte visible', () => {
  it('sait dire NON : un nom de source ou « Mémoire marché » est attrapé, FR comme EN', () => {
    expect(offendingValues({ a: { b: "Voir l'annonce BODACC" } })).toHaveLength(1)
    expect(offendingValues({ a: 'Observé sur France Travail' })).toHaveLength(1)
    expect(offendingValues({ a: 'Issu de la mémoire marché' })).toHaveLength(1)
    expect(offendingValues({ a: 'From {{brand}} market memory' })).toHaveLength(1)
  })

  it('sait dire NON à un fournisseur payant (#4074.2), pas à un mot ordinaire', () => {
    expect(offendingValues({ a: 'Enrichi par Apollo' })).toHaveLength(1)
    expect(offendingValues({ a: 'via firecrawl' })).toHaveLength(1)
    expect(offendingValues({ a: 'Bravoure et apollons' })).toEqual([])
  })

  it('ne rougit pas sur ce qu’elle ne vise pas', () => {
    expect(offendingValues({ a: 'Voir l’annonce', b: 'besoin observé sur le marché', c: 'Votre CRM' })).toEqual([])
    expect(offendingValues({ a: 'La mémoire collective', b: 'décapec' })).toEqual([])
  })

  // #4074.2'' — les littéraux des .ts / .tsx.
  it('sait dire NON dans un littéral de code : chaîne, gabarit, texte JSX — coupable planté', () => {
    expect(offendingLiterals("const label = 'Observé sur le BODACC'", 'x.ts')).toHaveLength(1)
    expect(offendingLiterals('const label = `Source : ${x} Pappers`', 'x.ts')).toHaveLength(1)
    expect(
      offendingLiterals('export const A = () => <p>Données issues de la Mémoire marché</p>', 'x.tsx'),
    ).toHaveLength(1)
    expect(offendingLiterals("const label = 'BOAMP'", 'x.ts')).toHaveLength(1)
    expect(offendingLiterals("const label = 'Enrichi par Apollo'", 'x.ts')).toHaveLength(1)
  })

  it('ne rougit pas sur ce qui n’est pas visible : commentaire, import, identifiant en minuscules', () => {
    expect(offendingLiterals('// voir le BODACC\n/* BOAMP */\nconst a = 1', 'x.ts')).toEqual([])
    expect(offendingLiterals("import { x } from './pappers-client'", 'x.ts')).toEqual([])
    expect(offendingLiterals("const SOURCE = 'bodacc'; const id = 'france-travail'", 'x.ts')).toEqual([])
    expect(offendingLiterals("const label = 'Voir l’annonce'", 'x.ts')).toEqual([])
    // Une donnée COMPARÉE à un nom n'est pas un texte montré…
    expect(offendingLiterals("if (s.includes('france travail') || s === 'BODACC') return 1", 'x.ts')).toEqual([])
    // …mais le même nom AFFECTÉ à un libellé l'est.
    expect(offendingLiterals("const label = s.trim() + ' France Travail'", 'x.ts')).toHaveLength(1)
  })

  it('lit réellement les sources : un corpus non vide, et l’exemption ops est celle d’un fichier qui nomme bien un fournisseur', () => {
    expect(walkSources(WEB_SRC).length).toBeGreaterThan(500)
    for (const file of EXTRA_SCANNED_FILES)
      expect(readFileSync(join(REPO_ROOT, file), 'utf8').length).toBeGreaterThan(0)
    for (const file of OPS_INTERNAL_EXEMPT) {
      expect(offendingLiterals(readFileSync(join(REPO_ROOT, file), 'utf8'), file).length).toBeGreaterThan(0)
    }
  })

  it('aucun littéral visible des .ts / .tsx ne nomme une source', () => {
    expect(sourceFindings()).toEqual([])
  })

  it('lit réellement les catalogues FR et EN', () => {
    expect(readdirSync(join(LOCALES_DIR, 'fr')).length).toBeGreaterThan(50)
    expect(readdirSync(join(LOCALES_DIR, 'en')).length).toBeGreaterThan(50)
  })

  it('aucune valeur i18n hors Intégrations ne nomme une source', () => {
    expect(catalogueFindings()).toEqual([])
  })
})
