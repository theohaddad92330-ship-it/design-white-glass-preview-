import { describe, expect, it } from 'vitest'
import {
  researchInputSchema,
  contactsInputSchema,
  apolloContactProfileSchema,
  enrichContactInputSchema,
  enrichContactResponseSchema,
  planInputSchema,
  personNameSourceFamilySchema,
  searchPeopleByNameInputSchema,
  searchPeopleByNameResultSchema,
} from './ia.js'
import { supplierNamesIn } from './tool-naming.js'

const VALID_UUID_A = '550e8400-e29b-41d4-a716-446655440000'
const VALID_UUID_B = '550e8400-e29b-41d4-a716-446655440001'

describe('researchInputSchema', () => {
  it('accepts a valid payload', () => {
    const result = researchInputSchema.parse({
      companyName: 'Acme',
      profileData: { size: 'mid-market' },
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
    })
    expect(result.companyName).toBe('Acme')
  })

  it('rejects empty companyName', () => {
    expect(() =>
      researchInputSchema.parse({
        companyName: '',
        profileData: {},
        accountId: VALID_UUID_A,
        userId: VALID_UUID_B,
      }),
    ).toThrow()
  })

  it('rejects non-UUID accountId', () => {
    expect(() =>
      researchInputSchema.parse({
        companyName: 'Acme',
        profileData: {},
        accountId: 'not-a-uuid',
        userId: VALID_UUID_B,
      }),
    ).toThrow()
  })

  it('accepts optional userContext', () => {
    const result = researchInputSchema.parse({
      companyName: 'Acme',
      profileData: {},
      userContext: 'we sell cloud migration services',
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
    })
    expect(result.userContext).toBe('we sell cloud migration services')
  })

  // #1631.3/.4 (lot 14) — l'axe CHEMIN : le compte de parcours et l'ESN
  // dominante sont optionnels, et absents ils ne changent rien au payload.
  it('accepts the optional market path axis fields', () => {
    const result = researchInputSchema.parse({
      companyName: 'Acme',
      profileData: {},
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
      marketPathsObserved: 5,
      marketTopEsn: 'ALTEN',
    })
    expect(result.marketPathsObserved).toBe(5)
    expect(result.marketTopEsn).toBe('ALTEN')
  })

  it('omits the market path axis fields when absent — byte-identical payload', () => {
    const result = researchInputSchema.parse({
      companyName: 'Acme',
      profileData: {},
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
    })
    expect(result.marketPathsObserved).toBeUndefined()
    expect(result.marketTopEsn).toBeUndefined()
  })

  // #4070.1/.4 — les faits du compte et l'analyse précédente voyagent aussi sur le
  // chemin « Actualiser » (research seule), pas seulement le graphe complet.
  it('accepts the optional account facts and previous analysis trace', () => {
    const result = researchInputSchema.parse({
      companyName: 'Acme',
      profileData: {},
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
      accountFacts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }],
      previousAnalysis: 'Analyse du 2026-06-18',
    })
    expect(result.accountFacts).toEqual([{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }])
    expect(result.previousAnalysis).toBe('Analyse du 2026-06-18')
  })

  it('omits the account facts and previous analysis fields when absent', () => {
    const result = researchInputSchema.parse({
      companyName: 'Acme',
      profileData: {},
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
    })
    expect(result.accountFacts).toBeUndefined()
    expect(result.previousAnalysis).toBeUndefined()
  })
})

describe('contactsInputSchema', () => {
  it('accepts a valid payload', () => {
    const result = contactsInputSchema.parse({
      companyName: 'Acme',
      profileData: {},
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
    })
    expect(result.companyName).toBe('Acme')
  })
})

