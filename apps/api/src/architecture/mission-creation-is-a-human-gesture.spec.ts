import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * #2320.3 — UN ENTRETIEN POSITIF NE DEVIENT JAMAIS UNE MISSION TOUT SEUL.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * LA RÈGLE QUE CETTE GARDE PROTÈGE (elle ne l'invente pas)
 * ─────────────────────────────────────────────────────────────────────────────
 * Le défaut nommé par #2320.3 (épopée #2967) : rien n'empêche EN CODE qu'une
 * décision positive (`submissions.closed_at` + `outcome_reason`) déclenche
 * automatiquement la création d'une mission — seule l'absence de code le
 * garantissait jusqu'ici, pas une garde qui le prouve et qui casse si quelqu'un
 * l'ajoute. Même motif que `project-creation-is-a-human-gesture.spec.ts`
 * (#2195.33) : une affaire ne s'ouvre pas seule, une mission ne se crée pas
 * seule non plus.
 *
 * `DeliveryService.create` a aujourd'hui DEUX appelants légitimes (et non un
 * seul comme `createForWorkspace`) : `DeliveryController` (`POST
 * /delivery/missions`) et `ProjectsController` (conversion d'une affaire
 * gagnée). Les deux sont des routes HTTP derrière un contrôleur — un clic, pas
 * une routine. Un troisième appelant (planificateur, webhook d'entretien,
 * outil du copilote) romprait cette garantie.
 */

const API_SRC = join(__dirname, '..')
const DELIVERY_CONTROLLER = join(API_SRC, 'modules', 'delivery', 'delivery.controller.ts')
const PROJECTS_CONTROLLER = join(API_SRC, 'modules', 'projects', 'projects.controller.ts')

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

describe('#2320.3 — un entretien positif ne devient jamais une mission tout seul', () => {
  it('lit un corpus réel', () => {
    expect(productionFiles().length).toBeGreaterThan(200)
  })

  it('DeliveryService.create n’a QUE ses deux appelants connus, tous deux des contrôleurs', () => {
    const callers = callersOf(/this\.delivery\.create\s*\(/)
    expect(callers.sort()).toEqual([DELIVERY_CONTROLLER, PROJECTS_CONTROLLER].sort())
  })

  it('témoin — un entretien conclu positivement (submissions.closed_at) n’appelle jamais delivery.create directement', () => {
    // Le seul chemin vers une mission passe par les deux contrôleurs ci-dessus,
    // jamais par le service submissions qui écrit closed_at/outcome_reason.
    const submissionsService = join(API_SRC, 'modules', 'consultants', 'submissions.service.ts')
    const code = stripComments(readFileSync(submissionsService, 'utf8'))
    expect(code).not.toMatch(/delivery\.create\s*\(/)
  })

  it('#4016 L6 — la ligne « entretien → mission » se DÉTECTE seule, mais sa confirmation ne crée aucune mission', () => {
    // Renversement daté du 11/10/2026 (Louis, épopée #4016, lot L6) : un
    // entretien positif fait naître seul une ligne « détecté, à revoir » dans
    // le pipe. #2320.3 tient toujours sur la MISSION : ni le balayeur, ni le
    // service, ni même le contrôleur de confirmation n'appelle delivery.create —
    // la mission exige l'accord client ET consultant (#2320.21).
    for (const name of [
      'pipeline-detections.sweeper.ts',
      'pipeline-detections.service.ts',
      'pipeline-detections.controller.ts',
    ]) {
      const code = stripComments(readFileSync(join(API_SRC, 'modules', 'pipeline-detections', name), 'utf8'))
      expect(code.length).toBeGreaterThan(500)
      expect(code).not.toMatch(/\.delivery\.create\s*\(/)
      expect(code).not.toMatch(/INSERT INTO missions/)
    }
  })

  it('témoin — le balayage attrape vraiment quelque chose (delivery.list a plusieurs appelants légitimes)', () => {
    expect(callersOf(/this\.delivery\.list\s*\(/).length).toBeGreaterThan(0)
  })
})
