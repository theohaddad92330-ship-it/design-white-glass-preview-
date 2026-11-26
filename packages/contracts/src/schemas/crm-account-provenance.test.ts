import { describe, expect, it } from 'vitest'
import {
  accountCrmProvenanceSchema,
  accountCrmSaysSchema,
  canCompleteCrmAccount,
  crmFieldCrmVersion,
  crmFieldSource,
  crmSaysSummary,
  isCrmSaysEmpty,
  type AccountCrmSays,
  classifyContactCrmOrigin,
  contactsToComplete,
  crmProvenanceCounts,
  isNeverAnalyzed,
  isKnownContact,
  isKnownContactSource,
} from '../index.js'

// #4459 — fiche d'un compte venu du CRM : ce qui y était, ce que l'analyse a apporté, et compléter le CRM.
describe('compte venu du CRM — le contrat de provenance', () => {
  it('#4459.1 — « jamais analysé » = versé depuis Découvrir ou par un import, rien d’autre', () => {
    expect(isNeverAnalyzed('prospect')).toBe(true)
    expect(isNeverAnalyzed('imported')).toBe(true)
    for (const status of ['analyzing', 'completed', 'error', 'canceled', 'archived', 'deleted'] as const) {
      expect(isNeverAnalyzed(status), status).toBe(false)
    }
  })

  it('#4459.1 — « Compléter le compte » : analysé ET venu du CRM ET quelque chose à ajouter', () => {
    const ok = { status: 'completed', accountFromCrm: true, toComplete: 2 } as const
    expect(canCompleteCrmAccount(ok)).toBe(true)
    expect(canCompleteCrmAccount({ ...ok, accountFromCrm: false })).toBe(false)
    expect(canCompleteCrmAccount({ ...ok, status: 'imported' })).toBe(false)
    expect(canCompleteCrmAccount({ ...ok, status: 'analyzing' })).toBe(false)
    // Tout est déjà dans le CRM (ou déjà poussé) : le geste n'a rien à faire, il ne s'affiche pas.
    expect(canCompleteCrmAccount({ ...ok, toComplete: 0 })).toBe(false)
  })

  it('#4459.2 — un contact importé (source ou trace d’import) est « dans ton CRM »', () => {
    expect(classifyContactCrmOrigin({ source: 'import', importedFromCrm: false })).toBe('crm')
    expect(classifyContactCrmOrigin({ source: 'crm', importedFromCrm: false })).toBe('crm')
    // Un contact trouvé par l'analyse PUIS rapproché d'une fiche du CRM y était déjà.
    expect(classifyContactCrmOrigin({ source: 'apollo', importedFromCrm: true })).toBe('crm')
  })

  it('#4459.2 — trouvé par l’analyse = « apporté » ; saisi à la main ou source inconnue = aucune mention', () => {
    for (const source of ['apollo', 'linkedin', 'ai_generated', 'pappers', 'job_posting', 'shared_base', 'demo']) {
      expect(classifyContactCrmOrigin({ source, importedFromCrm: false }), source).toBe('bellum')
    }
    expect(classifyContactCrmOrigin({ source: 'manual', importedFromCrm: false })).toBeNull()
    expect(classifyContactCrmOrigin({ source: 'meeting', importedFromCrm: false })).toBeNull()
    expect(classifyContactCrmOrigin({ source: null, importedFromCrm: false })).toBeNull()
  })

  it('#4459.2 — les compteurs : une part absente vaut `null`, jamais 0 (GA-18/19)', () => {
    expect(crmProvenanceCounts([])).toEqual({ inCrm: null, brought: null })
    expect(
      crmProvenanceCounts([
        { contactId: 'a', origin: 'crm', pushed: false },
        { contactId: 'b', origin: 'bellum', pushed: false },
        { contactId: 'c', origin: 'bellum', pushed: true },
      ]),
    ).toEqual({ inCrm: 1, brought: 2 })
    expect(crmProvenanceCounts([{ contactId: 'b', origin: 'bellum', pushed: false }])).toEqual({
      inCrm: null,
      brought: 1,
    })
  })

  it('#4459.3 — à compléter : les apportés pas encore poussés, jamais un contact déjà poussé ni du CRM', () => {
    expect(
      contactsToComplete([
        { contactId: 'a', origin: 'crm', pushed: false },
        { contactId: 'b', origin: 'bellum', pushed: false },
        { contactId: 'c', origin: 'bellum', pushed: true },
      ]),
    ).toEqual(['b'])
  })

  it('le contrat de lecture refuse une origine inventée', () => {
    expect(
      accountCrmProvenanceSchema.safeParse({
        accountFromCrm: true,
        contacts: [{ contactId: 'a', origin: 'crm', pushed: false }],
      }).success,
    ).toBe(true)
    expect(
      accountCrmProvenanceSchema.safeParse({
        accountFromCrm: true,
        contacts: [{ contactId: 'a', origin: 'manual', pushed: false }],
      }).success,
    ).toBe(false)
  })
})

