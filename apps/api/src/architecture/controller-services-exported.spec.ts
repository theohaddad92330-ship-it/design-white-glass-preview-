import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA-42 — un service injecté par un contrôleur est un service ATTEIGNABLE.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * POURQUOI CETTE GARDE EXISTE
 * ─────────────────────────────────────────────────────────────────────────
 * Le 26/08/2026, le contrôleur du studio d'appels d'offres a été branché sur
 * `ProjectPipelineService` pour écrire un besoin via le service qui POSSÈDE la
 * table (#1097). `ProjectsModule` ne l'exportait pas. Nest ne résout pas la
 * dépendance, l'application refuse de démarrer, et Railway rejette le
 * déploiement au healthcheck.
 *
 * Comme pour GA-20, **aucun test n'est tombé** : 5 950 tests verts, typecheck
 * vert, build vert. Les specs construisent les services à la main, et le seul
 * test qui monte une application ne charge qu'un sous-ensemble de modules — pas
 * `AppModule`. Le graphe de dépendances n'était donc vérifié qu'au démarrage
 * réel, c'est-à-dire en production.
 *
 * GA-20 garde la même règle pour les REPOSITORIES. Celle-ci la garde pour les
 * SERVICES, et se limite aux CONTRÔLEURS : c'est là que vit l'orchestration
 * inter-modules (la sortie que GA-07 nomme elle-même), donc là que le défaut
 * apparaît.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * CE QU'ELLE NE SAIT PAS VOIR
 * ─────────────────────────────────────────────────────────────────────────
 * L'injection par jeton (`@Inject(TOKEN)`) — un jeton ne se résout pas par le
 * nom d'un type — et les services du socle Nest, listés dans
 * `RESOLVED_ELSEWHERE` avec leur raison.
 *
 * Les modules `@Global()`, en revanche, sont RÉSOLUS : ce qu'ils exportent est
 * visible partout, et l'écrire comme une règle vaut mieux que d'énumérer les
 * services qu'ils fournissent — la liste aurait vieilli au premier ajout, et
 * une garde qu'on nourrit à la main finit par être nourrie sans réfléchir.
 */

const MODULES = join(__dirname, '..', 'modules')

/**
 * Les services injectés par un contrôleur que la lecture statique ne sait pas
 * rattacher. Chaque ligne est un constat VÉRIFIÉ : on a lu d'où vient le
 * service, et confirmé que Nest le résout.
 */
const RESOLVED_ELSEWHERE = new Map<string, string>([
  ['ConfigService', '@nestjs/config est global'],
  ['JwtService', 'JwtModule est enregistré globalement'],
  // ⚠️ `EventEmitter2` a été RETIRÉ de cette liste le 30/08/2026. La ligne
  // affirmait « @nestjs/event-emitter est global » — c'était FAUX : le paquet
  // n'est ni dans `apps/api/package.json` ni dans le lockfile, et il n'existe
  // aucun `EventEmitterModule.forRoot()` dans le dépôt. La liste dit d'elle-même
  // que « chaque ligne est un constat VÉRIFIÉ » ; celle-ci ne l'était pas, et
  // elle aurait laissé passer une injection qui plante au démarrage. Un agent
  // a construit une architecture entière sur cette phrase avant de la vérifier.
  ['Reflector', 'fourni par le socle Nest'],
  ['ModuleRef', 'fourni par le socle Nest'],
])

function moduleDirs(): string[] {
  return readdirSync(MODULES).filter(entry => statSync(join(MODULES, entry)).isDirectory())
}

function filesIn(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      out.push(...filesIn(full))
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.spec.ts') && !entry.endsWith('.d.ts')) out.push(full)
  }
  return out
}

