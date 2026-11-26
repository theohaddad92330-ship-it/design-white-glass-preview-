import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2195.33 — OUVRIR UNE AFFAIRE EST UN GESTE D'HUMAIN, ET RIEN D'AUTRE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE (elle ne l'invente pas)
 * ─────────────────────────────────────────────────────────────────────────────
 * « Une écriture CRM/ERP passe par une porte : geste d'utilisateur =
 * auto-approuvé (le clic EST la décision) ; geste de système = demande visible,
 * prévisualisation FIGÉE, expiration 3 jours. » Décision de Louis du
 * 16/09/2026 en ouvrant `POST /projects` : **on ne crée jamais une affaire tout
 * seul.**
 *
 * Trois choses sont vérifiées, et chacune répond à un accident précis :
 *
 *  1. La route d'écriture porte la MÊME porte que ses huit voisines
 *     (`@RequirePermission('records:write')` sous `WorkspacePermissionGuard`).
 *     Le guard est fail-open : une route sans déclaration passe intacte, et le
 *     cloisonnement par business unit tomberait en silence.
 *  2. `createForWorkspace` n'a qu'UN appelant, le contrôleur. Un balayage, une
 *     routine planifiée ou un outil du copilote qui l'appellerait créerait des
 *     affaires que personne n'a décidées — et un pipe qui grossit tout seul
 *     n'est plus un pipe, c'est un bruit.
 *
 * ⚠️⚠️ RÉÉCRITE LE 11/10/2026 (Louis, épopée #4016, lot L6 — renversement daté
 * de #2377.8 / #2320.22, `agent_docs/doctrine.md`) : Bellum écrit désormais
 * SEUL, dans le pipe, une ligne « détecté, à revoir » (`pipeline_detections`).
 * Confirmer cette ligne OUVRE l'affaire — et c'est un DEUXIÈME contrôleur,
 * `pipeline-detections.controller.ts`, derrière la même permission. La règle
 * qui reste, et que la garde tient : `createForWorkspace` n'est appelé QUE
 * depuis un CONTRÔLEUR (un clic), jamais depuis un balayeur, une routine, un
 * worker ou un service. Le balayeur du pipe détecté n'a AUCUN accès à cette
 * porte.
 *
 *  3. Le corpus est NON VIDE et le balayage attrape vraiment quelque chose
 *     (témoin : la LECTURE `listForWorkspace`, elle, a plusieurs appelants
 *     légitimes). Sans ce témoin, une garde qui ne lit rien reste verte pour
 *     toujours.
 */

const API_SRC = join(__dirname, '..')
const CONTROLLER = join(API_SRC, 'modules', 'projects', 'projects.controller.ts')
/** #4016 L6 — confirmer une ligne « détecté, à revoir » est le second clic qui ouvre une affaire. */
const DETECTIONS_CONTROLLER = join(API_SRC, 'modules', 'pipeline-detections', 'pipeline-detections.controller.ts')
const DETECTIONS_SWEEP = [
  join(API_SRC, 'modules', 'pipeline-detections', 'pipeline-detections.sweeper.ts'),
  join(API_SRC, 'modules', 'pipeline-detections', 'pipeline-detections.service.ts'),
]

/** Un clic arrive par un CONTRÔLEUR HTTP ; tout le reste est un geste de système. */
function isHumanGestureFile(file: string): boolean {
  return file.endsWith('.controller.ts')
}

/** Les commentaires ne sont pas du code : un motif compté dedans est un faux. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^[ \t]*\/\/.*$/gm, '')
}

function walk(dir: string, files: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) {
      if (entry === 'node_modules' || entry === 'dist') continue
      walk(full, files)
      continue
    }
    if (entry.endsWith('.ts') && !entry.endsWith('.d.ts')) files.push(full)
  }
  return files
}

/** Les fichiers de PRODUCTION : un `.spec.ts` appelle ce qu'il teste, c'est son
 *  métier, et le compter ferait rougir la garde pour la raison inverse. */
function productionFiles(): string[] {
  return walk(API_SRC).filter(file => !file.endsWith('.spec.ts') && !file.includes(`${'__tests__'}`))
}

function callersOf(method: string): string[] {
  const needle = new RegExp(`\\.${method}\\s*\\(`)
  return productionFiles().filter(file => needle.test(stripComments(readFileSync(file, 'utf8'))))
}

describe('#2195.33 — créer une affaire est un geste d’humain', () => {
  const controllerSource = readFileSync(CONTROLLER, 'utf8')

  it('lit un corpus réel — le contrôleur et les fichiers de production', () => {
    // Le contrôle qui empêche la garde d'être borgne : si l'un de ces deux
    // nombres tombe à zéro, tout le reste passerait sans rien avoir lu.
    expect(controllerSource.length).toBeGreaterThan(1000)
    expect(productionFiles().length).toBeGreaterThan(200)
  })

  it('POST /projects porte la permission d’écriture, comme ses voisines', () => {
    const code = stripComments(controllerSource)
    // La classe est bien derrière le garde qui LIT la permission : sans lui, le
    // décorateur ne serait qu'une annotation décorative.
    expect(code).toContain('WorkspacePermissionGuard')
    // `@Post()` NU (la racine `/projects`), suivi de sa permission. Le motif
    // exige l'adjacence : une permission posée trois routes plus bas ne garde
    // pas celle-ci.
    expect(code).toMatch(/@Post\(\)\s*\n\s*@RequirePermission\('records:write'\)/)
  })

  it('aucun geste de SYSTÈME n’ouvre une affaire : createForWorkspace n’a que ses deux contrôleurs (#4016 L6)', () => {
    const callers = callersOf('createForWorkspace')
    expect(callers.sort()).toEqual([CONTROLLER, DETECTIONS_CONTROLLER].sort())
    for (const caller of callers) expect(isHumanGestureFile(caller)).toBe(true)
  })

  it('#4016 L6 — le balayeur du pipe « détecté » n’ouvre JAMAIS d’affaire lui-même', () => {
    for (const file of DETECTIONS_SWEEP) {
      const code = stripComments(readFileSync(file, 'utf8'))
      expect(code.length).toBeGreaterThan(500) // lit un fichier réel
      expect(code).not.toMatch(/\.createForWorkspace\s*\(/)
      expect(code).not.toMatch(/INSERT INTO opportunities/)
    }
  })

  it('le second contrôleur porte la permission d’écriture sur sa confirmation', () => {
    const code = stripComments(readFileSync(DETECTIONS_CONTROLLER, 'utf8'))
    expect(code).toContain('WorkspacePermissionGuard')
    expect(code).toMatch(/@Post\(':id\/confirm'\)\s*\n\s*@RequirePermission\('records:write'\)/)
  })

  it('SAIT DIRE NON — un balayeur, un worker ou un service appelant serait refusé', () => {
    expect(isHumanGestureFile(join(API_SRC, 'modules', 'pipeline-detections', 'pipeline-detections.sweeper.ts'))).toBe(
      false,
    )
    expect(isHumanGestureFile(join(API_SRC, 'modules', 'routines', 'routine.worker.ts'))).toBe(false)
    expect(isHumanGestureFile(join(API_SRC, 'modules', 'projects', 'projects.service.ts'))).toBe(false)
    expect('await this.projects.createForWorkspace(ws, input)').toMatch(/\.createForWorkspace\s*\(/)
  })

  it('témoin — la garde n’attrape pas les LECTURES, qui ont plusieurs appelants légitimes', () => {
    // `listForWorkspace` est une lecture : plusieurs écrans la demandent, et
    // c'est sain. Si ce compte tombait à 1, le balayage ci-dessus ne
    // prouverait plus rien — il rendrait « un seul appelant » parce qu'il ne
    // sait pas chercher, pas parce que la règle tient.
    expect(callersOf('listForWorkspace').length).toBeGreaterThan(1)
  })
})
