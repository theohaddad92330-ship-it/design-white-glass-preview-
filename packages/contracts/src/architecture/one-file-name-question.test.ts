import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * GA-130 — « ceci ressemble-t-il à un nom de fichier ? » n'existe qu'UNE fois.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE, ET PAS L'AUTRE
 * ─────────────────────────────────────────────────────────────────────────────
 * Le 30/08, deux lots ont écrit la même dérivation le même jour, chacun de son
 * côté : `isFileDerivedName` côté écran (GA-120) et `looksLikeAFileName` côté
 * écriture (GA-128). Aucune des deux gardes existantes ne pouvait le voir :
 * chacune vérifie que SA face passe par SA fonction, ce qui reste vrai avec deux
 * fonctions. « Une dérivation vit à un seul endroit — deux chemins qui la
 * refont divergent » (GA-26) n'était gardé par personne.
 *
 * ⚠️ La garde utile ici n'est donc PAS « la définition canonique existe » — ça,
 * n'importe quel import le prouve. C'est **« il n'en réapparaît pas une
 * seconde »**. Elle regarde tout le dépôt, pas le fichier qu'elle protège.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * DEUX DÉTECTEURS, PARCE QU'UN SEUL SE CONTOURNE SANS LE VOULOIR
 * ─────────────────────────────────────────────────────────────────────────────
 *  1. **par le NOM** — un export dont l'identifiant POSE la question
 *     (`isFileDerivedName`, `looksLikeAFileName`, `isFilename`…). C'est la forme
 *     qu'a prise le doublon réel ;
 *  2. **par la FORME** — un fichier qui rassemble les deux marques de la
 *     dérivation : une liste d'extensions de document ET un test de tiret bas.
 *     C'est ce qui reste quand quelqu'un la réécrit sous un nom innocent.
 *
 * Les fichiers de test sont hors corpus de détection : un test n'est pas une
 * définition, et ce que la garde cherche est le code que la production appelle.
 * Ils restent comptés dans le corpus LU, pour que le chiffre ne mente pas.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * PREUVE DESTRUCTIVE (rejouée le 30/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * · Code protégé : remis `isFileDerivedName` dans `talentName.ts` → ROUGE sur
 *   « aucune SECONDE définition », avec le fichier et le nom fautifs.
 * · Corpus : forcé les racines sur un dossier inexistant → ROUGE sur « la garde
 *   LIT quelque chose », avant toute autre assertion.
 */

/** `import.meta.dirname` : ce paquet est ESM, `__dirname` n'y existe pas. */
const REPO = join(import.meta.dirname, '..', '..', '..', '..')

/** La définition canonique, celle qui a le droit d'exister. */
const CANONICAL = join('packages', 'contracts', 'src', 'schemas', 'file-name.ts')

/**
 * Où la dérivation pourrait réapparaître : partout où du TypeScript vit.
 *
 * `apps/ia` est en Python et n'entre pas dans ce corpus — il n'a pas non plus
 * de raison de poser la question : c'est l'API qui écrit `full_name`, jamais le
 * service IA.
 */
const ROOTS = [
  join(REPO, 'apps', 'web', 'src'),
  join(REPO, 'apps', 'api', 'src'),
  join(REPO, 'packages', 'contracts', 'src'),
  join(REPO, 'packages', 'ui', 'src'),
  join(REPO, 'packages', 'shared', 'src'),
]

function tsFilesUnder(dir: string): string[] {
  if (!existsSync(dir)) return []
  const out: string[] = []
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) {
      out.push(...tsFilesUnder(full))
      continue
    }
    if (name.endsWith('.ts') || name.endsWith('.tsx')) out.push(full)
  }
  return out
}

/**
 * Les commentaires sont retirés AVANT toute lecture.
 *
 * Ce fichier est sa propre preuve : son en-tête CITE `isFileDerivedName` comme
 * le doublon supprimé, et la première version de bien des gardes du dépôt
 * tombait sur son propre docblock. Les chaînes, elles, sont GARDÉES — la liste
 * d'extensions que cherche le second détecteur est faite de chaînes.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
}

/** Un identifiant qui POSE la question — quel que soit le style de déclaration. */
const EXPORTED_DECLARATION = /\bexport\s+(?:async\s+)?(?:function|const|let)\s+([A-Za-z_$][\w$]*)/g
const ASKS_THE_QUESTION = /^(?:is|looks|seems|check)[A-Za-z]*?File(?:name|Name)?[A-Za-z]*$/

/** Détecteur n°1 : les exports dont le NOM pose la question. */
function questionNames(source: string): string[] {
  const found: string[] = []
  for (const match of withoutComments(source).matchAll(EXPORTED_DECLARATION)) {
    const name = match[1] as string
    if (ASKS_THE_QUESTION.test(name)) found.push(name)
  }
  return found
}

/** Les six extensions de la dérivation canonique. */
const DOCUMENT_EXTENSIONS = ['pdf', 'docx', 'doc', 'rtf', 'txt', 'md'] as const

/** Trois suffit : recopier la liste EXACTE n'est pas ce qui rend un doublon nuisible. */
const ENOUGH_EXTENSIONS = 3

