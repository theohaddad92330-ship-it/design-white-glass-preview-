import { consultantsKnowingSector } from '../consultants/consultant-sector-knowledge'
import { DEMO_CONSULTANTS_KNOW_SECTOR_COVERAGE } from './demo-coverage'
import { DEMO_CONSULTANTS, DEMO_DOSSIERS } from './demo-dataset'

/**
 * #5017.2 (craft rule n°9) — « consultants qui connaissent ce secteur » en démo. Aucune table neuve : on lit le
 * VRAI jeu de données, pas un commentaire qui l'affirme.
 */
describe('#5017.2 — la carte « consultants qui connaissent le secteur » en démonstration', () => {
  it('est classée seedée, avec sa raison', () => {
    expect(DEMO_CONSULTANTS_KNOW_SECTOR_COVERAGE.state).toBe('seede')
    expect(DEMO_CONSULTANTS_KNOW_SECTOR_COVERAGE.reason).toContain('#5017.2')
  })

  it('au moins un compte de la salle a un secteur que le CV d’un consultant cite', () => {
    const rows = DEMO_CONSULTANTS.map((c, i) => ({
      id: String(i),
      full_name: c.full_name,
      sectors: c.sectors,
      archived_at: null,
    }))
    const covered = DEMO_DOSSIERS.filter(
      d => d.account.sector && consultantsKnowingSector(rows, d.account.sector).length > 0,
    )
    expect(covered.length).toBeGreaterThan(0)
  })
})