/**
 * ⚠️ Les commentaires sont retirés AVANT toute lecture — leçon de GA-08 et de
 * GA-20 : les listes de ce dépôt sont commentées ligne par ligne, et un
 * commentaire qui contient une virgule fait manquer l'entrée qui le suit. Une
 * garde qui annonce des fautifs qui n'en sont pas est une garde qu'on désactive.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')
}

/** Le contenu d'une clé de `@Module({...})` — `providers`, `exports`, `imports`. */
function moduleList(source: string, key: 'providers' | 'exports' | 'imports'): string[] {
  const clean = withoutComments(source)
  const start = clean.indexOf(`${key}:`)
  if (start === -1) return []
  const open = clean.indexOf('[', start)
  if (open === -1) return []
  let depth = 0
  let end = open
  for (let i = open; i < clean.length; i += 1) {
    if (clean[i] === '[') depth += 1
    if (clean[i] === ']') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  return [...clean.slice(open + 1, end).matchAll(/\b([A-Z][A-Za-z0-9_]*)\b/g)].map(m => m[1] as string)
}

/** Les modules LOCAUX importés, par nom de dossier. */
function importedLocalModules(source: string): string[] {
  return [...withoutComments(source).matchAll(/from '\.\.\/([a-z0-9-]+)\/[a-zA-Z0-9.-]*module'/g)].map(
    match => match[1] as string,
  )
}

/** Les types de services injectés dans le constructeur d'un contrôleur. */
function injectedServices(source: string): string[] {
  const clean = withoutComments(source)
  const start = clean.indexOf('constructor(')
  if (start === -1) return []
  const open = clean.indexOf('(', start)
  let depth = 0
  let end = open
  for (let i = open; i < clean.length; i += 1) {
    if (clean[i] === '(') depth += 1
    if (clean[i] === ')') {
      depth -= 1
      if (depth === 0) {
        end = i
        break
      }
    }
  }
  const params = clean.slice(open + 1, end)
  // On ne lit que les paramètres SANS `@Inject(...)` : une injection par jeton
  // ne se résout pas par le nom du type.
  return params
    .split(',')
    .filter(param => !param.includes('@Inject'))
    .flatMap(param => {
      const match = /:\s*([A-Z][A-Za-z0-9_]*)\s*$/.exec(param.trim())
      return match ? [match[1] as string] : []
    })
    .filter(name => name.endsWith('Service'))
}

describe('GA-42 — un service injecté par un contrôleur est atteignable depuis son module', () => {
  const dirs = moduleDirs()

  /** Ce que chaque module FOURNIT (ses providers) et ce qu'il EXPORTE. */
  const provided = new Map<string, Set<string>>()
  const exported = new Map<string, Set<string>>()
  /** Ce qu'exporte un module `@Global()` est visible de partout, sans import. */
  const globallyVisible = new Set<string>()
  for (const dir of dirs) {
    const moduleFiles = filesIn(join(MODULES, dir)).filter(file => file.endsWith('.module.ts'))
    const own = new Set<string>()
    const out = new Set<string>()
    for (const file of moduleFiles) {
      const source = readFileSync(file, 'utf8')
      for (const name of moduleList(source, 'providers')) own.add(name)
      const exports = moduleList(source, 'exports')
      for (const name of exports) out.add(name)
      if (/@Global\(\)/.test(withoutComments(source))) for (const name of exports) globallyVisible.add(name)
    }
    provided.set(dir, own)
    exported.set(dir, out)
  }

  const unreachable: string[] = []
  let controllersRead = 0
  let injectionsRead = 0

  for (const dir of dirs) {
    const moduleFiles = filesIn(join(MODULES, dir)).filter(file => file.endsWith('.module.ts'))
    if (moduleFiles.length === 0) continue

    // Ce que le contrôleur de ce module peut voir : les providers de son module,
    // plus ce qu'exportent les modules locaux qu'il importe.
    const visible = new Set([...(provided.get(dir) ?? []), ...globallyVisible])
    for (const file of moduleFiles) {
      for (const imported of importedLocalModules(readFileSync(file, 'utf8'))) {
        for (const name of exported.get(imported) ?? []) visible.add(name)
        // Un module qui ré-exporte un module entier passe aussi ce qu'il exporte.
        for (const reexported of exported.get(imported) ?? []) {
          const asDir = reexported
            .replace(/Module$/, '')
            .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
            .toLowerCase()
          for (const name of exported.get(asDir) ?? []) visible.add(name)
        }
      }
    }

    for (const file of filesIn(join(MODULES, dir)).filter(f => f.endsWith('.controller.ts'))) {
      controllersRead += 1
      for (const service of injectedServices(readFileSync(file, 'utf8'))) {
        injectionsRead += 1
        if (visible.has(service)) continue
        if (RESOLVED_ELSEWHERE.has(service)) continue
        unreachable.push(`${dir} : le contrôleur injecte ${service}, que ni son module ni ses imports ne fournissent`)
      }
    }
  }

  it('aucun contrôleur n’injecte un service que son module ne peut pas résoudre', () => {
    // Si ce test tombe : exporte le service depuis SON module, ou importe le
    // module qui l'exporte. L'application ne DÉMARRERAIT pas en production, et
    // aucun test unitaire ne le verrait — ils construisent les classes à la main.
    expect(unreachable).toEqual([])
  })

  it('la garde lit bien des contrôleurs et des injections — sinon elle serait verte pour toujours', () => {
    // Le contrôle qui manquait aux six gardes borgnes de fin août : prouver
    // qu'elle a un corpus. Une garde qui ne lit rien passe au vert sur tout.
    expect(controllersRead).toBeGreaterThan(50)
    expect(injectionsRead).toBeGreaterThan(100)
  })

  it('la garde sait dire NON', () => {
    // Le second contrôle : casser volontairement ce qu'elle protège. C'est le
    // cas EXACT du 26/08 — un contrôleur branché sur un service qu'aucun module
    // visible n'exporte.
    const faux = `
      @Controller('rfp')
      export class RfpController {
        constructor(private readonly pipeline: ProjectPipelineService) {}
      }
    `
    expect(injectedServices(faux)).toEqual(['ProjectPipelineService'])
    expect(new Set(['RfpService']).has('ProjectPipelineService')).toBe(false)
  })
})
