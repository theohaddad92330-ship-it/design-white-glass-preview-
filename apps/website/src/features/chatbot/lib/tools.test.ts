import { describe, expect, it } from 'vitest'
import {
  emailAppearsInVisitorMessages,
  isPersonalEmail,
  parseHumanContact,
  parseUpdateLead,
  TOOL_DEFINITIONS,
} from './tools'

describe('liste blanche d’outils', () => {
  it('n’expose que des outils d’écriture bornés — aucun outil générique', () => {
    const names = TOOL_DEFINITIONS.map(tool => tool.name).sort()
    expect(names).toEqual(['request_human_contact', 'update_lead'])
  })

  it('ferme chaque schéma — un champ non prévu n’atteint jamais le serveur', () => {
    for (const tool of TOOL_DEFINITIONS) {
      expect(tool.strict).toBe(true)
      expect(tool.input_schema.additionalProperties).toBe(false)
    }
  })

  it('déclare ses champs facultatifs en anyOf, la seule forme documentée en mode strict', () => {
    // Un tableau de types marcherait probablement, et se casserait un jour en
    // production avec pour seul symptôme un chatbot muet.
    const properties = TOOL_DEFINITIONS[0].input_schema.properties as Record<string, Record<string, unknown>>
    for (const [name, schema] of Object.entries(properties)) {
      expect(Array.isArray(schema.type), `${name} ne doit pas utiliser un tableau de types`).toBe(false)
      expect(schema.anyOf, `${name} doit être facultatif`).toBeDefined()
    }
  })
})

describe('update_lead — ce que le serveur accepte', () => {
  const said = ['Bonjour, je suis DG d’une ESN de 10 commerciaux. Mon mail : Paul@Acme-it.fr']

  it('retient les valeurs de l’énumération', () => {
    const result = parseUpdateLead(
      {
        companyType: 'esn',
        persona: 'founder',
        teamSize: '6-15',
        trigger: 'funded_project',
        decision: 'decider',
        horizon: 'this_quarter',
        tooling: 'generic_crm',
        firstName: 'Paul',
        addressForm: 'vous',
        pain: 'trouver les bons décideurs',
      },
      said,
    )
    expect(result.state).toEqual({
      companyType: 'esn',
      persona: 'founder',
      teamSize: '6-15',
      trigger: 'funded_project',
      decision: 'decider',
      horizon: 'this_quarter',
      tooling: 'generic_crm',
      firstName: 'Paul',
      addressForm: 'vous',
      pain: 'trouver les bons décideurs',
      // Accordé par le CATALOGUE, pas par le modèle : c'est l'axe le mieux
      // payé du barème, et il ne s'auto-attribue pas.
      painFit: 'covered',
    })
  })

  it('n’accorde JAMAIS « covered » au modèle — c’est le catalogue qui tranche', () => {
    // 5 points sur 32 : un modèle qui se les attribue transforme la grille en
    // générateur de faux leads chauds.
    const result = parseUpdateLead({ pain: 'facturation comptable', painFit: 'covered' }, said)
    expect(result.state.painFit).toBe('adjacent')
    expect(result.rejected.join(' ')).toContain('adjacent')
  })

  it('refuse de qualifier un besoin qui n’a pas été nommé', () => {
    const result = parseUpdateLead({ painFit: 'covered' }, said)
    expect(result.state.painFit).toBeUndefined()
    expect(result.rejected).toHaveLength(1)
  })

  it('rend « covered » dès que le besoin est au catalogue, même si le modèle minimise', () => {
    const result = parseUpdateLead({ pain: 'Trouver les bons décideurs', painFit: 'uncovered' }, said)
    expect(result.state.painFit).toBe('covered')
  })

  it('IGNORE une valeur hors énumération sans faire tomber le tour', () => {
    // Un tour de conversation qui échoue parce que le modèle a écrit « CEO »
    // coûte un visiteur ; ignorer le champ n'en coûte aucun.
    const result = parseUpdateLead({ persona: 'CEO', companyType: 'esn' }, said)
    expect(result.state.persona).toBeUndefined()
    expect(result.state.companyType).toBe('esn')
  })

  it('retient une adresse que le visiteur a réellement écrite, casse comprise', () => {
    const result = parseUpdateLead({ email: 'paul@acme-it.fr' }, said)
    expect(result.email).toBe('paul@acme-it.fr')
    expect(result.rejected).toHaveLength(0)
  })

  it('REFUSE une adresse que le visiteur n’a jamais écrite', () => {
    // Le verrou anti-invention : sans lui, l'équipe écrit à un inconnu au nom
    // de BellumAI parce que la conversation parlait d'ACME.
    const result = parseUpdateLead({ email: 'contact@acme-it.fr' }, said)
    expect(result.email).toBeNull()
    expect(result.rejected.join(' ')).toContain("n'a pas été écrite par le visiteur")
  })

  it('refuse une adresse mal formée', () => {
    const result = parseUpdateLead({ email: 'paul[at]acme' }, ['paul[at]acme'])
    expect(result.email).toBeNull()
    expect(result.rejected.join(' ')).toContain('forme valide')
  })

  it('borne le texte libre plutôt que de le refuser', () => {
    const long = 'a'.repeat(400)
    const result = parseUpdateLead({ pain: long }, said)
    expect(result.state.pain).toHaveLength(160)
  })

  it('ne renvoie rien quand l’appel est vide', () => {
    expect(parseUpdateLead({}, said)).toEqual({
      state: {},
      explicitIntent: null,
      email: null,
      company: null,
      rejected: [],
    })
    expect(parseUpdateLead(null, said).state).toEqual({})
  })

  it('remonte une intention explicite, qui prime ensuite sur le score', () => {
    expect(parseUpdateLead({ explicitIntent: 'demo' }, said).explicitIntent).toBe('demo')
    expect(parseUpdateLead({ explicitIntent: 'whatever' }, said).explicitIntent).toBeNull()
  })
})

describe('provenance et nature de l’adresse', () => {
  it('compare sans tenir compte de la casse', () => {
    expect(emailAppearsInVisitorMessages('paul@acme.fr', ['Mon mail est PAUL@ACME.FR'])).toBe(true)
  })

  it('ne se laisse pas convaincre par ce que Laura a écrit', () => {
    expect(emailAppearsInVisitorMessages('paul@acme.fr', [])).toBe(false)
  })

  it('reconnaît une adresse personnelle sans la rejeter', () => {
    expect(isPersonalEmail('paul@gmail.com')).toBe(true)
    expect(isPersonalEmail('paul@acme-it.fr')).toBe(false)
  })
})

describe('request_human_contact', () => {
  it('accepte une raison de la liste avec un résumé', () => {
    expect(parseHumanContact({ reason: 'press', summary: 'Journaliste, demande une interview.' })).toEqual({
      reason: 'press',
      summary: 'Journaliste, demande une interview.',
    })
  })

  it('refuse une raison inventée ou un résumé vide', () => {
    expect(parseHumanContact({ reason: 'urgent', summary: 'x' })).toBeNull()
    expect(parseHumanContact({ reason: 'press', summary: '   ' })).toBeNull()
    expect(parseHumanContact(null)).toBeNull()
  })
})
