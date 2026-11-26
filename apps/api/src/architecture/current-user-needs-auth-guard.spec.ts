import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * GA — un handler qui lit `@CurrentUser()` porte un garde d'AUTHENTIFICATION.
 *
 * Finding pentest #5 (MOYENNE). Le seul `APP_GUARD` du dépôt est le rate-limit ;
 * il n'y a PAS de garde d'auth global. L'authentification est donc posée
 * contrôleur par contrôleur, et cinq routes l'avaient oubliée (`POST /crm/tasks`,
 * `/crm/meetings`, `/crm/contacts/:id/adopt/:field`, `GET /crm/stale-contacts`,
 * `POST /google/gmail/classify`) : atteignables anonymement, elles rendaient un
 * 500 en déréférençant `user.userId` sur un `req.user` absent (prouvé en direct).
 * Le cliquet GA-05 voisin mesure les PERMISSIONS d'espace, jamais la PRÉSENCE
 * d'un garde d'auth — il ne pouvait pas voir ce trou.
 *
 * La règle que ce test tient : si une route lit l'identité (`@CurrentUser()`),
 * c'est qu'elle en a besoin — donc un garde qui la pose doit être en portée
 * (sur la route, ou sur la classe), sauf marqueur anonyme explicite. Une route
 * sans garde qui lit `@CurrentUser` n'est pas « publique », elle est CASSÉE.
 */

const MODULES = join(__dirname, '..', 'modules')

/** Décorateurs/guards qui POSENT une identité (ou la déclarent volontairement absente). */
const AUTH_MARKERS = [
  'JwtGuard',
  'OptionalJwtGuard',
  'ApiAuthGuard',
  'ApiKeyGuard',
  'InternalSecretGuard',
  'BackofficeRoleGuard',
  'McpOauthGuard',
  '@Public',
  '@PersonalScope',
]

function listControllers(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) out.push(...listControllers(full))
    else if (entry.endsWith('.controller.ts') && !entry.endsWith('.spec.ts')) out.push(full)
  }
  return out
}

const HTTP_DECORATOR = /@(Get|Post|Put|Patch|Delete|All|Head|Options)\s*\(/

/** Le bloc de déclaration de classe : tout ce qui précède le 1er handler HTTP. */
function classHeader(source: string): string {
  const idx = source.search(HTTP_DECORATOR)
  return idx === -1 ? source : source.slice(0, idx)
}

function hasAuthMarker(block: string): boolean {
  return AUTH_MARKERS.some(m => block.includes(m))
}

type Handler = { block: string; hasCurrentUser: boolean }

/**
 * Découpe un fichier contrôleur en unités « décorateurs + signature de méthode »,
 * une par décorateur HTTP. Chaque unité va d'un décorateur HTTP au suivant : elle
 * contient donc les gardes de la route ET les paramètres de la méthode (où vit
 * `@CurrentUser()`).
 */
function splitHandlers(source: string): Handler[] {
  const starts: number[] = []
  const re = new RegExp(HTTP_DECORATOR, 'g')
  let m: RegExpExecArray | null
  while ((m = re.exec(source)) !== null) starts.push(m.index)
  return starts.map((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1]! : source.length
    const block = source.slice(start, end)
    return { block, hasCurrentUser: /@CurrentUser\s*\(/.test(block) }
  })
}

/** Les routes qui lisent `@CurrentUser()` sans garde d'auth en portée. */
function unguardedCurrentUserHandlers(source: string): number {
  const classGuarded = hasAuthMarker(classHeader(source))
  if (classGuarded) return 0
  return splitHandlers(source).filter(h => h.hasCurrentUser && !hasAuthMarker(h.block)).length
}

describe('GA — @CurrentUser() implique un garde d’authentification (finding #5)', () => {
  const controllers = listControllers(MODULES)

  it('lit un corpus non vide', () => {
    expect(controllers.length).toBeGreaterThan(50)
  })

  it('aucune route ne lit @CurrentUser sans garde d’auth (route ou classe)', () => {
    const offenders = controllers
      .map(f => ({ file: f.replace(`${MODULES}/`, ''), n: unguardedCurrentUserHandlers(readFileSync(f, 'utf8')) }))
      .filter(x => x.n > 0)
    expect(offenders).toEqual([])
  })

  // --- Le checker sait dire NON, et ne sur-attrape pas ---

  it('SÉCURITÉ — flague une route @CurrentUser sans garde', () => {
    const src = `
      @Controller('crm')
      export class CrmController {
        @Post('tasks')
        async createTask(@CurrentUser() user: CurrentUserPayload) { return this.crm.createTask(user.userId) }
      }
    `
    expect(unguardedCurrentUserHandlers(src)).toBe(1)
  })

  it('accepte un garde au niveau ROUTE', () => {
    const src = `
      @Controller('crm')
      export class CrmController {
        @Post('tasks')
        @UseGuards(JwtGuard)
        async createTask(@CurrentUser() user: CurrentUserPayload) { return 1 }
      }
    `
    expect(unguardedCurrentUserHandlers(src)).toBe(0)
  })

  it('accepte un garde au niveau CLASSE', () => {
    const src = `
      @Controller('x')
      @UseGuards(JwtGuard)
      export class XController {
        @Post('a')
        a(@CurrentUser() u: CurrentUserPayload) { return 1 }
        @Get('b')
        b(@CurrentUser() u: CurrentUserPayload) { return 2 }
      }
    `
    expect(unguardedCurrentUserHandlers(src)).toBe(0)
  })

  it('n’attrape pas une route sans @CurrentUser (rien à protéger)', () => {
    const src = `
      @Controller('health')
      export class HealthController {
        @Get()
        ping() { return { ok: true } }
      }
    `
    expect(unguardedCurrentUserHandlers(src)).toBe(0)
  })

  it('accepte un marqueur anonyme explicite (@Public)', () => {
    const src = `
      @Controller('demo')
      export class DemoController {
        @Post('session')
        @Public()
        start(@CurrentUser() u: CurrentUserPayload | null) { return 1 }
      }
    `
    expect(unguardedCurrentUserHandlers(src)).toBe(0)
  })
})