describe('#4604 — « Ce que dit ton CRM » et la provenance par champ', () => {
  const crm: AccountCrmSays = {
    provider: 'pipedrive',
    deals: [
      {
        title: 'Renouvellement 2027',
        stage: 'Négociation',
        status: 'open',
        amount: 120000,
        currency: 'EUR',
        ownerName: 'Claire Martin',
        updatedAt: '2026-10-20T10:00:00.000Z',
      },
      {
        title: 'Pilote data',
        stage: 'Gagné',
        status: 'won',
        amount: null,
        currency: null,
        ownerName: 'Paul Roux',
        updatedAt: '2026-10-25T10:00:00.000Z',
      },
    ],
    activities: [{ kind: 'meeting', occurredAt: '2026-10-22T09:00:00.000Z' }],
    fields: [
      { field: 'company_name', source: 'crm' },
      { field: 'siren', source: 'human' },
    ],
    fusion: { id: 'f-1', mergedAt: '2026-10-26T08:00:00.000Z', absorbedName: 'VEEPEE' },
  }

  it('le schéma accepte un bloc CRM, et un compte sans CRM n’en porte pas (absent ou null)', () => {
    expect(accountCrmSaysSchema.safeParse(crm).success).toBe(true)
    expect(accountCrmProvenanceSchema.safeParse({ accountFromCrm: false, contacts: [], crm: null }).success).toBe(true)
    expect(accountCrmProvenanceSchema.safeParse({ accountFromCrm: false, contacts: [] }).success).toBe(true)
  })

  it('nomme l’outil BRANCHÉ par le client, jamais un identifiant interne', () => {
    expect(crmSaysSummary(crm).tool).toBe('Pipedrive')
  })

  it('le propriétaire et l’étape viennent de l’affaire OUVERTE la plus récente', () => {
    expect(crmSaysSummary(crm)).toEqual(
      expect.objectContaining({ owner: 'Claire Martin', stage: 'Négociation', deals: 2, activities: 1 }),
    )
  })

  it('une absence ne fait AUCUNE ligne, et jamais « 0 » (GA-18/19)', () => {
    const empty = crmSaysSummary({ ...crm, deals: [], activities: [] })
    expect(empty).toEqual(expect.objectContaining({ owner: null, stage: null, deals: null, activities: null }))
    expect(isCrmSaysEmpty(empty)).toBe(true)
    expect(isCrmSaysEmpty(crmSaysSummary(crm))).toBe(false)
  })

  it('la provenance d’un champ se lit à UN endroit : « crm », « human », ou rien — jamais devinée', () => {
    expect(crmFieldSource(crm, 'company_name')).toBe('crm')
    expect(crmFieldSource(crm, 'siren')).toBe('human')
    expect(crmFieldSource({ ...crm, fields: [] }, 'company_name')).toBeNull()
    expect(crmFieldSource(null, 'company_name')).toBeNull()
  })
})

