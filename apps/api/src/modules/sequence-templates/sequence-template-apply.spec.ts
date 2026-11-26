import { contactVariableValues, prepareTemplateSteps } from './sequence-template-apply'

const template = {
  name: 'Campagne 1',
  steps: [
    { position: 0, delay_days: 0, subject: 'Bonjour {{firstName}}', body: 'Chez {{companyName}} ?\n{{signature}}' },
    { position: 1, delay_days: 3, subject: 'Relance', body: 'Re {{firstName}}, {{jobTitle}}' },
  ],
}

describe('contactVariableValues (#3756.3)', () => {
  it('sépare prénom et nom d’un nom complet à deux mots ou plus', () => {
    const v = contactVariableValues({ full_name: 'Camille Durand de la Tour', title: 'DSI' }, 'Acme', 'Louis')
    expect(v).toEqual({
      firstName: 'Camille',
      lastName: 'Durand de la Tour',
      companyName: 'Acme',
      signature: 'Louis',
      jobTitle: 'DSI',
    })
  })

  it('un nom en un seul mot ne donne NI prénom NI nom : rien n’est deviné', () => {
    const v = contactVariableValues({ full_name: 'Camille', title: null }, 'Acme', null)
    expect(v.firstName).toBeNull()
    expect(v.lastName).toBeNull()
    expect(v.signature).toBeNull()
    expect(v.jobTitle).toBeNull()
  })
})

describe('prepareTemplateSteps (#3756.2/.3)', () => {
  it('prépare chaque étape : brouillon résolu, délai J+n conservé', () => {
    const values = { firstName: 'Camille', lastName: 'D', companyName: 'Acme 3PL', signature: 'Louis', jobTitle: 'DSI' }
    const out = prepareTemplateSteps(template, values)
    expect(out.blockedSteps).toEqual([])
    expect(out.steps[0]).toEqual({
      kind: 'email',
      offset_days: 0,
      label: 'Campagne 1 — étape 1 (J+0)',
      draft: { subject: 'Bonjour Camille', body: 'Chez Acme 3PL ?\nLouis' },
    })
    expect(out.steps[1]).toMatchObject({ offset_days: 3, draft: { body: 'Re Camille, DSI' } })
  })

  it('une variable manquante bloque l’étape, la nomme, et ne laisse aucun {{…}} dans un brouillon', () => {
    const values = { firstName: null, lastName: null, companyName: 'Acme', signature: 'Louis', jobTitle: 'DSI' }
    const out = prepareTemplateSteps(template, values)
    expect(out.blockedSteps).toEqual([
      {
        position: 0,
        blocked: [{ variable: 'firstName', reason: 'missing', message: 'Prénom manquant : {{firstName}}' }],
      },
      {
        position: 1,
        blocked: [{ variable: 'firstName', reason: 'missing', message: 'Prénom manquant : {{firstName}}' }],
      },
    ])
    for (const step of out.steps) {
      expect(step.draft).toBeUndefined()
      expect(step.blocked_variables).toEqual(['Prénom manquant : {{firstName}}'])
    }
  })

  it('l’objet compte aussi : une variable dans l’objet seul bloque l’étape', () => {
    const out = prepareTemplateSteps(
      { name: 'C', steps: [{ position: 0, delay_days: 0, subject: '{{lastName}}', body: 'ok' }] },
      { firstName: 'A', lastName: null, companyName: 'X', signature: 'S', jobTitle: null },
    )
    expect(out.blockedSteps[0]?.blocked[0]?.variable).toBe('lastName')
  })

  it('une variable inconnue bloque, nommée', () => {
    const out = prepareTemplateSteps(
      { name: 'C', steps: [{ position: 0, delay_days: 0, subject: 's', body: 'Salut {{prenom}}' }] },
      { firstName: 'A', lastName: 'B', companyName: 'X', signature: 'S', jobTitle: null },
    )
    expect(out.steps[0]?.blocked_variables).toEqual(['Variable inconnue : {{prenom}}'])
  })
})
