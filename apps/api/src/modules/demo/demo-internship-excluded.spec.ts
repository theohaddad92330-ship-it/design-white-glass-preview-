import { readRecentSignals, withoutInternshipSignals } from '@bellum/contracts'
import { DEMO_DOSSIERS } from './demo-dataset'

/**
 * #4044 (Louis 12/10) — « pas d'offres de stages dans tous les signaux ». Le jeu démo porte UNE offre de
 * stage SEMÉE À DESSEIN sur SNCF : elle est dans le stockage (on n'efface rien), mais aucun lecteur ne la sert.
 */
const STAGE = 'CS27 - Bac 5 - Stage Supply Chain H/F'
const sncf = () => {
  const dossier = DEMO_DOSSIERS.find(d => d.account.company_name.startsWith('SNCF'))
  if (!dossier) throw new Error('le dossier SNCF a disparu du jeu démo')
  return dossier
}

describe('#4044 — l’offre de stage semée en démo n’apparaît nulle part', () => {
  it('est bien STOCKÉE (sinon le test ne prouverait rien)', () => {
    const stored = JSON.stringify(sncf().account)
    expect(stored).toContain(STAGE)
  })

  it('le lecteur unique des signaux ne la rend pas, mais rend les autres offres', () => {
    const labels = readRecentSignals(sncf().account.recent_signals).map(signal => signal.label)
    expect(labels.some(label => label.includes('Stage'))).toBe(false)
    expect(labels).toContain('Data engineer — plateforme data voyageurs (H/F)')
  })

  it('le dossier servi ne porte plus le stage, ni dans recent_signals ni dans la liste des offres', () => {
    const served = withoutInternshipSignals(sncf().account as { recent_signals: unknown; raw_analysis: unknown })
    expect(JSON.stringify(served)).not.toContain(STAGE)
  })
})
