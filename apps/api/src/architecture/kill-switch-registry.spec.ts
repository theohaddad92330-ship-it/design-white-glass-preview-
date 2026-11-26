import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { API_KILL_SWITCHES, IA_KILL_SWITCHES } from '../common/kill-switches'

/**
 * GA-84 — aucun interrupteur d'arrêt n'échappe à son registre.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE, ET LE DÉFAUT QUI L'A FAIT ÉCRIRE (D169 · 29/08/2026)
 * ─────────────────────────────────────────────────────────────────────────────
 * Un interrupteur d'arrêt coupe une capacité en incident. Une fois coupée,
 * **personne ne le sait** : le produit a l'air debout. Les registres
 * (`common/kill-switches.ts` côté API, `services/kill_switch.py` côté moteur)
 * donnent à chacun une surface opérateur ; ils ne valent que COMPLETS. Un
 * interrupteur ajouté demain hors registre serait le défaut d'aujourd'hui, en
 * plus discret.
 *
 * ⚠️ CE QUE LE COMPTE « TREIZE » CACHAIT. `CLAUDE.md` en annonçait treize, puis
 * quinze. Le balayage du 30/08 en a trouvé **vingt-trois** réellement lus en
 * production. « Un total est un argument » : celui de cette garde se lit en
 * balayant le code, pas en recopiant une phrase.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE VÉRIFIE, ET POURQUOI DEUX MÉTHODES
 * ─────────────────────────────────────────────────────────────────────────────
 * Les deux services N'ONT PAS la même forme, et une garde qui l'ignorerait
 * serait borgne d'un côté :
 *
 *  - **TypeScript** nomme la variable au point de lecture. On cherche donc les
 *    LECTURES (`process.env[...]`) : aucune ne doit vivre hors du registre. Et
 *    on cherche les MENTIONS du nom (dans un message de journal, par exemple) :
 *    chacune doit désigner un interrupteur déclaré.
 *  - **Python** passe déjà par une indirection (`disabled(GROUNDING_KILL_SWITCH)`),
 *    si bien qu'AUCUN littéral `*_DISABLED` n'apparaît hors de `kill_switch.py`.
 *    Chercher le nom n'y verrait rien — la première écriture de cette garde a
 *    trouvé zéro mention côté Python et l'aurait annoncé comme un succès.
 *    On y vérifie donc deux choses : aucune LECTURE d'environnement `*_DISABLED`
 *    hors du registre, et chaque CONSTANTE d'interrupteur déclarée du registre
 *    est bien dans `CAPABILITY_KILL_SWITCHES`.
 *
 * Autres pièges évités, chacun payé par une garde de ce dépôt :
 *  - les COMMENTAIRES sont retirés avant toute recherche (un docblock qui cite
 *    `FOO_DISABLED` n'est pas une lecture) ;
 *  - les tests sont exclus (ils POSENT une variable, ils n'en dérivent pas un
 *    comportement de production) ;
 *  - `RegExp.test()` avec le drapeau `g` est STATEFUL : on n'utilise que
 *    `matchAll` et `match` ;
 *  - la non-vacuité est vérifiée en SORTIE (ce que le tuyau extrait), pas
 *    seulement en entrée (ce qu'il ouvre) — l'erreur de GA-16.
 */

const REPO_ROOT = join(__dirname, '..', '..', '..', '..')
const API_SRC = join(REPO_ROOT, 'apps', 'api', 'src')
const IA_APP = join(REPO_ROOT, 'apps', 'ia', 'app')
const TS_REGISTRY = join('common', 'kill-switches.ts')
const PY_REGISTRY = join('services', 'kill_switch.py')

/**
 * Ce qui porte le suffixe sans être un interrupteur.
 *
 * ⚠️ Une exception se NOMME et se justifie ; on n'affaiblit pas l'expression
 * régulière pour la faire disparaître, sinon la garde cesse de voir la famille
 * entière à laquelle elle appartient.
 */
const PAS_UN_INTERRUPTEUR: Record<string, string> = {
  // Code d'erreur RENDU par un fournisseur tiers quand une API n'est pas activée
  // côté client (`connector-error.ts`). C'est un motif qu'on LIT dans une
  // réponse, pas une variable qu'on pose.
  SERVICE_DISABLED: 'code d’erreur d’un fournisseur tiers, pas une variable',
}

function isProductionSource(path: string): boolean {
  if (/\.(spec|test)\.tsx?$/.test(path)) return false
  if (/[\\/]tests?[\\/]/.test(path)) return false
  return /\.(ts|tsx|py)$/.test(path)
}

function walk(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__pycache__' || entry === '.venv') continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (isProductionSource(full)) out.push(full)
  }
  return out
}

/** Retire les commentaires — c'est LA raison pour laquelle cette garde voit. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // blocs TS
    .replace(/"""[\s\S]*?"""/g, ' ') // docstrings Python
    .replace(/'''[\s\S]*?'''/g, ' ')
    .replace(/^[ \t]*\/\/.*$/gm, ' ') // lignes TS
    .replace(/^[ \t]*#.*$/gm, ' ') // lignes Python
}

const short = (p: string) => p.replace(`${REPO_ROOT}/`, '')

type Corpus = {
  tsFiles: string[]
  pyFiles: string[]
  /** Nom d'interrupteur → fichiers de CODE qui le nomment (hors registres). */
  tsMentions: Map<string, string[]>
  /** Lectures d'environnement `*_DISABLED` trouvées hors des registres. */
  strayReads: string[]
}