describe('enrichContactInputSchema', () => {
  it('rejects empty or missing required fields (firstName + organizationName)', () => {
    expect(() => enrichContactInputSchema.parse({ firstName: '', lastName: 'Doe', organizationName: 'Acme' })).toThrow()
    // Present-but-empty lastName is still invalid (min(1)) even though lastName is optional.
    expect(() =>
      enrichContactInputSchema.parse({ firstName: 'John', lastName: '', organizationName: 'Acme' }),
    ).toThrow()
    expect(() => enrichContactInputSchema.parse({ firstName: 'John', lastName: 'Doe', organizationName: '' })).toThrow()
    // firstName alone (no org, no linkedin) is not a sufficient match key.
    expect(() => enrichContactInputSchema.parse({ firstName: 'Beshara' })).toThrow()
  })

  it('accepts firstName + organizationName without a lastName (mononym)', () => {
    expect(() => enrichContactInputSchema.parse({ firstName: 'Beshara', organizationName: 'Acme' })).not.toThrow()
  })

  it('accepts a linkedinUrl alone as the match key', () => {
    expect(() => enrichContactInputSchema.parse({ linkedinUrl: 'https://linkedin.com/in/beshara' })).not.toThrow()
  })

  it('accepts an apolloId alone as the strongest match key', () => {
    expect(() => enrichContactInputSchema.parse({ apolloId: '5f3b2a1c9d' })).not.toThrow()
  })

  it('accepts an organization anchor + title (no name) — the role People-Search fallback', () => {
    expect(() =>
      enrichContactInputSchema.parse({ organizationName: 'Qonto', title: 'Directeur des Achats' }),
    ).not.toThrow()
    // A domain/id anchor is enough on its own with a title.
    expect(() => enrichContactInputSchema.parse({ organizationDomain: 'qonto.com', title: 'CTO' })).not.toThrow()
  })

  it('still rejects a title with no organization anchor', () => {
    expect(() => enrichContactInputSchema.parse({ title: 'CTO' })).toThrow()
  })
})

describe('enrichContactResponseSchema', () => {
  // The strict Apollo enrichment shape: `data` is required and every field
  // must be present (nullable but not omittable). This base is a complete
  // "no match" response with all fields null except the required boolean.
  const VALID_DATA = {
    matched: false,
    email: null,
    email_status: null,
    phone: null,
    linkedin_url: null,
    title: null,
    organization_name: null,
    city: null,
    country: null,
  }

  it('rejects an empty response (data is required and strict)', () => {
    expect(() => enrichContactResponseSchema.parse({})).toThrow()
    expect(() => enrichContactResponseSchema.parse({ data: {} })).toThrow()
  })

  it('accepts a fully-populated valid data object', () => {
    expect(enrichContactResponseSchema.parse({ data: VALID_DATA })).toEqual({ data: VALID_DATA })
  })

  it('validates email format when present', () => {
    expect(() => enrichContactResponseSchema.parse({ data: { ...VALID_DATA, email: 'not-an-email' } })).toThrow()
    expect(enrichContactResponseSchema.parse({ data: { ...VALID_DATA, email: 'john@doe.com' } })).toEqual({
      data: { ...VALID_DATA, email: 'john@doe.com' },
    })
  })

  it('validates linkedin_url format when present', () => {
    expect(() => enrichContactResponseSchema.parse({ data: { ...VALID_DATA, linkedin_url: 'nope' } })).toThrow()
    expect(
      enrichContactResponseSchema.parse({ data: { ...VALID_DATA, linkedin_url: 'https://linkedin.com/in/jdoe' } }),
    ).toEqual({
      data: { ...VALID_DATA, linkedin_url: 'https://linkedin.com/in/jdoe' },
    })
  })

  it('validates email_status against the Apollo enum', () => {
    expect(() => enrichContactResponseSchema.parse({ data: { ...VALID_DATA, email_status: 'bogus' } })).toThrow()
    expect(
      enrichContactResponseSchema.parse({ data: { ...VALID_DATA, matched: true, email_status: 'verified' } }),
    ).toEqual({
      data: { ...VALID_DATA, matched: true, email_status: 'verified' },
    })
  })

  it('carries the rich present-only profile fields through the wire', () => {
    const rich = {
      ...VALID_DATA,
      matched: true,
      headline: 'CIO @ Veolia',
      seniority: 'c_suite',
      state: 'Île-de-France',
      twitter_url: 'https://twitter.com/x',
      github_url: 'https://github.com/x',
      departments: ['information_technology'],
      functions: ['engineering'],
      employment_history: [{ organization_name: 'Veolia', title: 'CIO', current: true }],
      education: [{ school: 'Télécom Paris', degree: 'Ingénieur', field_of_study: 'Informatique' }],
      personal_emails: ['x@gmail.com'],
      phone_numbers: [{ number: '+33611223344', type: 'mobile', status: 'valid' }],
    }
    expect(enrichContactResponseSchema.parse({ data: rich })).toEqual({ data: rich })
  })
})

