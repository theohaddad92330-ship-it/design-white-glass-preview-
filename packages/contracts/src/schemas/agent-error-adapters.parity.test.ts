import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { agentErrorFromHttpError, agentErrorFromUnknown, type HttpErrorLike } from './agent-error-adapters.js'
import { errorServiceSchema, errorSeveritySchema } from './agent-envelope.js'

/**
 * La garde de parité des ADAPTATEURS D'ERREUR — TS ↔ Python.
 *
 * ## Pourquoi elle existe (D30, 28/08/2026)
 *
 * `agent-error-adapters.ts` est le miroir TypeScript de
 * `apps/ia/app/models/agent_error_adapters.py`. Le Python vit — il est appelé par
 * les agents ; le TypeScript, lui, n'a aujourd'hui aucun appelant applicatif. La
 * question restait donc ouverte : parité VOULUE, ou code mort qu'on garde par
 * habitude ? Louis a tranché — c'est une parité délibérée, elle reste. Et **une
 * parité qui n'est pas prouvée n'existe pas** : sans ce fichier, les deux moitiés
 * dérivent en silence et personne ne l'apprend avant le jour où une erreur de
 * production s'affiche sous le mauvais service.
 *
 * ## Pourquoi une copie, et pourquoi elle ne peut pas être un import
 *
 * Le service IA est un autre processus, en Python : il n'a pas le paquet
 * `contracts` à l'exécution. La frontière interdit l'import ; elle n'interdit pas
 * de vérifier. On lit donc les sources Python sur le disque, comme le font déjà
 * `method-delta.parity.test.ts` et `cadence-parity.test.ts`.
 *
 * ## Les trois tables comparées, et le défaut que chacune évite
 *
 * 1. **Les services** — `SERVICE_WHITELIST` (le littéral recopié À LA MAIN dans
 *    l'adaptateur TS), `errorServiceSchema` (le contrat zod) et `ErrorService`
 *    (l'enum Pydantic) doivent porter les mêmes valeurs, dans le même ordre.
 *    Le défaut concret si elles divergent : le jour où Python ajoute un service,
 *    `normalizeService` — qui ne connaît QUE la liste blanche — réécrit
 *    silencieusement ce service en `'internal'`. L'erreur remonte alors attribuée
 *    au mauvais coupable, sans une seule exception pour le signaler. C'est la
 *    raison pour laquelle on extrait le LITTÉRAL du fichier et pas l'ensemble
 *    construit : importer `SERVICE_WHITELIST` prouverait qu'il est égal à
 *    lui-même.
 * 2. **Les sévérités** — `errorSeveritySchema` ↔ `ErrorSeverity`. Deux valeurs,
 *    mais c'est d'elles que `retryable` est dérivé des deux côtés.
 * 3. **Les codes** — tout code qu'un adaptateur peut ÉMETTRE, dans l'un ou
 *    l'autre langage, doit être déclaré au registre §5 de
 *    `agent_docs/agent-contract.md` AVEC la même sévérité. Le document le dit
 *    déjà (« ne pas créer de codes ad-hoc dans le code ») et rien ne le tenait.
 *    Côté TS on interroge le RUNTIME — la sévérité y est une variable, l'extraire
 *    du texte serait une garde qui devine ; côté Python on extrait les littéraux,
 *    le module n'étant pas importable depuis vitest.
 *
 * ## Ce que cette garde ne prétend PAS
 *
 * Les deux modules ne sont pas symétriques et ne doivent pas l'être : le TS est
 * le côté CLIENT (il traduit une réponse HTTP opaque), le Python le côté
 * PRODUCTEUR (il traduit des exceptions Claude / Firecrawl). Exiger le même
 * ensemble de codes des deux côtés serait faux. Ce qui est exigé est plus fort et
 * plus juste : chacun ne parle que le vocabulaire du registre, et sur le seul
 * code que les deux émettent (`AGENT_INTERNAL`) ils disent la même chose.
 *
 * ⚠️ Une garde doit prouver qu'elle LIT quelque chose. Le premier test vérifie le
 * CORPUS et pas le verdict : sans lui, un chemin renommé ou une regex périmée
 * rendrait toutes les comparaisons vraies par vacuité, pour toujours.
 */

const _here = dirname(fileURLToPath(import.meta.url))

function monorepoFile(relative: string): string {
  let current = _here
  for (let depth = 0; depth < 10; depth += 1) {
    const candidate = join(current, relative)
    if (existsSync(candidate)) return candidate
    current = dirname(current)
  }
  throw new Error(`Fichier introuvable en remontant depuis ${_here} : ${relative}`)
}

const ADAPTERS_PY = monorepoFile('apps/ia/app/models/agent_error_adapters.py')
const ENVELOPE_PY = monorepoFile('apps/ia/app/models/agent_envelope.py')
const CONTRACT_MD = monorepoFile('agent_docs/agent-contract.md')
const ADAPTERS_TS = join(_here, 'agent-error-adapters.ts')

