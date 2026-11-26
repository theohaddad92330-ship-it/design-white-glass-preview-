import {
  CascadeLedger,
  NOOP_EMAIL_VERIFIER,
  emailPatternCandidates,
  isClientFault,
  readCostCeiling,
  servableFreeEmail,
  providerCost,
  PROVIDER_UNIT_COST,
} from './enrichment-cascade'

/**
 * #4106 — la cascade d'enrichissement a un plafond de coût PAR contact, un
 * journal INTERNE de ses essais, et une étape gratuite en tête dont les
 * candidats ne sont JAMAIS servis tant qu'aucune vérification ne les a prouvés.
 */
describe('CascadeLedger (#4106)', () => {
  it('journalise les essais dans l’ordre, avec leur coût', () => {
    const ledger = new CascadeLedger(100)
    expect(ledger.gate('hunter')).toBe(true)
    ledger.record('hunter', 'miss')
    expect(ledger.gate('lusha')).toBe(true)
    ledger.record('lusha', 'hit')
    expect(ledger.tried.map(t => [t.provider, t.outcome, t.cost])).toEqual([
      ['hunter', 'miss', providerCost('hunter')],
      ['lusha', 'hit', providerCost('lusha')],
    ])
    expect(ledger.spent).toBeCloseTo(providerCost('hunter') + providerCost('lusha'))
  })

  it('plafond : cumul + coût unitaire > plafond ⇒ refus, et plus aucun appel payant ensuite', () => {
    const hunter = providerCost('hunter')
    const lusha = providerCost('lusha')
    const ledger = new CascadeLedger(hunter + lusha - 1)
    expect(ledger.gate('hunter')).toBe(true)
    ledger.record('hunter', 'miss')
    expect(ledger.gate('lusha')).toBe(false)
    // Même un fournisseur moins cher ne passe plus : la cascade s'est arrêtée.
    expect(ledger.gate('hunter')).toBe(false)
    expect(ledger.stopped).toBe('budget')
    expect(ledger.tried.map(t => [t.provider, t.outcome, t.cost])).toEqual([
      ['hunter', 'miss', hunter],
      ['lusha', 'skipped_budget', 0],
    ])
    expect(ledger.spent).toBe(hunter)
  })

  it('une étape gratuite passe toujours, plafond ou non', () => {
    const ledger = new CascadeLedger(0)
    expect(ledger.gate('email_pattern')).toBe(true)
    expect(ledger.gate('hunter')).toBe(false)
  })

  it('un appel en erreur ne coûte rien et la cascade continue (5xx, 429, réseau)', () => {
    const ledger = new CascadeLedger(100)
    ledger.gate('hunter')
    ledger.record('hunter', 'error', { status: 503 })
    ledger.gate('lusha')
    ledger.record('lusha', 'error', { status: 429 })
    ledger.gate('kaspr')
    ledger.record('kaspr', 'error')
    expect(ledger.spent).toBe(0)
    expect(ledger.stopped).toBeNull()
    expect(ledger.gate('fullenrich')).toBe(true)
  })

  it('4xx de notre fait ⇒ arrêt : plus aucun appel payant', () => {
    const ledger = new CascadeLedger(100)
    ledger.gate('hunter')
    ledger.record('hunter', 'error', { status: 401 })
    expect(ledger.stopped).toBe('client_error')
    expect(ledger.gate('lusha')).toBe(false)
  })

  it('classe les statuts : 429 / 5xx / 404 ne sont pas de notre fait, 400-403 si', () => {
    expect([429, 500, 502, 503, 404, 408, undefined].map(isClientFault)).toEqual([
      false,
      false,
      false,
      false,
      false,
      false,
      false,
    ])
    expect([400, 401, 402, 403, 422].map(isClientFault)).toEqual([true, true, true, true, true])
  })

  it('la trace interne porte served_by, tried, plafond et dépense', () => {
    const ledger = new CascadeLedger(50)
    ledger.gate('hunter')
    ledger.record('hunter', 'hit')
    expect(ledger.toTrace('hunter')).toEqual({
      served_by: 'hunter',
      tried: [{ provider: 'hunter', outcome: 'hit', cost: providerCost('hunter') }],
      ceiling: 50,
      spent: providerCost('hunter'),
      stopped: null,
    })
  })
})

