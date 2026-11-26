import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_FILE_DE_PISTES_COVERAGE, DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES } from './demo-coverage'
import { DEMO_ACTIVITIES, DEMO_DOSSIERS, DEMO_PIPELINE_DETECTIONS } from './demo-dataset'

/**
 * #4016 L6 (Louis 11/10/2026) — craft rule n°9 : le pipe « détecté, à revoir »
 * se VOIT dans la salle, une ligne par passage.
 */
describe('#4016 L6 — le pipe « détecté, à revoir » est semé en démonstration', () => {
  const seedSource = readFileSync(join(__dirname, 'demo-seed.service.ts'), 'utf8')

  it('`pipeline_detections` est classée SEEDÉE, jamais « vide à dessein »', () => {
    expect(DEMO_SEEDED_TABLES).toContain('pipeline_detections')
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).not.toContain('pipeline_detections')
  })

  it('l’intérêt porte sur un dossier RÉELLEMENT semé', () => {
    expect(DEMO_DOSSIERS.map(d => d.account.company_name)).toContain(DEMO_PIPELINE_DETECTIONS.interest.company)
  })

  it('le semis est appelé, écrit les TROIS passages, et seulement des lignes `detected`', () => {
    expect(seedSource).toContain('await this.seedPipelineDetections(workspaceId)')
    for (const kind of ['interest_to_opportunity', 'shortlist_to_submission', 'interview_to_mission']) {
      expect(seedSource).toContain(`'${kind}'`)
    }
    const method = seedSource.slice(seedSource.indexOf('private async seedPipelineDetections'))
    const body = method.slice(0, method.indexOf('\n  }\n'))
    expect(body).not.toMatch(/'confirmed'/)
    // Le semis ne crée NI l'affaire, NI le positionnement, NI la mission.
    expect(body).not.toMatch(/INSERT INTO (opportunities|submissions|missions)/)
  })

  it('#4016.L6.a — l’intérêt a pour source un VRAI appel semé du dossier, pas un identifiant inventé', () => {
    const method = seedSource.slice(seedSource.indexOf('private async seedPipelineDetections'))
    const body = method.slice(0, method.indexOf('\n  }\n'))
    expect(body).toContain("act.kind = 'call'")
    expect(body).toContain('act.account_id = a.id')
    // Le dossier de l'intérêt porte bien un appel dans le jeu semé.
    const hasCall = DEMO_ACTIVITIES.some(
      a => a.company === DEMO_PIPELINE_DETECTIONS.interest.company && a.kind === 'call',
    )
    expect(hasCall).toBe(true)
  })

  // #4292.5 — la liste a UN nom à l'écran, et la salle dit qu'elle la remplit sous CE nom.
  it('#4292.5 — la « File de pistes » est classée SEEDÉE, sous le nom que porte le panneau', () => {
    expect(DEMO_FILE_DE_PISTES_COVERAGE.state).toBe('seede')
    const fr = JSON.parse(
      readFileSync(join(__dirname, '../../../../web/src/i18n/locales/fr/projects.json'), 'utf8'),
    ) as { detections: { drawerTitle: string } }
    expect(fr.detections.drawerTitle).toBe(DEMO_FILE_DE_PISTES_COVERAGE.name)
    expect(DEMO_FILE_DE_PISTES_COVERAGE.reason).toContain('pipeline_detections')
  })

  it('#4292.5 — contrôle négatif : un autre nom que celui du panneau n’est pas la file', () => {
    expect(DEMO_FILE_DE_PISTES_COVERAGE.name).not.toBe('Pistes à qualifier')
  })
})
