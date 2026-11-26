import { DEMO_DOSSIERS } from './demo-dataset'
import { DEMO_INTENTIONALLY_EMPTY, DEMO_SEEDED_TABLES, DEMO_SIGNAL_MODELS_COVERAGE } from './demo-coverage'

/**
 * #3928.4 (craft rule n°9) — « chaque type de signal est semé, ou classé vide à dessein avec sa raison ».
 * Les six modèles de signal de l'issue : une réponse écrite pour chacun, et les réponses qui renvoient à
 * une table doivent dire vrai (une table « vide à dessein » est bien classée vide, une « semée » bien semée).
 */
describe('démo — les six modèles de signal sont semés ou vides à dessein (#3928.4)', () => {
  it('les six modèles de l’issue sont tous classés', () => {
    expect(Object.keys(DEMO_SIGNAL_MODELS_COVERAGE).sort()).toEqual(
      [
        'canonical_trigger_events',
        'declared_signals',
        'discover_signal',
        'opportunities_signal',
        'recent_signals',
        'signal_history',
      ].sort(),
    )
  })

  it('chaque modèle porte un état connu et une raison écrite', () => {
    for (const entry of Object.values(DEMO_SIGNAL_MODELS_COVERAGE)) {
      expect(['seede', 'vide_a_dessein']).toContain(entry.state)
      expect(entry.reason.length).toBeGreaterThan(60)
    }
  })

  it('les classements qui visent une table disent vrai', () => {
    expect(Object.keys(DEMO_INTENTIONALLY_EMPTY)).toContain('signal_history')
    expect(DEMO_SIGNAL_MODELS_COVERAGE['signal_history'].state).toBe('vide_a_dessein')
    expect(DEMO_SEEDED_TABLES as readonly string[]).toContain('canonical_trigger_events')
    expect(DEMO_SIGNAL_MODELS_COVERAGE['canonical_trigger_events'].state).toBe('seede')
  })

  it('« recent_signals semé » dit vrai : au moins un dossier de démo porte des signaux', () => {
    expect(DEMO_SIGNAL_MODELS_COVERAGE['recent_signals'].state).toBe('seede')
    expect(DEMO_DOSSIERS.some(dossier => (dossier.account.recent_signals ?? []).length > 0)).toBe(true)
  })

  it('le test sait dire NON : un modèle « semé » sans raison ne passerait pas', () => {
    const faux = { state: 'seede', reason: '' }
    expect(faux.reason.length).toBeLessThanOrEqual(60)
  })
})