describe('apolloContactProfileSchema', () => {
  it('accepts an empty profile (every field is present-only / optional)', () => {
    expect(apolloContactProfileSchema.parse({})).toEqual({})
  })

  it('strips unknown keys and keeps only the known profile shape', () => {
    const parsed = apolloContactProfileSchema.parse({
      headline: 'Head of Data',
      employment_history: [{ organization_name: 'Acme', title: 'Lead', current: false }],
      unexpected: 'dropped',
    })
    expect(parsed).toEqual({
      headline: 'Head of Data',
      employment_history: [{ organization_name: 'Acme', title: 'Lead', current: false }],
    })
  })
})

describe('planInputSchema', () => {
  it('accepts a valid payload with empty collections', () => {
    const result = planInputSchema.parse({
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
      accountData: {},
      contacts: [],
      profileData: {},
    })
    expect(result.contacts).toEqual([])
  })

  it('rejects missing required fields', () => {
    expect(() =>
      planInputSchema.parse({
        accountId: VALID_UUID_A,
        // userId missing
        accountData: {},
        contacts: [],
        profileData: {},
      }),
    ).toThrow()
  })

  // #4070.2/.4 — le re-plan à la demande (« changer de stratégie ») reçoit aussi
  // les faits du compte, les motifs de perte et l'analyse précédente.
  it('accepts the optional account facts, lost-deal rex and previous analysis trace', () => {
    const result = planInputSchema.parse({
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
      accountData: {},
      contacts: [],
      profileData: {},
      accountFacts: [{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }],
      lostDealRex: 'Perte du 2024-06-01 — motif déclaré : prix.',
      previousAnalysis: 'Analyse du 2026-06-18',
    })
    expect(result.accountFacts).toEqual([{ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }])
    expect(result.lostDealRex).toBe('Perte du 2024-06-01 — motif déclaré : prix.')
    expect(result.previousAnalysis).toBe('Analyse du 2026-06-18')
  })

  it('omits the account facts, lost-deal rex and previous analysis fields when absent', () => {
    const result = planInputSchema.parse({
      accountId: VALID_UUID_A,
      userId: VALID_UUID_B,
      accountData: {},
      contacts: [],
      profileData: {},
    })
    expect(result.accountFacts).toBeUndefined()
    expect(result.lostDealRex).toBeUndefined()
    expect(result.previousAnalysis).toBeUndefined()
  })
})

// #2727 — « je tape un nom, je vois les homonymes, je choisis ».
describe('searchPeopleByNameInputSchema', () => {
  it('accepts a bare full name — organizationName is optional', () => {
    expect(searchPeopleByNameInputSchema.parse({ fullName: 'Marion Sagnard' })).toEqual({
      fullName: 'Marion Sagnard',
    })
  })

  it('accepts a name resserré par une entreprise supposée', () => {
    expect(searchPeopleByNameInputSchema.parse({ fullName: 'Marion Sagnard', organizationName: 'Bedrock' })).toEqual({
      fullName: 'Marion Sagnard',
      organizationName: 'Bedrock',
    })
  })

  it('rejects an empty full name', () => {
    expect(() => searchPeopleByNameInputSchema.parse({ fullName: '' })).toThrow()
  })
})