/** Le test de tiret bas, sous ses trois écritures courantes. */
const UNDERSCORE_TEST = /includes\(\s*['"]_['"]\s*\)|indexOf\(\s*['"]_['"]\s*\)|\/_\//

/**
 * Détecteur n°2 : la FORME de la dérivation, quel que soit le nom qu'on lui
 * donne — une liste d'extensions de document ET un test de tiret bas.
 *
 * L'extension est cherchée DÉLIMITÉE (`'pdf'`, `|pdf|`, `(pdf`) et non au fil du
 * texte : sans ça, `note.md` d'un cas de test ou le mot « docx » d'une phrase
 * compteraient, et la garde deviendrait un détecteur de vocabulaire.
 */
function rebuildsTheDerivation(source: string): boolean {
  const code = withoutComments(source)
  const listed = DOCUMENT_EXTENSIONS.filter(extension => new RegExp(`['"\`|(]${extension}['"\`|)$]`).test(code)).length
  return listed >= ENOUGH_EXTENSIONS && UNDERSCORE_TEST.test(code)
}

function isTest(file: string): boolean {
  return file.endsWith('.test.ts') || file.endsWith('.test.tsx') || file.endsWith('.spec.ts')
}

const CORPUS = ROOTS.flatMap(tsFilesUnder)
const PRODUCTION = CORPUS.filter(file => !isTest(file))
const relative = (file: string): string => file.slice(REPO.length + 1)

describe('GA-130 — la garde LIT quelque chose', () => {
  it('le corpus existe, et il est celui du dépôt entier', () => {
    // Un chemin devenu faux rendrait « 0 doublon » et passerait au vert pour
    // toujours : le faux zéro silencieux, pas une preuve.
    for (const root of ROOTS) expect(existsSync(root), `racine introuvable : ${root}`).toBe(true)
    expect(CORPUS.length, 'corpus vide').toBeGreaterThan(2000)
    expect(PRODUCTION.length, 'plus aucun fichier de production').toBeGreaterThan(1500)
  })

  it('la définition canonique existe et les DEUX détecteurs la voient', () => {
    // C'est ce qui prouve que les détecteurs ne sont pas morts : s'ils cessaient
    // de voir la seule occurrence légitime, ils cesseraient aussi de voir les
    // illégitimes, en silence.
    const canonical = join(REPO, CANONICAL)
    expect(existsSync(canonical), `définition canonique introuvable : ${CANONICAL}`).toBe(true)
    const source = readFileSync(canonical, 'utf8')
    expect(questionNames(source)).toContain('looksLikeAFileName')
    expect(rebuildsTheDerivation(source)).toBe(true)
  })
})

describe('GA-130 — la garde sait dire NON', () => {
  it('reconnaît un doublon à son NOM, y compris celui qui a réellement existé', () => {
    expect(questionNames('export function isFileDerivedName(v: string) { return false }')).toEqual([
      'isFileDerivedName',
    ])
    expect(questionNames('export const looksLikeAFileName = (v: string) => false')).toEqual(['looksLikeAFileName'])
    expect(questionNames('export function isFilename(v: string) { return false }')).toEqual(['isFilename'])
  })

  it('reconnaît un doublon à sa FORME, même rebaptisé innocemment', () => {
    expect(
      rebuildsTheDerivation(`
        const EXT = ['pdf', 'docx', 'doc']
        export function tidyLabel(v: string) {
          if (v.includes('_')) return null
          return EXT.some(e => v.endsWith(e)) ? null : v
        }
      `),
    ).toBe(true)
  })

  it('ne crie pas sur ce qui n’est pas la dérivation', () => {
    // Une liste d'extensions SEULE est légitime (un `accept` de dépôt, un
    // validateur de type MIME) : ce n'est pas elle qui répond à la question.
    expect(rebuildsTheDerivation(`const ACCEPT = ['pdf', 'docx', 'doc', 'rtf']`)).toBe(false)
    // Un test de tiret bas SEUL l'est tout autant (un slug, une clé de cache).
    expect(rebuildsTheDerivation(`export const isSnake = (v: string) => v.includes('_')`)).toBe(false)
    // Et un commentaire qui CITE la forme fautive n'est pas du code.
    expect(questionNames('// export function isFileDerivedName(v: string) {}')).toEqual([])
    expect(questionNames('/* export const looksLikeAFileName = … */')).toEqual([])
    // `fileName` n'est pas une question — c'est une variable.
    expect(questionNames('export const fileName = row.filename')).toEqual([])
  })
})

describe('GA-130 — aucune SECONDE définition', () => {
  it('un seul fichier du dépôt répond à « ceci ressemble-t-il à un nom de fichier ? »', () => {
    const offenders = PRODUCTION.flatMap(file => {
      if (relative(file) === CANONICAL) return []
      const source = readFileSync(file, 'utf8')
      const names = questionNames(source)
      const hits: string[] = names.map(name => `${relative(file)} → export ${name}`)
      if (rebuildsTheDerivation(source)) hits.push(`${relative(file)} → refait la dérivation (extensions + tiret bas)`)
      return hits
    })
    // Si ce test tombe : la question a été réécrite ailleurs. La réponse est
    // d'importer `looksLikeAFileName` depuis `@bellum/contracts`, pas d'ajouter
    // une exception — deux définitions divergent, c'est la seule chose dont on
    // soit certain.
    expect(offenders, `secondes définitions :\n${offenders.join('\n')}`).toEqual([])
  })
})