// #4604.2 / .4 / .7 — l'étiquette sur étape et propriétaire, les champs personnalisés, la version CRM d'une valeur corrigée.
describe('#4604 — étape, propriétaire, champs personnalisés et version CRM', () => {
  const deal = (over: Partial<AccountCrmSays['deals'][number]>): AccountCrmSays['deals'][number] => ({
    title: 'Renouvellement',
    stage: 'Négociation',
    status: 'open',
    amount: null,
    currency: null,
    ownerName: 'Claire Martin',
    updatedAt: '2026-10-20T10:00:00.000Z',
    ...over,
  })
  const base: AccountCrmSays = { provider: 'hubspot', deals: [], activities: [], fields: [], fusion: null }

  it('#4604.2 — l’étape et le propriétaire portent la même étiquette « crm » quand le CRM les dit, rien sinon', () => {
    const crm = { ...base, deals: [deal({})] }
    expect(crmFieldSource(crm, 'stage')).toBe('crm')
    expect(crmFieldSource(crm, 'owner')).toBe('crm')
    const bare = { ...base, deals: [deal({ stage: null, ownerName: ' ' })] }
    expect(crmFieldSource(bare, 'stage')).toBeNull()
    expect(crmFieldSource(bare, 'owner')).toBeNull()
    expect(crmFieldSource(base, 'owner')).toBeNull()
    expect(crmFieldSource(null, 'stage')).toBeNull()
  })

  it('#4604.4 — les champs personnalisés sont ceux de l’affaire en tête ; sans champ, aucune ligne', () => {
    const lead = deal({ customFields: [{ key: 'budget_it', value: '1,2 M€' }] })
    const older = deal({
      status: 'won',
      updatedAt: '2026-10-25T10:00:00.000Z',
      customFields: [{ key: 'x', value: 'y' }],
    })
    expect(crmSaysSummary({ ...base, deals: [older, lead] }).customFields).toEqual([
      { key: 'budget_it', value: '1,2 M€' },
    ])
    expect(crmSaysSummary({ ...base, deals: [deal({})] }).customFields).toEqual([])
    expect(isCrmSaysEmpty(crmSaysSummary({ ...base, deals: [] }))).toBe(true)
    // Seuls des champs personnalisés : le bloc existe — c'est quelque chose que le CRM dit.
    const onlyCustom = {
      ...base,
      deals: [deal({ stage: null, ownerName: null, title: null, customFields: [{ key: 'a', value: 'b' }] })],
    }
    expect(isCrmSaysEmpty(crmSaysSummary(onlyCustom))).toBe(false)
  })

  it('#4604.7 — la version du CRM ne se lit que pour une valeur CORRIGÉE à la main, et seulement si elle est connue', () => {
    const crm: AccountCrmSays = {
      ...base,
      fields: [
        { field: 'company_name', source: 'human' },
        { field: 'siren', source: 'crm' },
      ],
      crmValues: [
        { field: 'company_name', value: 'VEEPEE SA' },
        { field: 'siren', value: '123456789' },
      ],
    }
    expect(crmFieldCrmVersion(crm, 'company_name')).toBe('VEEPEE SA')
    // La valeur du champ EST celle du CRM : rien à consulter à côté.
    expect(crmFieldCrmVersion(crm, 'siren')).toBeNull()
    expect(crmFieldCrmVersion({ ...base, fields: crm.fields }, 'company_name')).toBeNull()
    expect(crmFieldCrmVersion(null, 'company_name')).toBeNull()
  })
})

describe('#4678 — le prédicat « contact connu »', () => {
  it('import et crm sont connus', () => {
    expect(isKnownContact({ source: 'import' })).toBe(true)
    expect(isKnownContact({ source: 'crm' })).toBe(true)
  })

  it('une découverte, une saisie, un rendez-vous, une source absente ne sont PAS connus', () => {
    for (const source of ['apollo', 'linkedin_apify', 'manual', 'meeting', 'demo', 'csv_import', '', null, undefined]) {
      expect(isKnownContactSource(source)).toBe(false)
    }
    expect(isKnownContact({})).toBe(false)
  })

  it('la provenance « dans ton CRM » et le prédicat disent la même chose', () => {
    for (const source of ['import', 'crm', 'apollo', 'manual', null]) {
      expect(classifyContactCrmOrigin({ source, importedFromCrm: false }) === 'crm').toBe(isKnownContactSource(source))
    }
  })
})

describe('#4680 — la provenance porte les contacts connus et la trace d’import', () => {
  it('accepte knownContacts et accountImport, et les laisse absents quand il n’y en a pas', () => {
    const base = { accountFromCrm: true, contacts: [] }
    expect(accountCrmProvenanceSchema.parse(base)).toEqual(base)
    const full = {
      ...base,
      knownContacts: { count: 2, importedAt: '2026-10-20T08:00:00.000Z' },
      accountImport: { kind: 'file', importedAt: null },
    }
    expect(accountCrmProvenanceSchema.parse(full)).toEqual(full)
  })

  it('SAIT DIRE NON — un compte de zéro contact connu n’est pas une présence', () => {
    expect(() =>
      accountCrmProvenanceSchema.parse({
        accountFromCrm: false,
        contacts: [],
        knownContacts: { count: 0, importedAt: null },
      }),
    ).toThrow()
  })
})
