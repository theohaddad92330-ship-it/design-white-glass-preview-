import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-247 — un paramètre de constructeur `@Injectable()` porte un JETON.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LE DÉFAUT MESURÉ, ET POURQUOI AUCUNE GARDE NE LE VOYAIT
 * ─────────────────────────────────────────────────────────────────────────────
 * `PlausibleChatbotClient` déclarait :
 *
 *     constructor(options: { requestTimeoutMs?: number } = {}) { … }
 *
 * Nest voit UN paramètre sur une classe `@Injectable()` et cherche à
 * l'injecter. Un type objet anonyme ne porte aucun jeton : `design:paramtypes`
 * vaut `[Object]`, `dependencies[0]` vaut `null`, et l'application refuse de
 * démarrer —
 *
 *     Nest can't resolve dependencies of the PlausibleChatbotClient (?).
 *     6/6 replicas never became healthy!
 *
 * Mesuré le 01/09/2026 sur le déploiement de prévisualisation de la PR #1292.
 * La valeur par défaut (`= {}`) n'y change rien, et c'est ce qui rend le défaut
 * si convaincant à la relecture : le code a l'air d'avoir un paramètre
 * OPTIONNEL, alors que Nest le tient pour obligatoire.
 *
 * ⚠️ **Les 9 500 tests de l'API étaient VERTS.** Ils construisent la classe
 * directement (`new PlausibleChatbotClient()`), ce qui marche parfaitement —
 * c'est le CONTENEUR qui échoue, et il ne tourne dans aucun test unitaire.
 *
 * ⚠️ Et les deux gardes voisines ne couvraient pas ce cas :
 *  · **GA-42** vérifie qu'un service injecté par un CONTRÔLEUR est atteignable
 *    depuis son module — ici l'injecteur est un SERVICE, pas un contrôleur ;
 *  · **GA-20** vérifie qu'un repository injecté est déclaré — ici le paramètre
 *    n'est pas un repository.
 *
 * Le trou entre les deux : un fournisseur dont un paramètre n'a PAS de jeton du
 * tout. C'est ce que cette garde ferme.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE REFUSE, ET CE QU'ELLE LAISSE PASSER
 * ─────────────────────────────────────────────────────────────────────────────
 * Refusé : un paramètre dont le type est un objet anonyme (`{ … }`), un
 * primitif (`string`, `number`, `boolean`), un tableau, ou une union — aucun ne
 * porte de jeton d'injection.
 *
 * Laissé passer : le même paramètre s'il porte `@Inject(…)`, qui NOMME son
 * jeton. C'est la forme correcte quand on veut vraiment injecter une valeur, et
 * elle est employée ailleurs dans le dépôt (les quatre ports de la photo
 * mensuelle dans `pilotage.module.ts`).
 */

const MODULES = join(__dirname, '..', 'modules')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full))
      continue
    }
    if (/\.ts$/.test(entry) && !/\.(spec|test)\.ts$/.test(entry)) out.push(full)
  }
  return out
}

/**
 * Le source SANS ses commentaires, blancs de MÊME longueur.
 *
 * Ce docblock-ci cite `constructor(options: { … })` pour expliquer la règle :
 * sans ce nettoyage, la garde s'accuserait elle-même. C'est le mode de panne
 * n°1 des gardes de ce dépôt.
 */
function codeOnly(source: string): string {
  const blank = (match: string) => match.replace(/[^\n]/g, ' ')
  return source.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/\/\/[^\n]*/g, blank)
}

/** Le contenu d'un `constructor( … )`, parenthèses équilibrées. */
function constructorParams(code: string): string | null {
  const at = code.indexOf('constructor(')
  if (at < 0) return null
  let depth = 0
  for (let i = at + 'constructor'.length; i < code.length; i += 1) {
    if (code[i] === '(') depth += 1
    else if (code[i] === ')') {
      depth -= 1
      if (depth === 0) return code.slice(at + 'constructor('.length, i)
    }
  }
  return null
}

/** Découpe la liste de paramètres au PREMIER niveau — un objet inline garde ses virgules. */
function splitParams(params: string): string[] {
  const out: string[] = []
  let depth = 0
  let current = ''
  for (const char of params) {
    if ('({[<'.includes(char)) depth += 1
    else if (')}]>'.includes(char)) depth -= 1
    if (char === ',' && depth === 0) {
      out.push(current)
      current = ''
      continue
    }
    current += char
  }
  if (current.trim()) out.push(current)
  return out.map(entry => entry.trim()).filter(Boolean)
}

