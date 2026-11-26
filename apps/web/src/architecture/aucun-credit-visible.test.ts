import { readdirSync, readFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * #4463 — AUCUN CRÉDIT VISIBLE CÔTÉ CLIENT.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * LA DÉCISION (Louis, 22/10/2026)
 * ─────────────────────────────────────────────────────────────────────────
 * « je veux plus voir de crédit sur le produit […] je veux plus qu'il y a un
 * compteur, je veux plus qu'on dit prépare l'analyse ça va vous coûter 10
 * crédits ». Le débit continue en coulisse (API inchangée) ; seul l'AFFICHAGE
 * disparaît : ni compteur, ni coût sur un bouton, ni modale de coût, ni alerte
 * de seuil. Un solde épuisé se dit par le frein doux (#4464) — une phrase
 * tutoyée et un contact, jamais un chiffre, jamais « crédit », jamais
 * « recharger ».
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE LIT, ET CE QU'ELLE NE LIT PAS
 * ─────────────────────────────────────────────────────────────────────────
 *  · LIT   : les valeurs des traductions (`i18n/locales/{fr,en}/*.json`) et les
 *            LITTÉRAUX VISIBLES des `.ts` / `.tsx` (chaîne, gabarit, texte JSX).
 *  · IGNORE: les commentaires, les imports, les noms de champs (`credits_remaining`)
 *            et les tests — un identifiant n'est pas une phrase.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QUE CE LOT A RETIRÉ (gardes renversées, pas « supprimées pour passer »)
 * ─────────────────────────────────────────────────────────────────────────
 * Quatre gardes exigeaient l'inverse de la décision — « chaque action facturée
 * ANNONCE son coût » : GA-49 (enrichissement de contact), GA-86 (analyse de
 * compte), GA-332 (actions facturées) et la garde « account_refresh annonce son
 * prix avant l'approbation d'un job de Laura ». Elles gardaient une règle qui
 * n'existe plus ; celle-ci tient la règle neuve, et sa preuve est plus forte
 * (le mot lui-même est refusé, pas seulement le composant d'annonce).
 *
 * Une garde protège une règle, elle ne l'invente pas : les exceptions sont
 * NOMMÉES, chacune avec sa raison et son lot de sortie. Aucune n'est un moyen de
 * faire passer la CI.
 */

/** « crédit », « credit », « crédits » — mais ni « accréditation » ni « discrédit ». */
const CREDIT_WORD = /(?<![\p{L}])cr[ée]dits?(?![\p{L}])/iu

type Exception = { reason: string }

/** Les namespaces de traduction exemptés, un par un. */
const EXEMPT_NAMESPACES: Readonly<Record<string, Exception>> = {
  billing: {
    reason: 'Page Facturation /billing : lot frère CR2 (#4463/#4468). Sortira de cette liste à sa fusion.',
  },
  myData: {
    reason:
      'Mentions légales / RGPD : l’inventaire des données conservées nomme le journal des mouvements (obligation comptable).',
  },
}

/** Les clés exemptées dans un namespace, une par une. */
const EXEMPT_KEYS: Readonly<Record<string, Exception>> = {
  'onboarding:questions.offerDomains.options.BANKING_CREDIT_PAYMENTS': {
    reason: 'Domaine métier du client (banque, crédit) : le mot décrit son marché, pas notre monnaie.',
  },
  'missions:collections.rules.overpayment': {
    reason: 'Vocabulaire de facturation : un trop-perçu est un « crédit client » (avoir), pas notre monnaie.',
  },
  'missions:collections.rules.creditNote': {
    reason: 'Vocabulaire de facturation : « credit note » = avoir, pas notre monnaie.',
  },
  'missions:invoices.banner': {
    reason: 'Vocabulaire de facturation : « credit note » = avoir, pas notre monnaie.',
  },
  'missions:invoices.frozen.body': {
    reason: 'Vocabulaire de facturation : « credit note » = avoir, pas notre monnaie.',
  },
}

/** Les dossiers/fichiers `.ts(x)` exemptés (chemins relatifs à `src`, séparateur `/`). */
const EXEMPT_SOURCE_PREFIXES: Readonly<Record<string, Exception>> = {
  'features/billing/': { reason: 'Page Facturation /billing : lot frère CR2.' },
  'routes/billing': { reason: 'Page Facturation /billing : lot frère CR2.' },
}

export function mentionsCredit(text: string): boolean {
  return CREDIT_WORD.test(text)
}

/** Un littéral montré à un lecteur : plusieurs mots, ou « crédit » accentué / capitalisé (un champ API s’écrit `credits`). */
function isVisible(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed === '') return false
  return /\s/.test(trimmed) || /[éÉ]|^Credit/.test(trimmed)
}

export function creditLiteralsIn(source: string, fileName: string): string[] {
  const kind = fileName.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS
  const file = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, kind)
  const out: string[] = []
  const visit = (node: ts.Node): void => {
    const parent = node.parent
    const isModuleSpecifier =
      parent !== undefined &&
      (ts.isImportDeclaration(parent) || ts.isExportDeclaration(parent) || ts.isExternalModuleReference(parent))
    const isText =
      (ts.isStringLiteral(node) && !isModuleSpecifier) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    if (isText && isVisible(node.text) && mentionsCredit(node.text)) out.push(node.text.trim())
    ts.forEachChild(node, visit)
  }
  visit(file)
  return out
}

type JsonTree = { [key: string]: string | JsonTree }

export function creditKeysIn(tree: JsonTree, prefix = ''): string[] {
  return Object.entries(tree).flatMap(([key, value]) =>
    typeof value === 'string'
      ? mentionsCredit(value)
        ? [`${prefix}${key}`]
        : []
      : creditKeysIn(value, `${prefix}${key}.`),
  )
}

const WEB_SRC = join(__dirname, '..')
const LOCALES = join(WEB_SRC, 'i18n', 'locales')

function walkSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return ['node_modules', 'architecture'].includes(entry.name) ? [] : walkSources(full)
    return /\.tsx?$/.test(entry.name) && !/\.(test|spec|stories|d)\.tsx?$/.test(entry.name) ? [full] : []
  })
}