// #4386 — la cascade multi-sources : familles de sources, indice de correspondance EN MOTS.
describe('person name search — cascade fields (#4386)', () => {
  const CASCADE_HIT = {
    id: 'web:linkedin.com/in/theo-haddad',
    firstName: 'Théo',
    lastName: 'Haddad',
    lastNameObfuscated: '',
    title: 'CEO',
    organizationName: 'BELLUM AI',
    city: '',
    country: '',
    hasEmail: false,
    hasPhone: false,
    linkedinUrl: 'https://fr.linkedin.com/in/theo-haddad',
    sources: ['legal_registry', 'web'],
    match: 'name_and_company',
  }

  it('carries sources per hit, the match in words and the families queried', () => {
    const parsed = searchPeopleByNameResultSchema.parse({
      hits: [CASCADE_HIT],
      status: 'ok',
      sourcesQueried: [
        { family: 'contact_base', outcome: 'empty', count: 0 },
        { family: 'legal_registry', outcome: 'found', count: 1 },
        { family: 'web', outcome: 'down', count: 0 },
      ],
    })
    expect(parsed.hits[0]).toEqual(CASCADE_HIT)
    expect(parsed.sourcesQueried?.map(s => s.outcome)).toEqual(['empty', 'found', 'down'])
  })

  it('names FAMILIES, never a supplier — an unknown family or a percentage fails loudly', () => {
    expect(personNameSourceFamilySchema.options).toEqual(['contact_base', 'legal_registry', 'web'])
    for (const family of personNameSourceFamilySchema.options) expect(supplierNamesIn(family)).toEqual([])
    expect(() =>
      searchPeopleByNameResultSchema.parse({ hits: [{ ...CASCADE_HIT, sources: ['apollo'] }], status: 'ok' }),
    ).toThrow()
    expect(() =>
      searchPeopleByNameResultSchema.parse({ hits: [{ ...CASCADE_HIT, match: '87%' }], status: 'ok' }),
    ).toThrow()
  })

  it('keeps the legacy hit shape valid (no cascade field required)', () => {
    const legacy = { ...CASCADE_HIT }
    delete (legacy as Partial<typeof CASCADE_HIT>).lastName
    delete (legacy as Partial<typeof CASCADE_HIT>).linkedinUrl
    delete (legacy as Partial<typeof CASCADE_HIT>).sources
    delete (legacy as Partial<typeof CASCADE_HIT>).match
    expect(searchPeopleByNameResultSchema.parse({ hits: [legacy], status: 'empty' }).sourcesQueried).toBeUndefined()
  })
})

describe('searchPeopleByNameResultSchema', () => {
  const HIT = {
    id: 'apollo-1',
    firstName: 'Marion',
    lastNameObfuscated: 'Sa***d',
    title: 'DRH',
    organizationName: 'Bedrock',
    city: 'Paris',
    country: 'France',
    hasEmail: true,
    hasPhone: false,
  }

  it('accepts a typed status with zero or more hits — never a guessed field', () => {
    expect(searchPeopleByNameResultSchema.parse({ hits: [HIT], status: 'ok' })).toEqual({ hits: [HIT], status: 'ok' })
    expect(searchPeopleByNameResultSchema.parse({ hits: [], status: 'empty' })).toEqual({ hits: [], status: 'empty' })
  })

  it('rejects an untyped status — a typo must fail loudly, never pass as a free string', () => {
    expect(() => searchPeopleByNameResultSchema.parse({ hits: [], status: 'not_a_real_status' })).toThrow()
  })

  it('accepts every status the IA can type (unconfigured/down included — the screen must say WHY)', () => {
    for (const status of ['ok', 'empty', 'unconfigured', 'auth_failed', 'plan_blocked', 'rate_limited', 'down']) {
      expect(searchPeopleByNameResultSchema.parse({ hits: [], status }).status).toBe(status)
    }
  })
})
