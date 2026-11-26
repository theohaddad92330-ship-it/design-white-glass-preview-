import { resolveDealAccount, type DealAccountCandidate } from './crm-deal-account-link'

const ACCOUNTS: DealAccountCandidate[] = [
  { id: 'acc-sopra', company_name: 'Sopra Steria', siren: '326820065', website: 'https://www.soprasteria.com' },
  { id: 'acc-axa', company_name: 'AXA', siren: '572093920', website: 'axa.fr' },
]

describe('#3918.a — resolveDealAccount (deal CRM → compte, jamais par nom seul)', () => {
  it("joint d'abord par l'id société du fournisseur (sync_links)", () => {
    const link = resolveDealAccount(
      { company_external_id: 'hs-42', company_siren: null, company_domain: null },
      { companyLinks: new Map([['hs-42', 'acc-axa']]), accounts: ACCOUNTS },
    )
    expect(link).toEqual({ accountId: 'acc-axa', basis: 'crm_company_id' })
  })

  it("l'id société prime sur un SIREN ou un domaine qui désigneraient un autre compte", () => {
    const link = resolveDealAccount(
      { company_external_id: 'hs-42', company_siren: '326820065', company_domain: 'soprasteria.com' },
      { companyLinks: new Map([['hs-42', 'acc-axa']]), accounts: ACCOUNTS },
    )
    expect(link?.accountId).toBe('acc-axa')
  })

  it('à défaut, joint par SIREN (espaces tolérés)', () => {
    const link = resolveDealAccount(
      { company_external_id: 'hs-unknown', company_siren: '326 820 065', company_domain: null },
      { companyLinks: new Map(), accounts: ACCOUNTS },
    )
    expect(link).toEqual({ accountId: 'acc-sopra', basis: 'siren' })
  })

  it('à défaut, joint par domaine (www. et casse ignorés)', () => {
    const link = resolveDealAccount(
      { company_external_id: null, company_siren: null, company_domain: 'WWW.AXA.FR' },
      { companyLinks: new Map(), accounts: ACCOUNTS },
    )
    expect(link).toEqual({ accountId: 'acc-axa', basis: 'domain' })
  })

  it('HOMONYME — même nom, autre société (autre SIREN, autre domaine) : AUCUN rattachement', () => {
    // Le deal s'appelle « Sopra Steria » chez le fournisseur, mais sa société
    // porte un autre SIREN et un autre domaine : le nom ne joint JAMAIS.
    const link = resolveDealAccount(
      {
        name: 'Sopra Steria — TMA 2026',
        company_name: 'Sopra Steria',
        company_external_id: 'hs-99',
        company_siren: '999999999',
        company_domain: 'sopra-steria-homonyme.example',
      },
      { companyLinks: new Map(), accounts: ACCOUNTS },
    )
    expect(link).toBeNull()
  })

  it('sans aucune clé (ni id, ni SIREN, ni domaine) : aucun rattachement, même si le nom est identique', () => {
    const link = resolveDealAccount(
      { company_name: 'AXA', company_external_id: null, company_siren: null, company_domain: null },
      { companyLinks: new Map(), accounts: ACCOUNTS },
    )
    expect(link).toBeNull()
  })

  it('deux comptes du même espace pour le même SIREN : ambigu, aucun rattachement', () => {
    const link = resolveDealAccount(
      { company_external_id: null, company_siren: '572093920', company_domain: null },
      {
        companyLinks: new Map(),
        accounts: [...ACCOUNTS, { id: 'acc-axa-bis', company_name: 'AXA France', siren: '572093920', website: null }],
      },
    )
    expect(link).toBeNull()
  })

  it("un SIREN mal formé n'est jamais une clé", () => {
    const link = resolveDealAccount(
      { company_external_id: null, company_siren: '12', company_domain: null },
      { companyLinks: new Map(), accounts: [{ id: 'x', company_name: 'X', siren: '12', website: null }] },
    )
    expect(link).toBeNull()
  })
})

// Lot 762 P5 (Louis 31/10) — dernier recours : le NOM normalisé de la société CRM, univoque ou rien.
describe('lot 762 P5 — resolveDealAccount par nom normalisé (univoque seulement)', () => {
  const noKeys = { company_external_id: null, company_siren: null, company_domain: null }
  const context = (accounts: Parameters<typeof resolveDealAccount>[1]['accounts']) => ({
    companyLinks: new Map<string, string>(),
    accounts,
  })

  it('sans id, SIREN ni domaine : rattache par le nom normalisé (casse, accents, ponctuation)', () => {
    const link = resolveDealAccount(
      { ...noKeys, company_label: '  SOPRA  steria. ' },
      context([{ id: 'acc-sopra', company_name: 'Sopra Steria', siren: null, website: null }]),
    )
    expect(link).toEqual({ accountId: 'acc-sopra', basis: 'name' })
  })

  it('NON — nom AMBIGU (deux comptes du même nom dans l’espace) : aucun rattachement', () => {
    const link = resolveDealAccount(
      { ...noKeys, company_label: 'Acme' },
      context([
        { id: 'a1', company_name: 'Acme', siren: null, website: null },
        { id: 'a2', company_name: 'ACME', siren: null, website: null },
      ]),
    )
    expect(link).toBeNull()
  })

  it('NON — aucun compte du nom, ou nom trop court, ou nom absent : aucun rattachement (rien deviné)', () => {
    const accounts = [{ id: 'a1', company_name: 'Acme', siren: null, website: null }]
    expect(resolveDealAccount({ ...noKeys, company_label: 'Globex' }, context(accounts))).toBeNull()
    expect(
      resolveDealAccount({ ...noKeys, company_label: 'ac' }, context([{ ...accounts[0]!, company_name: 'ac' }])),
    ).toBeNull()
    expect(resolveDealAccount({ ...noKeys }, context(accounts))).toBeNull()
  })

  it('NON — pas de suffixe retiré ni de sigle deviné : « Acme France » n’est pas « Acme »', () => {
    const link = resolveDealAccount(
      { ...noKeys, company_label: 'Acme France' },
      context([{ id: 'a1', company_name: 'Acme', siren: null, website: null }]),
    )
    expect(link).toBeNull()
  })

  it('les trois clés l’emportent TOUJOURS sur le nom', () => {
    const link = resolveDealAccount(
      { ...noKeys, company_siren: '326820065', company_label: 'Acme' },
      context([
        { id: 'a-siren', company_name: 'Autre', siren: '326820065', website: null },
        { id: 'a-name', company_name: 'Acme', siren: null, website: null },
      ]),
    )
    expect(link).toEqual({ accountId: 'a-siren', basis: 'siren' })
  })
})
