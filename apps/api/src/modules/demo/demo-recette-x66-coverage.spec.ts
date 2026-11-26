import { seatName } from './demo-seat-names'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DEMO_RECETTE_X66_COVERAGE } from './demo-coverage'
import {
  DEMO_DOSSIERS,
  DEMO_OUTREACH_MESSAGES,
  DEMO_PARTNER_RELATIONS,
  DEMO_SUPERVISED_FORFAIT_NEED,
} from './demo-dataset'
import { demoMissionExtraction } from './demo-scripts'

/**
 * Lot X66 (02/10) — les cas de recette prod Y16 que la salle doit rejouer. Cette
 * garde LIT le jeu réel : elle rougit si l'un d'eux disparaît.
 */
const SCRIPT = readFileSync(join(__dirname, '../../../../web/src/features/demo/demo-chat-script.ts'), 'utf8')

describe('couverture démo — restes de la recette Y16 (lot X66)', () => {
  it('#3420 — le message « Notre consultant est disponible dès lundi » est semé sur Directeur technique — entité numérique voyageurs', () => {
    const message = DEMO_OUTREACH_MESSAGES.find(item => item.body.includes('Notre consultant est disponible dès lundi'))
    expect(message?.contact).toBe(seatName('Directeur technique — entité numérique voyageurs'))
    expect(message?.status).toBe('needs_review')
  })

  it('#3270.6 — Société Générale est un compte de la salle, et mc2i a son cadre', () => {
    expect(DEMO_DOSSIERS.map(dossier => dossier.account.company_name)).toContain('Société Générale')
    expect(DEMO_PARTNER_RELATIONS.map(relation => relation.name)).toContain('mc2i')
  })

  it('#3284.20/.21 — Société Générale est écarté avec une revue posée, et les deux amorces existent', () => {
    const sg = DEMO_DOSSIERS.find(dossier => dossier.account.company_name === 'Société Générale')
    expect(sg?.account.sprint).toBe('no_go')
    expect(sg?.account.relationship_memory?.nextReviewAt).toBe('2026-10-15')
    expect(SCRIPT).toContain("id: 'p-next-review'")
    expect(SCRIPT).toContain("id: 'p-reactivation'")
  })

  it('#3547 — le besoin au forfait encadré est dans le jeu, et le document de démo propose le mode', () => {
    expect(DEMO_SUPERVISED_FORFAIT_NEED.client_team_names.length).toBeGreaterThan(0)
    expect(demoMissionExtraction().fields.supervisedForfait.value).toBe('supervised')
  })

  it('classée SEEDÉE, avec sa raison écrite', () => {
    expect(DEMO_RECETTE_X66_COVERAGE.state).toBe('seede')
    expect(DEMO_RECETTE_X66_COVERAGE.reason.length).toBeGreaterThan(200)
  })
})