function scan(): Corpus {
  const tsFiles = walk(API_SRC)
  const pyFiles = walk(IA_APP)
  const tsMentions = new Map<string, string[]>()
  const strayReads: string[] = []

  for (const file of [...tsFiles, ...pyFiles]) {
    const isRegistry = file.endsWith(TS_REGISTRY) || file.endsWith(PY_REGISTRY)
    const code = stripComments(readFileSync(file, 'utf8'))

    if (!isRegistry) {
      // Une LECTURE d'environnement, dans l'un ou l'autre langage.
      const readers = [
        /process\.env(?:\.([A-Z][A-Z0-9_]*_DISABLED)\b|\[\s*['"]([A-Z][A-Z0-9_]*_DISABLED)['"]\s*\])/g,
        /os\.(?:environ\.get|getenv)\(\s*["']([A-Z][A-Z0-9_]*_DISABLED)["']/g,
      ]
      for (const pattern of readers) {
        for (const m of code.matchAll(pattern)) {
          const name = m[1] ?? m[2]
          if (name) strayReads.push(`${name} — ${short(file)}`)
        }
      }
    }

    if (file.endsWith('.ts') && !isRegistry) {
      for (const m of code.matchAll(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_DISABLED)\b/g)) {
        const name = m[1]
        if (!name || name in PAS_UN_INTERRUPTEUR) continue
        const seen = tsMentions.get(name) ?? []
        if (!seen.includes(file)) seen.push(file)
        tsMentions.set(name, seen)
      }
    }
  }

  return { tsFiles, pyFiles, tsMentions, strayReads }
}

/**
 * Les interrupteurs déclarés au registre Python, résolus depuis leur constante.
 *
 * On LIT le fichier plutôt qu'on ne recopie la liste : une liste recopiée dans
 * une garde est une seconde vérité, et c'est elle qui diverge.
 */
function pythonRegistry(): { capabilities: string[]; envVars: string[]; declaredConstants: string[] } {
  const source = readFileSync(join(IA_APP, 'services', 'kill_switch.py'), 'utf8')
  const block = source.match(/CAPABILITY_KILL_SWITCHES: dict\[str, str\] = \{([\s\S]*?)\n\}/)
  if (!block?.[1]) throw new Error('Registre Python introuvable — la garde ne peut rien lire.')

  const capabilities: string[] = []
  const envVars: string[] = []
  for (const line of block[1].split('\n')) {
    const entry = line.replace(/#.*$/, '').match(/"([^"]+)":\s*([A-Z_]+)/)
    if (!entry?.[1] || !entry[2]) continue
    capabilities.push(entry[1])
    const constant = source.match(new RegExp(`^${entry[2]} = "([A-Z0-9_]+)"`, 'm'))
    if (constant?.[1]) envVars.push(constant[1])
  }

  // Toute constante `*_KILL_SWITCH = "*_DISABLED"` du fichier, déclarée ou non :
  // c'est elle qui trahit un interrupteur oublié au registre.
  const declaredConstants = [...source.matchAll(/^([A-Z][A-Z0-9_]*_KILL_SWITCH) = "([A-Z0-9_]+)"/gm)].map(
    m => m[2] ?? '',
  )

  return { capabilities, envVars, declaredConstants }
}

describe('GA-84 — aucun interrupteur d’arrêt n’échappe à son registre', () => {
  const corpus = scan()
  const python = pythonRegistry()

  it('lit un corpus réel — les deux services, et de quoi en tirer quelque chose', () => {
    // Non-vacuité en ENTRÉE : le balayage a bien ouvert des fichiers des deux côtés.
    expect(corpus.tsFiles.length).toBeGreaterThan(500)
    expect(corpus.pyFiles.length).toBeGreaterThan(50)
    // Non-vacuité en SORTIE : et il en a bien EXTRAIT quelque chose. C'est la
    // moitié que GA-16 avait oubliée, et qui l'a rendue borgne deux jours.
    expect(corpus.tsMentions.size).toBeGreaterThanOrEqual(9)
    expect(python.envVars.length).toBeGreaterThanOrEqual(8)
    expect(python.declaredConstants.length).toBeGreaterThanOrEqual(8)
  })

  it('ne laisse AUCUNE lecture d’environnement hors des deux registres', () => {
    // C'est l'invariant « un réglage vit à un seul endroit » (GA-26) appliqué
    // aux interrupteurs : une seconde lecture pourrait dire l'inverse de la
    // première, et l'écran opérateur afficherait alors le contraire du réel.
    expect(corpus.strayReads).toEqual([])
  })

  it('déclare au registre API chaque interrupteur nommé dans du code TypeScript', () => {
    const declared = new Set(API_KILL_SWITCHES.map(s => s.envVar))
    const undeclared = [...corpus.tsMentions.entries()]
      .filter(([name]) => !declared.has(name))
      .map(([name, paths]) => `${name} — ${paths.map(short).join(', ')}`)
    expect(undeclared).toEqual([])
  })

  it('déclare au registre Python chaque constante d’interrupteur du moteur', () => {
    const missing = python.declaredConstants.filter(v => !python.envVars.includes(v))
    expect(missing).toEqual([])
  })

  it('fait correspondre les capacités IA des deux côtés — c’est sur elles que l’API joint', () => {
    expect([...IA_KILL_SWITCHES].map(s => s.id).sort()).toEqual([...python.capabilities].sort())
  })
})