describe('PLAFOND absent = aucun plafond ; tarifs par champ (#4106, Louis 13/10)', () => {
  it('sans plafond (null) : aucun skipped_budget, même après des téléphones à 54-59 c', () => {
    const ledger = new CascadeLedger(null)
    for (const provider of ['lusha', 'kaspr', 'fullenrich', 'lusha', 'kaspr']) {
      expect(ledger.gate(provider, ['phone'])).toBe(true)
      ledger.record(provider, 'miss', { fields: ['phone'] })
    }
    expect(ledger.stopped).toBeNull()
    expect(ledger.tried.some(t => t.outcome === 'skipped_budget')).toBe(false)
    expect(ledger.toTrace(null).ceiling).toBeNull()
  })

  it('avec plafond posé : respecté (un téléphone Lusha à 54 c dépasse 50)', () => {
    const ledger = new CascadeLedger(50)
    expect(ledger.gate('lusha', ['phone'])).toBe(false)
    expect(ledger.stopped).toBe('budget')
    expect(ledger.tried).toEqual([{ provider: 'lusha', outcome: 'skipped_budget', cost: 0 }])
    expect(new CascadeLedger(54).gate('lusha', ['phone'])).toBe(true)
  })

  it('tarifs publics du 13/10 séparés par champ ; le journal imputait le champ demandé', () => {
    expect(PROVIDER_UNIT_COST).toMatchObject({
      dropcontact: { email: 5.8 },
      hunter: { email: 2.5 },
      lusha: { email: 11, phone: 54 },
      kaspr: { email: 0, phone: 59 },
      fullenrich: { email: 5.5, phone: 55 },
    })
    expect(providerCost('hunter', ['phone'])).toBe(0)
    const ledger = new CascadeLedger(null)
    ledger.record('lusha', 'hit', { fields: ['phone'] })
    ledger.record('lusha', 'hit', { fields: ['email'] })
    ledger.record('fullenrich', 'hit', { fields: ['email', 'phone'] })
    expect(ledger.tried.map(t => t.cost)).toEqual([54, 11, 60.5])
  })
})

describe('readCostCeiling (#4106)', () => {
  const OLD = process.env['ENRICHMENT_COST_CEILING_CENTS']
  afterEach(() => {
    if (OLD === undefined) delete process.env['ENRICHMENT_COST_CEILING_CENTS']
    else process.env['ENRICHMENT_COST_CEILING_CENTS'] = OLD
  })

  it('aucun plafond sans variable (Louis 13/10), valeur lue sinon, illisible ⇒ aucun plafond', () => {
    delete process.env['ENRICHMENT_COST_CEILING_CENTS']
    expect(readCostCeiling()).toBeNull()
    process.env['ENRICHMENT_COST_CEILING_CENTS'] = '35'
    expect(readCostCeiling()).toBe(35)
    process.env['ENRICHMENT_COST_CEILING_CENTS'] = 'abc'
    expect(readCostCeiling()).toBeNull()
    process.env['ENRICHMENT_COST_CEILING_CENTS'] = '-3'
    expect(readCostCeiling()).toBeNull()
  })
})

describe('étape gratuite : patterns d’e-mail (#4106)', () => {
  it('génère des CANDIDATS sur le domaine, sans accent ni ponctuation', () => {
    const candidates = emailPatternCandidates({
      firstName: 'Élodie',
      lastName: "D'Arcy",
      domain: 'https://www.Acme.fr/',
    })
    expect(candidates).toEqual(
      expect.arrayContaining(['elodie.darcy@acme.fr', 'e.darcy@acme.fr', 'elodie@acme.fr', 'edarcy@acme.fr']),
    )
    expect(new Set(candidates).size).toBe(candidates.length)
    expect(candidates.every(c => c.endsWith('@acme.fr'))).toBe(true)
  })

  it('sans domaine ou sans nom : aucun candidat', () => {
    expect(emailPatternCandidates({ firstName: 'Sofia', lastName: 'Nardi' })).toEqual([])
    expect(emailPatternCandidates({ firstName: 'Sofia', domain: 'acme.com' })).toEqual([])
    expect(emailPatternCandidates({ firstName: 'Sofia', lastName: 'Nardi', domain: 'pas-un-domaine' })).toEqual([])
  })

  it('un candidat NON VÉRIFIÉ n’est jamais servi (vérificateur no-op de #4107)', async () => {
    const candidates = emailPatternCandidates({ firstName: 'Sofia', lastName: 'Nardi', domain: 'acme.com' })
    expect(candidates.length).toBeGreaterThan(0)
    const verdict = await servableFreeEmail(candidates, NOOP_EMAIL_VERIFIER)
    expect(verdict.email).toBeNull()
    expect(verdict.candidates).toBe(candidates.length)
  })

  it('seul un verdict « valid » sert le candidat (le jour où #4107 se branche)', async () => {
    const verifier = { verify: jest.fn(async (e: string) => (e === 'sofia.nardi@acme.com' ? 'valid' : 'invalid')) }
    const verdict = await servableFreeEmail(['s.nardi@acme.com', 'sofia.nardi@acme.com'], verifier as never)
    expect(verdict.email).toBe('sofia.nardi@acme.com')
  })

  it('un vérificateur qui plante ne sert rien', async () => {
    const verifier = {
      verify: jest.fn(async () => {
        throw new Error('smtp down')
      }),
    }
    expect((await servableFreeEmail(['a@acme.com'], verifier as never)).email).toBeNull()
  })
})

describe('smtp_check dans la cascade (#4107 × décision Louis 13/10)', () => {
  it('la vérification SMTP est gratuite : coût 0 au journal, sans plafond posé ni plafond à 0', () => {
    expect(providerCost('smtp_check')).toBe(0)
    for (const ceiling of [null, 0]) {
      const ledger = new CascadeLedger(ceiling)
      expect(ledger.gate('smtp_check')).toBe(true)
      ledger.record('smtp_check', 'hit')
      expect(ledger.tried).toEqual([expect.objectContaining({ provider: 'smtp_check', outcome: 'hit', cost: 0 })])
      expect(ledger.spent).toBe(0)
      expect(ledger.stopped).toBeNull()
    }
  })
})
