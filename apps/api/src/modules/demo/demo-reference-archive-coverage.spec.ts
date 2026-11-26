import { readReferenceArchive, readReferenceDossier } from '@bellum/contracts'
import { DEMO_REFERENCE_ARCHIVE_COVERAGE } from './demo-coverage'
import { DEMO_DOSSIERS } from './demo-dataset'

/** Théo A comptes-fiche-reference.N4 — la couverture démo de l'archive se RECALCULE. */
describe('couverture démo — dossier de référence (archive figée)', () => {
  const archives = DEMO_DOSSIERS.map(dossier => ({
    name: dossier.account.company_name,
    archive: readReferenceArchive(dossier.account.raw_analysis),
  })).filter(entry => entry.archive !== null)

  it('est classée seedée', () => {
    expect(DEMO_REFERENCE_ARCHIVE_COVERAGE.state).toBe('seede')
  })

  it('Groupe BPCE est LE dossier de référence, et le seul', () => {
    expect(archives.map(entry => entry.name)).toEqual(['Groupe BPCE'])
  })

  it('la portée semée est lisible par le vrai contrat et dit qu’aucune revérification en ligne n’a eu lieu', () => {
    expect(archives[0]?.archive).toEqual({
      label: 'Archive du dépôt fourni',
      period_from: '2026-09-30',
      period_to: '2026-10-01',
      scope_note: 'périmètre France',
      verified_online: false,
    })
  })

  it('aucune copie de travail n’est semée : elle naît au clic du visiteur', () => {
    for (const dossier of DEMO_DOSSIERS) {
      expect(dossier.account.raw_analysis).not.toHaveProperty('working_copy_of')
    }
  })

  it('Groupe BPCE porte aussi son dossier de référence (programmes, achats, organisation, TJM, écosystème), lu par le vrai contrat', () => {
    const withDossier = DEMO_DOSSIERS.filter(dossier => readReferenceDossier(dossier.account.raw_analysis) !== null)
    expect(withDossier.map(dossier => dossier.account.company_name)).toEqual(['Groupe BPCE'])
    const bpce = readReferenceDossier(withDossier[0]?.account.raw_analysis)
    expect(bpce?.counts).toEqual({ units: 55, historical_needs: 18, tjm_observations: 16, contacts: 49 })
    expect(bpce?.programmes).toHaveLength(9)
  })
})