const sources = walkSources(WEB_SRC).map(file => ({
  rel: relative(WEB_SRC, file).split(sep).join('/'),
  text: readFileSync(file, 'utf8'),
}))

const localeFiles = ['fr', 'en'].flatMap(lang =>
  readdirSync(join(LOCALES, lang))
    .filter(name => name.endsWith('.json'))
    .map(name => ({
      lang,
      namespace: name.replace(/\.json$/, ''),
      tree: JSON.parse(readFileSync(join(LOCALES, lang, name), 'utf8')) as JsonTree,
    })),
)

describe('le détecteur sait dire NON', () => {
  it('refuse « crédit » dans une traduction, au singulier comme au pluriel', () => {
    expect(creditKeysIn({ a: { cost: '{{count}} crédits' }, b: 'Coût : 1 crédit' })).toEqual(['a.cost', 'b'])
    expect(creditKeysIn({ a: 'You will spend 3 credits' })).toEqual(['a'])
  })

  it('refuse « crédit » dans une chaîne, un gabarit ou un texte JSX', () => {
    const source = [
      'export const A = () => <p>Il te reste des crédits</p>',
      "export const b = 'Coût : 3 crédits'",
      'export const c = `${n} crédits`',
    ].join('\n')
    expect(creditLiteralsIn(source, 'x.tsx')).toHaveLength(3)
  })

  it('ne refuse ni un commentaire, ni un champ d’API, ni un mot voisin', () => {
    const source = [
      '// 3 crédits débités',
      '/* Crédits restants */',
      'export const f = data.credits_remaining',
      "export const k = 'credits'",
      "export const a = 'Accréditation requise'",
    ].join('\n')
    expect(creditLiteralsIn(source, 'x.ts')).toEqual([])
    expect(mentionsCredit('Accréditation fournisseur')).toBe(false)
    expect(mentionsCredit('Nous avons un discrédit')).toBe(false)
  })
})

describe('le corpus — la garde prouve qu’elle lit quelque chose', () => {
  it('lit des fichiers de code et des traductions dans les deux langues', () => {
    expect(sources.length).toBeGreaterThan(500)
    expect(localeFiles.filter(f => f.lang === 'fr').length).toBeGreaterThan(50)
    expect(localeFiles.filter(f => f.lang === 'en').length).toBeGreaterThan(50)
  })

  it('retrouve le mot là où il est exempté (sinon elle ne lirait pas la page Facturation)', () => {
    const billing = localeFiles.filter(f => f.namespace === 'billing')
    expect(billing.flatMap(f => creditKeysIn(f.tree)).length).toBeGreaterThan(0)
  })
})

describe('#4463 — aucun crédit dans une phrase montrée', () => {
  it('traductions : aucune valeur ne dit « crédit » hors exceptions nommées', () => {
    const offenders = localeFiles
      .filter(f => !(f.namespace in EXEMPT_NAMESPACES))
      .flatMap(f =>
        creditKeysIn(f.tree)
          .filter(key => !(`${f.namespace}:${key}` in EXEMPT_KEYS))
          .map(key => `${f.lang}/${f.namespace}:${key}`),
      )
    expect(offenders).toEqual([])
  })

  it('code : aucun littéral visible ne dit « crédit » hors exceptions nommées', () => {
    const offenders = sources
      .filter(file => !Object.keys(EXEMPT_SOURCE_PREFIXES).some(prefix => file.rel.startsWith(prefix)))
      .flatMap(file => creditLiteralsIn(file.text, file.rel).map(text => `${file.rel}: ${text.slice(0, 80)}`))
    expect(offenders).toEqual([])
  })

  it('chaque exception nomme sa raison', () => {
    const all = [
      ...Object.values(EXEMPT_NAMESPACES),
      ...Object.values(EXEMPT_KEYS),
      ...Object.values(EXEMPT_SOURCE_PREFIXES),
    ]
    for (const exception of all) expect(exception.reason.length).toBeGreaterThan(20)
  })
})
