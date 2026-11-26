import { presentationReadiness } from './presentation-readiness'

const OK_INPUT = {
  consultantAgreement: true as boolean | null,
  cvVersionStatus: 'validated' as string | null,
  accountName: 'EDF DSI' as string | null,
  needStatus: 'shortlist_ready' as string | null,
  needRole: 'Data Engineer' as string | null,
  recipientContactId: '11111111-1111-4111-8111-111111111111' as string | null,
  consultantRestrictions: null as string | null,
}

describe('presentationReadiness', () => {
  it('tout au vert quand les six points sont réunis', () => {
    const readiness = presentationReadiness(OK_INPUT)
    expect(readiness.blocked).toBe(false)
    expect(readiness.checks.every(check => check.level === 'ok')).toBe(true)
  })

  it('un refus EXPLICITE du consultant bloque — le seul cas qui refuse', () => {
    const readiness = presentationReadiness({ ...OK_INPUT, consultantAgreement: false })
    expect(readiness.blocked).toBe(true)
    expect(readiness.checks.find(c => c.level === 'blocking')?.label).toContain('refusé')
  })

  it('un accord jamais déclaré avertit, sans bloquer', () => {
    const readiness = presentationReadiness({ ...OK_INPUT, consultantAgreement: null })
    expect(readiness.blocked).toBe(false)
    expect(readiness.checks.some(c => c.level === 'warning' && c.label.includes('accord'))).toBe(true)
  })

  it('un CV non validé avertit sans bloquer, et nomme le statut', () => {
    const readiness = presentationReadiness({ ...OK_INPUT, cvVersionStatus: 'pending_validation' })
    expect(readiness.blocked).toBe(false)
    expect(readiness.checks.some(c => c.level === 'warning' && c.label.includes('pending_validation'))).toBe(true)
  })

  it('aucune version de CV retrouvée avertit', () => {
    const readiness = presentationReadiness({ ...OK_INPUT, cvVersionStatus: null })
    expect(readiness.checks.some(c => c.level === 'warning' && c.label.includes('CV'))).toBe(true)
  })

  it('un besoin clôturé avertit', () => {
    const readiness = presentationReadiness({ ...OK_INPUT, needStatus: 'lost' })
    expect(readiness.checks.some(c => c.level === 'warning' && c.label.includes('clôturé'))).toBe(true)
  })

  it('aucun destinataire choisi avertit', () => {
    const readiness = presentationReadiness({ ...OK_INPUT, recipientContactId: null })
    expect(readiness.checks.some(c => c.level === 'warning' && c.label.includes('destinataire'))).toBe(true)
  })

  it('une restriction déclarée par le consultant est NOMMÉE, pas juste signalée', () => {
    const readiness = presentationReadiness({
      ...OK_INPUT,
      consultantRestrictions: 'Pas de mission chez un concurrent',
    })
    expect(
      readiness.checks.some(c => c.level === 'warning' && c.label.includes('Pas de mission chez un concurrent')),
    ).toBe(true)
  })
})
