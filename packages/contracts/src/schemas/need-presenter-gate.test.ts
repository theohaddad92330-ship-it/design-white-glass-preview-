import { describe, expect, it } from 'vitest'
import { NEED_PRESENTER_ADVISORY_CRITERIA, needPresenterGate } from './need-presenter-gate.js'

/**
 * #2323.18 / #2323.19-.21 / #2323.22 / #2323.23 — la porte PRÉSENTER, en UN
 * seul endroit — même correction que `need-matcher-gate.ts` pour MATCHER :
 * les cinq critères étaient chacun `déjà là` (destinataire, conditions,
 * budget, accord consultant) ou tranchés séparément (#2323.18 l'accord de
 * type de profil, #2323.22 le processus), mais AUCUNE fonction ne les lisait
 * ensemble — donc rien ne pouvait dire « présentable » ou nommer ce qui
 * manque encore.
 *
 * Aucun des cinq n'est décisif : contrairement à MATCHER (les compétences),
 * l'issue ne nomme aucun NO-GO pour PRÉSENTER — les cinq restent des SIGNAUX,
 * doctrine UNKNOWN ≠ ZERO. Seul l'accord de type de profil REFUSÉ
 * (`not_agreed`) sort du lot : ce n'est pas une absence, c'est une réponse
 * négative reçue du client — nommée à part (`profileTypeDisagreement`),
 * jamais fondue dans les critères manquants.
 */
const complete = {
  contact_id: 'contact-1',
  constraints: 'Présence deux jours par semaine',
  budget_cents: 500_00,
  target_tjm_cents: null,
  presentation_process: 'Un entretien technique, puis un entretien client',
  profile_type_agreement: 'agreed' as const,
  hasConsultantAgreement: true,
}

describe('needPresenterGate', () => {
  it('ne manque rien quand les cinq critères sont renseignés', () => {
    const gate = needPresenterGate(complete)
    expect(gate.missingAdvisory).toEqual([])
    expect(gate.profileTypeDisagreement).toBe(false)
  })

  it('un destinataire absent se signale, sans bloquer', () => {
    const gate = needPresenterGate({ ...complete, contact_id: null })
    expect(gate.missingAdvisory).toEqual(['recipient'])
  })

  it('des conditions absentes se signalent', () => {
    const gate = needPresenterGate({ ...complete, constraints: null })
    expect(gate.missingAdvisory).toEqual(['conditions'])
  })

  it('un budget absent des deux côtés (cible ET plancher) se signale', () => {
    const gate = needPresenterGate({ ...complete, budget_cents: null, target_tjm_cents: null })
    expect(gate.missingAdvisory).toEqual(['budget'])
  })

  it('le plancher seul suffit à satisfaire le critère budget', () => {
    const gate = needPresenterGate({ ...complete, budget_cents: null, target_tjm_cents: 400_00 })
    expect(gate.missingAdvisory).toEqual([])
  })

  it('un processus absent se signale — texte libre, jamais une énumération', () => {
    const gate = needPresenterGate({ ...complete, presentation_process: null })
    expect(gate.missingAdvisory).toEqual(['process'])
  })

  it('aucun positionnement au-delà de l’accord consultant se signale', () => {
    const gate = needPresenterGate({ ...complete, hasConsultantAgreement: false })
    expect(gate.missingAdvisory).toEqual(['consultantAgreement'])
  })

  it('un accord de type de profil UNKNOWN se signale comme un critère manquant — jamais comme un refus', () => {
    const gate = needPresenterGate({ ...complete, profile_type_agreement: 'unknown' })
    expect(gate.missingAdvisory).toEqual(['profileTypeAgreement'])
    expect(gate.profileTypeDisagreement).toBe(false)
  })

  it('un accord de type de profil absent (jamais posé) se lit comme UNKNOWN, pas comme un défaut deviné', () => {
    const gate = needPresenterGate({ ...complete, profile_type_agreement: null })
    expect(gate.missingAdvisory).toEqual(['profileTypeAgreement'])
  })

  it('un accord de type de profil REFUSÉ se nomme à part — ce n’est pas une absence', () => {
    const gate = needPresenterGate({ ...complete, profile_type_agreement: 'not_agreed' })
    expect(gate.missingAdvisory).toEqual([])
    expect(gate.profileTypeDisagreement).toBe(true)
  })

  it('cumule les critères manquants, dans l’ordre du catalogue', () => {
    const gate = needPresenterGate({
      contact_id: null,
      constraints: null,
      budget_cents: null,
      target_tjm_cents: null,
      presentation_process: null,
      profile_type_agreement: 'unknown',
      hasConsultantAgreement: false,
    })
    expect(gate.missingAdvisory).toEqual([...NEED_PRESENTER_ADVISORY_CRITERIA])
  })
})
