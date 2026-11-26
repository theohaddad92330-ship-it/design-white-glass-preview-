import { classifyInterlocutor } from './interlocutor'

describe('classifyInterlocutor', () => {
  it('reconnaît un collègue AVANT tout le reste', () => {
    // La faute la plus embarrassante : envoyer une séquence de prospection à
    // quelqu'un de sa propre entreprise.
    const verdict = classifyInterlocutor({
      email: 'marc@monesn.fr',
      ownDomain: 'monesn.fr',
      hasSignedBusiness: true,
      hasApplied: true,
    })
    expect(verdict.kind).toBe('colleague')
    expect(verdict.confidence).toBe(1)
  })

  it('reconnaît un candidat avant un client', () => {
    const verdict = classifyInterlocutor({
      email: 'a@ailleurs.fr',
      ownDomain: 'monesn.fr',
      hasApplied: true,
      hasSignedBusiness: true,
    })
    expect(verdict.kind).toBe('candidate')
  })

  it('reconnaît un consultant du vivier', () => {
    expect(classifyInterlocutor({ email: 'c@indep.fr', isInternalConsultant: true }).kind).toBe('consultant')
  })

  it('fait foi de la relation déclarée dans le CRM', () => {
    expect(classifyInterlocutor({ email: 'a@acme.fr', crmRelationship: 'Client actif' }).kind).toBe('client')
    expect(classifyInterlocutor({ email: 'a@acme.fr', crmRelationship: 'Partenaire' }).kind).toBe('partner')
  })

  it('une affaire signée fait un client', () => {
    expect(classifyInterlocutor({ email: 'a@acme.fr', hasSignedBusiness: true }).kind).toBe('client')
  })

  it('un commercial d’une autre société vend quelque chose', () => {
    const verdict = classifyInterlocutor({ email: 'a@vendeur.fr', title: 'Account Executive' })
    expect(verdict.kind).toBe('supplier')
  })

  it('classe prospect par défaut, mais à FAIBLE confiance et en le disant', () => {
    const verdict = classifyInterlocutor({ email: 'a@inconnu.fr' })
    expect(verdict.kind).toBe('prospect')
    expect(verdict.confidence).toBeLessThan(0.5)
    expect(verdict.reasons[0]).toContain('par défaut')
  })

  it('rend « inconnu » plutôt que de deviner sans e-mail', () => {
    const verdict = classifyInterlocutor({})
    expect(verdict.kind).toBe('unknown')
    expect(verdict.confidence).toBe(0)
  })

  it('est déterministe — deux appels identiques rendent le même verdict', () => {
    const signals = { email: 'a@acme.fr', ownDomain: 'monesn.fr', hasSignedBusiness: true }
    expect(classifyInterlocutor(signals)).toEqual(classifyInterlocutor(signals))
  })
})