const adaptersPy = readFileSync(ADAPTERS_PY, 'utf8')
const envelopePy = readFileSync(ENVELOPE_PY, 'utf8')
const contractMd = readFileSync(CONTRACT_MD, 'utf8')
const adaptersTs = readFileSync(ADAPTERS_TS, 'utf8')

/**
 * Le source Python débarrassé de ce qu'un humain y écrit pour lui-même —
 * docstrings d'abord (elles peuvent contenir un `#`), commentaires ensuite.
 * Sans cette passe, la doc de tête, qui CITE les codes qu'elle explique, se
 * ferait compter comme du code émis : la garde lirait un corpus qu'elle a
 * inventé.
 */
function withoutProse(source: string): string {
  return source.replace(/"""[\s\S]*?"""/g, '').replace(/#[^\n]*/g, '')
}

const adaptersPyCode = withoutProse(adaptersPy)
const envelopePyCode = withoutProse(envelopePy)

/** Les valeurs d'un `class X(str, Enum):` Pydantic, dans l'ordre du fichier. */
function pythonEnumValues(name: string): string[] {
  const marker = `class ${name}(str, Enum):`
  const start = envelopePyCode.indexOf(marker)
  expect(start, `déclaration \`${marker}\` introuvable dans ${ENVELOPE_PY}`).toBeGreaterThan(-1)
  const body = envelopePyCode.slice(start + marker.length).split('\n\n\n')[0] ?? ''
  return [...body.matchAll(/^\s+[A-Z_]+ = "([a-z_]+)"$/gm)].map(match => match[1] as string)
}

/** Le littéral `SERVICE_WHITELIST` tel qu'il est ÉCRIT dans l'adaptateur TS —
 *  pas l'ensemble importé, qui ne prouverait que sa propre existence. */
function tsServiceWhitelistLiteral(): string[] {
  const marker = 'const SERVICE_WHITELIST = new Set'
  const start = adaptersTs.indexOf(marker)
  expect(start, `déclaration \`${marker}\` introuvable dans ${ADAPTERS_TS}`).toBeGreaterThan(-1)
  // On ouvre APRÈS le `([` : le paramètre de type porte lui aussi une chaîne
  // entre apostrophes (`AgentError['service']`), et la compter reviendrait à
  // inventer un neuvième service que le fichier ne déclare pas.
  const body = adaptersTs.slice(adaptersTs.indexOf('([', start) + 2).split('])')[0] ?? ''
  return [...body.matchAll(/'([a-z_]+)'/g)].map(match => match[1] as string)
}

/**
 * Tout code que l'adaptateur PYTHON peut émettre, avec sa sévérité, depuis les
 * trois formes littérales du fichier : la construction directe d'un `AgentError`,
 * le couple rendu par `_claude_subclass_to_code`, et la table `_FIRECRAWL_CODE_MAP`.
 */
function pythonEmittedCodes(): Map<string, 'recoverable' | 'terminal'> {
  const out = new Map<string, 'recoverable' | 'terminal'>()
  const record = (code: string, severity: string) => out.set(code, severity.toLowerCase() as 'recoverable' | 'terminal')

  for (const [, code, , severity] of adaptersPyCode.matchAll(
    /code="([A-Z][A-Z0-9_]*)",\s*service=ErrorService\.([A-Z_]+),\s*severity=ErrorSeverity\.([A-Z_]+),\s*retryable=(?:True|False)/g,
  ))
    record(code as string, severity as string)

  for (const [, code, severity] of adaptersPyCode.matchAll(/return "([A-Z][A-Z0-9_]*)", ErrorSeverity\.([A-Z_]+)/g))
    record(code as string, severity as string)

  const mapStart = adaptersPyCode.indexOf('_FIRECRAWL_CODE_MAP')
  expect(mapStart, `table \`_FIRECRAWL_CODE_MAP\` introuvable dans ${ADAPTERS_PY}`).toBeGreaterThan(-1)
  const mapBody = adaptersPyCode.slice(mapStart).split('\n}')[0] ?? ''
  for (const [, code, severity] of mapBody.matchAll(/"([A-Z][A-Z0-9_]*)",\s*ErrorSeverity\.([A-Z_]+)/g))
    record(code as string, severity as string)

  return out
}

/**
 * Le registre §5 du contrat, la seule table qui fait foi : `code → severity`.
 * Bornée à la section pour ne pas ramasser les blocs de code des §6 et suivants.
 * Les colonnes diffèrent d'un tableau à l'autre (celui de Brave n'a pas de
 * colonne HTTP) — on prend donc la première cellule qui EST une sévérité, pas
 * la deuxième cellule.
 */
function registryCodes(): Map<string, string> {
  const start = contractMd.indexOf("## 5. Registre des codes d'erreur")
  expect(start, `section §5 introuvable dans ${CONTRACT_MD}`).toBeGreaterThan(-1)
  const section = contractMd.slice(start, contractMd.indexOf('\n## ', start + 5))
  const out = new Map<string, string>()
  for (const line of section.split('\n')) {
    if (!line.trim().startsWith('|')) continue
    const cells = line
      .trim()
      .replace(/^\||\|$/g, '')
      .split('|')
      .map(cell => cell.trim())
    const code = /^`([A-Z][A-Z0-9_]*)`$/.exec(cells[0] ?? '')?.[1]
    if (!code) continue
    const severity = cells.slice(1).find(cell => cell === 'recoverable' || cell === 'terminal' || cell === 'n/a')
    out.set(code, severity ?? '<absente>')
  }
  return out
}

/** Ce que l'adaptateur TS produit VRAIMENT — ses trois chemins, au runtime. */
function tsEmittedErrors() {
  const http = (over: Partial<HttpErrorLike>): HttpErrorLike => ({
    status: 500,
    body: '',
    retryable: true,
    endpoint: '/phase/1/research',
    ...over,
  })
  return [
    agentErrorFromHttpError(http({ retryable: true, status: 503 })),
    agentErrorFromHttpError(http({ retryable: false, status: 400 })),
    agentErrorFromUnknown(new Error('boum')),
  ]
}

describe('parité des adaptateurs d’erreur — TS ↔ Python', () => {
  it('LIT vraiment les sources Python et le registre (sinon la garde est borgne)', () => {
    // Le corpus, pas le verdict. Une garde qui lirait un fichier vide — chemin
    // périmé, module renommé — passerait au vert sans avoir rien comparé.
    expect(adaptersPy.length).toBeGreaterThan(4000)
    expect(envelopePy.length).toBeGreaterThan(2000)
    expect(adaptersTs.length).toBeGreaterThan(3000)
    expect(adaptersPy).toContain('_FIRECRAWL_CODE_MAP')
    expect(envelopePy).toContain('class ErrorService(str, Enum):')

    expect(pythonEnumValues('ErrorService')).toHaveLength(8)
    expect(pythonEnumValues('ErrorSeverity')).toHaveLength(2)
    expect(tsServiceWhitelistLiteral()).toHaveLength(8)
    expect(pythonEmittedCodes().size).toBe(12)
    expect(registryCodes().size).toBe(25)
    expect(tsEmittedErrors()).toHaveLength(3)
  })

  it('la table des SERVICES est la même des deux côtés — mêmes valeurs, même ordre, aucune en trop', () => {
    // Le défaut évité : Python ajoute un service, la liste blanche TS l'ignore,
    // et `normalizeService` réécrit l'erreur en `internal`. Elle serait alors
    // attribuée au mauvais coupable, sans une exception pour le dire.
    const python = pythonEnumValues('ErrorService')
    expect(tsServiceWhitelistLiteral()).toEqual(python)
    expect([...errorServiceSchema.options]).toEqual(python)
  })

  it('la table des SÉVÉRITÉS est la même des deux côtés — c’est d’elle que `retryable` est dérivé', () => {
    expect([...errorSeveritySchema.options]).toEqual(pythonEnumValues('ErrorSeverity'))
  })

  it('aucun code ad-hoc : tout code émis, TS ou Python, est déclaré au registre §5', () => {
    const registry = registryCodes()
    const inconnus = [...tsEmittedErrors().map(err => err.code), ...pythonEmittedCodes().keys()].filter(
      code => !registry.has(code),
    )
    // Si ce test tombe : ajoute la ligne au §5 de `agent_docs/agent-contract.md`
    // AVANT de fusionner. Un code absent du registre n'est abonné par personne —
    // ni le front, ni l'alerting, ni les tags Sentry.
    expect(inconnus).toEqual([])
  })

  it('un code émis porte la sévérité que le registre lui donne — des deux côtés', () => {
    const registry = registryCodes()
    const desaccords: Record<string, string> = {}

    for (const err of tsEmittedErrors()) {
      const attendu = registry.get(err.code)
      if (attendu !== err.severity) desaccords[`TS:${err.code}`] = `${err.severity} ≠ §5 ${attendu}`
      // §4 : `retryable` EST la sévérité, écrite deux fois. Les deux écritures
      // se contredisent le jour où l'une bouge seule.
      if (err.retryable !== (err.severity === 'recoverable')) desaccords[`TS:${err.code}`] = 'retryable ≠ severity'
    }

    for (const [code, severity] of pythonEmittedCodes()) {
      const attendu = registry.get(code)
      if (attendu !== severity) desaccords[`PY:${code}`] = `${severity} ≠ §5 ${attendu}`
    }

    expect(desaccords).toEqual({})
  })

  it('sur le seul code que les DEUX émettent, ils disent la même chose', () => {
    // Les deux modules ne sont pas symétriques — le TS est le côté client, le
    // Python le côté producteur — et c'est voulu. Leur intersection est le
    // filet de sécurité commun : l'exception non typée.
    const python = pythonEmittedCodes()
    const ts = new Map(tsEmittedErrors().map(err => [err.code, err.severity] as const))
    const communs = [...ts.keys()].filter(code => python.has(code))

    expect(communs).toEqual(['AGENT_INTERNAL'])
    for (const code of communs) expect(python.get(code)).toBe(ts.get(code))
  })
})