const SANS_JETON = /:\s*(\{|string\b|number\b|boolean\b|unknown\b|any\b|Record<|Array<|\w+\[\])/

/** Un paramètre que Nest ne saura pas résoudre. */
export function isUnresolvable(param: string): boolean {
  if (/@Inject\s*\(/.test(param)) return false
  return SANS_JETON.test(param)
}

function offenders(files: readonly string[], read: (file: string) => string): string[] {
  const out: string[] = []
  for (const file of files) {
    const code = codeOnly(read(file))
    if (!/@Injectable\s*\(/.test(code)) continue
    const params = constructorParams(code)
    if (!params) continue
    for (const param of splitParams(params)) {
      if (isUnresolvable(param)) out.push(`${file.slice(MODULES.length + 1)} → ${param.slice(0, 70)}`)
    }
  }
  return out
}

describe('GA-247 — un paramètre de constructeur `@Injectable()` porte un jeton', () => {
  const files = sourceFiles(MODULES)

  it('la garde LIT quelque chose — un corpus vide passerait tout au vert', () => {
    expect(files.length).toBeGreaterThan(200)
    const injectables = files.filter(file => /@Injectable\s*\(/.test(codeOnly(readFileSync(file, 'utf8'))))
    expect(injectables.length).toBeGreaterThan(50)
    // Et elle sait lire un constructeur : au moins un des services du dépôt en
    // a un avec des paramètres. Sans ce contrôle, un extracteur cassé rendrait
    // `null` partout et la garde serait verte pour toujours.
    const avecParams = injectables.filter(file => {
      const params = constructorParams(codeOnly(readFileSync(file, 'utf8')))
      return params !== null && splitParams(params).length > 0
    })
    expect(avecParams.length).toBeGreaterThan(30)
  })

  it('aucun fournisseur ne demande à Nest de résoudre ce qui n’a pas de jeton', () => {
    expect(offenders(files, file => readFileSync(file, 'utf8'))).toEqual([])
  })

  describe('elle sait dire NON — par LA MÊME fonction', () => {
    it('refuse un objet anonyme, avec ou sans valeur par défaut', () => {
      // La forme EXACTE qui a fait tomber la production.
      expect(isUnresolvable('options: { requestTimeoutMs?: number } = {}')).toBe(true)
      expect(isUnresolvable('options: { requestTimeoutMs?: number }')).toBe(true)
    })

    it('refuse un primitif, un Record et un tableau', () => {
      expect(isUnresolvable('name: string')).toBe(true)
      expect(isUnresolvable('retries: number = 3')).toBe(true)
      expect(isUnresolvable('flags: Record<string, boolean>')).toBe(true)
      expect(isUnresolvable('keys: string[]')).toBe(true)
    })

    it('ACCEPTE la forme correcte — un jeton NOMMÉ par `@Inject`', () => {
      expect(isUnresolvable('@Inject(TALENT_STOCK_SOURCE) private readonly talents: TalentStockSource')).toBe(false)
      expect(isUnresolvable('@Inject(CONFIG) private readonly options: { timeoutMs: number }')).toBe(false)
    })

    it('ACCEPTE une classe injectable ordinaire — sinon elle serait insupportable', () => {
      expect(isUnresolvable('private readonly supabase: SupabaseService')).toBe(false)
      expect(
        isUnresolvable('@InjectRepository(AccountEntity) private readonly accounts: Repository<AccountEntity>'),
      ).toBe(false)
    })
  })

  it('n’attrape PAS ce qu’elle ne vise pas — un commentaire qui cite la forme', () => {
    // Ce fichier-ci en est la preuve vivante : son docblock écrit
    // `constructor(options: { requestTimeoutMs?: number })` en toutes lettres.
    const documented = [
      '/** constructor(options: { requestTimeoutMs?: number } = {}) — la forme refusée. */',
      '@Injectable()',
      'export class Exemple {',
      '  constructor(private readonly autre: AutreService) {}',
      '}',
    ].join('\n')
    expect(offenders(['/faux/exemple.ts'], () => documented)).toEqual([])
  })

  it('trouve le défaut sur un fichier FABRIQUÉ — la preuve du rouge emprunte le chemin du vert', () => {
    const casse = [
      '@Injectable()',
      'export class Casse {',
      '  constructor(options: { timeoutMs?: number } = {}) {}',
      '}',
    ].join('\n')
    expect(offenders(['/faux/casse.ts'], () => casse)).toHaveLength(1)
  })
})
