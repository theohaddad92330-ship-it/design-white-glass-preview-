import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2320.22 — AUCUNE TRANSITION NE SE DÉDUIT AUTOMATIQUEMENT D'UN SIGNAL FAIBLE.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE (elle ne l'invente pas)
 * ─────────────────────────────────────────────────────────────────────────────
 * `deal-stage-proposal.spec.ts` (#1934.18) garde déjà « le stade CRM se
 * propose, il ne s'écrit pas » — mais SEULEMENT côté CRM externe. Cette garde
 * couvre la CHAÎNE INTERNE (besoin → matching → shortlist → positionnement →
 * mission), où le même défaut serait pire : un score de matching ou une
 * shortlist ne doivent jamais, seuls, faire naître un positionnement ou une
 * mission.
 *
 * Trois écritures, trois gestes : chacune n'a que ses appelants-contrôleurs
 * connus, et chacune prend un `userId` explicite — jamais dérivée d'un score
 * ou d'un run de matching passé en silence par une routine.
 *
 * ⚠️⚠️ RÉÉCRITE LE 11/10/2026 (Louis, épopée #4016, lot L6 — renversement daté
 * de #2320.22, `agent_docs/doctrine.md`) : un signal fort fait désormais
 * naître SEUL une ligne « détecté, à revoir » dans le pipe
 * (`pipeline_detections`, shortlist → positionnement, entretien → mission).
 * La ligne n'est PAS le positionnement : le créer reste un clic, et le second
 * appelant de `SubmissionsService.create` est un CONTRÔLEUR
 * (`pipeline-detections.controller.ts`). Le balayeur, lui, n'appelle aucune
 * des trois écritures — c'est ce que la garde ajoute.
 */

const API_SRC = join(__dirname, '..')
const MATCHING_CONTROLLER = join(API_SRC, 'modules', 'consultants', 'matching', 'matching.controller.ts')
const SUBMISSIONS_CONTROLLER = join(API_SRC, 'modules', 'consultants', 'submissions.controller.ts')
const DELIVERY_CONTROLLER = join(API_SRC, 'modules', 'delivery', 'delivery.controller.ts')
const PROJECTS_CONTROLLER = join(API_SRC, 'modules', 'projects', 'projects.controller.ts')
const DETECTIONS_CONTROLLER = join(API_SRC, 'modules', 'pipeline-detections', 'pipeline-detections.controller.ts')

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

function productionFiles(): string[] {
  return walk(API_SRC).filter(file => !file.endsWith('.spec.ts') && !file.includes('__tests__'))
}

function callersOf(needle: RegExp): string[] {
  return productionFiles().filter(file => needle.test(stripComments(readFileSync(file, 'utf8'))))
}

describe('#2320.22 — la chaîne interne ne transitionne jamais seule', () => {
  it('lit un corpus réel', () => {
    expect(productionFiles().length).toBeGreaterThan(200)
  })

  it('ShortlistService.create n’a qu’un appelant, le contrôleur de matching', () => {
    // `shortlist.service.ts` porte lui-même un champ `shortlists` (le
    // Repository TypeORM) : `this.shortlists.create(...)` y désigne
    // `Repository.create` (construction en mémoire, rien de persisté), pas
    // `ShortlistService.create`. On l'exclut du balayage pour ne pas confondre
    // les deux appels homonymes.
    const SHORTLIST_SERVICE = join(API_SRC, 'modules', 'consultants', 'matching', 'shortlist.service.ts')
    const callers = callersOf(/this\.shortlists\.create\s*\(/).filter(file => file !== SHORTLIST_SERVICE)
    expect(callers.sort()).toEqual([MATCHING_CONTROLLER])
  })

  it('SubmissionsService.create n’a QUE ses deux appelants-contrôleurs connus', () => {
    expect(callersOf(/(?:this\.submissions|this\.submissionsService)\.create\s*\(/).sort()).toEqual(
      [MATCHING_CONTROLLER, SUBMISSIONS_CONTROLLER, DETECTIONS_CONTROLLER].sort(),
    )
  })

  it('DeliveryService.create n’a QUE ses deux appelants-contrôleurs connus', () => {
    expect(callersOf(/this\.delivery\.create\s*\(/).sort()).toEqual([DELIVERY_CONTROLLER, PROJECTS_CONTROLLER].sort())
  })

  it('#4016 L6 — le balayeur du pipe « détecté » n’écrit ni shortlist, ni positionnement, ni mission', () => {
    for (const name of ['pipeline-detections.sweeper.ts', 'pipeline-detections.service.ts']) {
      const code = stripComments(readFileSync(join(API_SRC, 'modules', 'pipeline-detections', name), 'utf8'))
      expect(code.length).toBeGreaterThan(500)
      expect(code).not.toMatch(/\.(shortlists|submissions|submissionsService|delivery)\.create\s*\(/)
      expect(code).not.toMatch(/INSERT INTO (submissions|missions|shortlists)/)
    }
  })

  it('SAIT DIRE NON — un INSERT de positionnement dans le balayeur serait attrapé', () => {
    expect('INSERT INTO submissions (workspace_id) VALUES ($1)').toMatch(
      /INSERT INTO (submissions|missions|shortlists)/,
    )
  })

  it('la fonction de scoring déterministe (consultant-matching.ts) n’appelle elle-même aucune écriture', () => {
    const matchingCore = join(API_SRC, 'modules', 'consultants', 'consultant-matching.ts')
    const code = stripComments(readFileSync(matchingCore, 'utf8'))
    expect(code).not.toMatch(/\.(save|insert|create)\s*\(/)
  })

  it('témoin — la lecture des besoins ouverts (openNeeds.list) a plusieurs appelants légitimes', () => {
    expect(callersOf(/this\.openNeeds\.list\s*\(/).length).toBeGreaterThan(1)
  })
})
