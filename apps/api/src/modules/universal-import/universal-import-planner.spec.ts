import { proposeUniversalMapping } from '@bellum/contracts'
import { accountKeysFor, planUniversalChunk, type UniversalPlanContext } from './universal-import-planner'

const ACCOUNT = '11111111-1111-4111-8111-111111111111'
const OTHER_ACCOUNT = '22222222-2222-4222-8222-222222222222'

function context(overrides: Partial<UniversalPlanContext> = {}): UniversalPlanContext {
  return {
    type: 'contact',
    workspaceId: 'ws-1',
    userId: 'user-1',
    mapping: { Nom: 'full_name', Email: 'email', 'Code ERP': null },
    accountId: ACCOUNT,
    accountByName: new Map(),
    known: new Map(),
    source: { provider: 'csv', namespace: 'boondmanager' },
    writesRefs: true,
    canCreateAccounts: false,
    accountByRef: new Map(),
    refByAccount: new Map(),
    contactByRef: new Map(),
    createdIds: new Set(),
    ...overrides,
  }
}

describe('import universel — plan d’un paquet', () => {
  it('une colonne inconnue part dans `extra` sur la fiche créée ; source = import', () => {
    const plan = planUniversalChunk(context(), [
      { line: 2, record: { Nom: 'Ada Lovelace', Email: 'ADA@x.io', 'Code ERP': 'C-9' } },
    ])
    expect(plan.issues).toEqual([])
    expect(plan.creates[0]?.values).toMatchObject({
      full_name: 'Ada Lovelace',
      email: 'ada@x.io',
      source: 'import',
      workspace_id: 'ws-1',
      account_id: ACCOUNT,
      extra: { 'Code ERP': 'C-9' },
    })
  })

  it('une cellule vide n’écrit NI 0 NI chaîne vide : null', () => {
    const plan = planUniversalChunk(context({ mapping: { Nom: 'full_name', Poste: 'title' } }), [
      { line: 2, record: { Nom: 'Ada Lovelace', Poste: '  ' } },
    ])
    expect(plan.creates[0]?.values['title']).toBeNull()
    expect(plan.creates[0]?.values['extra']).toEqual({})
  })

  it('un doublon est PROPOSÉ avec la fiche existante — rien n’est créé ni fusionné', () => {
    const known = new Map([[`${ACCOUNT}|email:ada@x.io`, 'existing-contact']])
    const plan = planUniversalChunk(context({ known }), [
      { line: 7, record: { Nom: 'A. Lovelace', Email: 'ada@x.io' } },
    ])
    expect(plan.creates).toEqual([])
    expect(plan.issues).toEqual([
      { row: 7, kind: 'duplicate', reason: 'duplicate', existingId: 'existing-contact', label: 'A. Lovelace' },
    ])
  })

  // #4051.8 — « coordonnées déjà présentes » : un doublon contre une fiche DÉJÀ dans l'espace, qui porte
  // une coordonnée (e-mail / téléphone) ; un doublon du fichier ou une ligne sans coordonnée n'en est pas un.
  it('#4051.8 — compte les coordonnées déjà présentes dans l’espace, pas les doublons du fichier', () => {
    const known = new Map([[`${ACCOUNT}|email:ada@x.io`, 'existing-contact']])
    const plan = planUniversalChunk(context({ known }), [
      { line: 2, record: { Nom: 'A. Lovelace', Email: 'ada@x.io' } },
      { line: 3, record: { Nom: 'Grace Hopper', Email: 'grace@x.io' } },
      { line: 4, record: { Nom: 'Grace H.', Email: 'grace@x.io' } },
    ])
    expect(plan.alreadyKnown).toEqual({ contact: 1 })
  })

  // #4051.5 (18/10) — le bilan compte les personnes DISTINCTES et les comptes résolus, pas les lignes :
  // la même personne citée deux fois, ou rejetée, n'est comptée qu'une fois / jamais.
  it('#4051.5 — compte les personnes distinctes et les comptes résolus, d’un paquet à l’autre', () => {
    const known = new Map([[`${ACCOUNT}|email:ada@x.io`, 'existing-contact']])
    const ctx = context({ known })
    const first = planUniversalChunk(ctx, [
      { line: 2, record: { Nom: 'A. Lovelace', Email: 'ada@x.io' } },
      { line: 3, record: { Nom: 'Grace Hopper', Email: 'grace@x.io' } },
      { line: 4, record: { Nom: 'Grace H.', Email: 'grace@x.io' } },
      { line: 5, record: { Nom: '', Email: 'rien@x.io' } },
    ])
    expect(first.resolved).toEqual({ people: 2, accounts: 1 })
    const second = planUniversalChunk(ctx, [{ line: 6, record: { Nom: 'Ada L.', Email: 'ada@x.io' } }])
    expect(second.resolved).toEqual({ people: 0, accounts: 0 })
  })

  // #4051.7 — une personne DÉJÀ connue dont le titre a changé est proposée à la correction (ancien → nouveau,
  // source), jamais créée en double ; un titre identique (casse / blancs) ne propose rien de plus.
  it('#4051.7 — un titre changé sur une personne connue est PROPOSÉ « à rapprocher », sans création', () => {
    const known = new Map([[`${ACCOUNT}|email:ada@x.io`, 'existing-contact']])
    const plan = planUniversalChunk(
      context({
        known,
        mapping: { Nom: 'full_name', Email: 'email', Poste: 'title' },
        titleById: new Map([['existing-contact', 'Directrice SI']]),
      }),
      [
        { line: 2, record: { Nom: 'Ada Lovelace', Email: 'ada@x.io', Poste: 'DSI Groupe' } },
        { line: 3, record: { Nom: 'Ada Lovelace', Email: 'ada@x.io', Poste: ' directrice si ' } },
      ],
    )
    expect(plan.creates).toEqual([])
    expect(plan.issues[0]).toEqual({
      row: 2,
      kind: 'to_reconcile',
      reason: 'title_changed',
      existingId: 'existing-contact',
      label: 'Ada Lovelace : Directrice SI → DSI Groupe (source : boondmanager)',
    })
    expect(plan.issues[1]).toMatchObject({ row: 3, kind: 'duplicate' })
  })

  it('un doublon DANS le fichier cite la ligne créée plus haut', () => {
    const plan = planUniversalChunk(context(), [
      { line: 2, record: { Nom: 'Ada Lovelace', Email: 'ada@x.io' } },
      { line: 3, record: { Nom: 'Ada L.', Email: 'ada@x.io' } },
    ])
    expect(plan.creates).toHaveLength(1)
    expect(plan.issues[0]).toMatchObject({ row: 3, kind: 'duplicate', existingId: plan.creates[0]?.id })
  })

  it('les clés sont BORNÉES au compte : le même e-mail sur un autre compte n’est pas un doublon', () => {
    const known = new Map([[`${OTHER_ACCOUNT}|email:ada@x.io`, 'elsewhere']])
    const plan = planUniversalChunk(context({ known }), [
      { line: 2, record: { Nom: 'Ada Lovelace', Email: 'ada@x.io' } },
    ])
    expect(plan.creates).toHaveLength(1)
  })

  it('import d’espace : une société inconnue SANS référence est PROPOSÉE à valider, jamais créée (#4053.1)', () => {
    const ctx = context({
      accountId: null,
      mapping: { Nom: 'full_name', Société: 'company' },
      accountByName: new Map([['acme', ACCOUNT]]),
    })
    const plan = planUniversalChunk(ctx, [
      { line: 2, record: { Nom: 'Ada Lovelace', Société: 'ACME SAS' } },
      { line: 3, record: { Nom: 'Grace Hopper', Société: 'Inconnue' } },
    ])
    expect(plan.creates.map(create => create.values['account_id'])).toEqual([ACCOUNT])
    expect(plan.accountCreates).toEqual([])
    expect(plan.issues).toEqual([
      { row: 3, kind: 'to_reconcile', reason: 'company_to_validate', existingId: null, label: 'Inconnue' },
    ])
  })

  it('une ligne sans champ obligatoire est rejetée NOMMÉMENT', () => {
    const plan = planUniversalChunk(context(), [{ line: 4, record: { Email: 'x@y.io' } }])
    expect(plan.issues[0]).toMatchObject({ row: 4, kind: 'rejected', reason: 'missing_required_field' })
  })

  // #3850.1 — mesuré en prod le 08/10 : un code postal brésilien « 90480-000 »
  // a été ENREGISTRÉ comme téléphone sur une fiche réelle (Romali Mondal). Une
  // colonne mappée « phone » n'écrit plus une cellule qui n'a pas la forme
  // d'un numéro — la ligne reste importée, seule la cellule devient `null`.
  it('un « téléphone » qui est en réalité un code postal n’est jamais écrit', () => {
    const plan = planUniversalChunk(context({ mapping: { Nom: 'full_name', Téléphone: 'phone' } }), [
      { line: 2, record: { Nom: 'Romali Mondal', Téléphone: '90480-000' } },
    ])
    expect(plan.issues).toEqual([])
    expect(plan.creates[0]?.values['phone']).toBeNull()
  })

  // #3850.4 — stockage E.164 COMPACT, sans espace : un téléphone plausible
  // est normalisé à l'écriture, quelle que soit la forme de la cellule.
  it('un téléphone plausible (local FR ou international) s’écrit en E.164 compact', () => {
    const plan = planUniversalChunk(context({ mapping: { Nom: 'full_name', Téléphone: 'phone' } }), [
      { line: 2, record: { Nom: 'Ada Lovelace', Téléphone: '06 39 98 41 27' } },
      { line: 3, record: { Nom: 'Jean Dupont', Téléphone: '+1 415 555 0132' } },
    ])
    expect(plan.creates.map(create => create.values['phone'])).toEqual(['+33639984127', '+14155550132'])
  })

  it('comptes : SIREN connu → doublon proposé ; nouveau → `imported`, assigné à qui importe', () => {
    const ctx = context({
      type: 'account',
      accountId: null,
      mapping: { Société: 'company_name', SIREN: 'siren', 'Code client': null },
      known: new Map([['siren:552100554', 'acme-id']]),
    })
    const plan = planUniversalChunk(ctx, [
      { line: 2, record: { Société: 'Acme', SIREN: '552100554' } },
      { line: 3, record: { Société: 'Globex', SIREN: '', 'Code client': 'G1' } },
    ])
    expect(plan.issues).toEqual([
      { row: 2, kind: 'duplicate', reason: 'duplicate', existingId: 'acme-id', label: 'Acme' },
    ])
    expect(plan.creates[0]?.values).toMatchObject({
      company_name: 'Globex',
      siren: null,
      status: 'imported',
      assigned_to: 'user-1',
      extra: { 'Code client': 'G1' },
    })
  })

  // #4426.1 — la colonne « Tiering (A, B, C) » d'un classeur de tiering ne se perd plus dans `extra` : elle pose
  // l'étiquette « Tier A » (le champ `tags`, filtrable sur /accounts) ; la raison reste lisible sur la fiche.
  it('#4426.1 — tiering A/B/C → étiquette « Tier X » ; raison gardée ; valeur illisible = aucune étiquette inventée', () => {
    const headers = ['Nom de la société', 'Tiering (A, B, C)', 'Raison du tiering']
    const mapping = proposeUniversalMapping(headers, 'account')
    expect(mapping).toMatchObject({ 'Tiering (A, B, C)': 'tier', 'Raison du tiering': 'tier_reason' })
    const plan = planUniversalChunk(context({ type: 'account', accountId: null, mapping }), [
      {
        line: 2,
        record: { 'Nom de la société': 'Acme', 'Tiering (A, B, C)': 'A', 'Raison du tiering': 'Gros budget' },
      },
      { line: 3, record: { 'Nom de la société': 'Globex', 'Tiering (A, B, C)': 'tier b', 'Raison du tiering': '' } },
      {
        line: 4,
        record: { 'Nom de la société': 'Initech', 'Tiering (A, B, C)': 'peut-être', 'Raison du tiering': '' },
      },
    ])
    expect(plan.creates.map(c => c.values['tags'])).toEqual([['Tier A'], ['Tier B'], []])
    expect(plan.creates[0]?.values['extra']).toEqual({ 'Raison du tiering': 'Gros budget' })
    // La valeur illisible n'est ni devinée ni perdue : elle reste dans `extra` sous son en-tête.
    expect(plan.creates[2]?.values['extra']).toEqual({ 'Tiering (A, B, C)': 'peut-être' })
  })

  // #4426.4 — rattrapage : le même fichier de tiering ré-importé sur des comptes DÉJÀ là pose l'étiquette (sans les copier).
  it('#4426.4 — compte déjà connu : le tier se pose en étiquette ajoutée, le doublon reste proposé', () => {
    const headers = ['Nom de la société', 'SIREN', 'Tiering (A, B, C)']
    const mapping = proposeUniversalMapping(headers, 'account')
    const plan = planUniversalChunk(
      context({
        type: 'account',
        accountId: null,
        mapping,
        known: new Map([['siren:552100554', 'acme-id']]),
      }),
      [
        { line: 2, record: { 'Nom de la société': 'Acme', SIREN: '552100554', 'Tiering (A, B, C)': 'B' } },
        { line: 3, record: { 'Nom de la société': 'Acme', SIREN: '552100554', 'Tiering (A, B, C)': '' } },
      ],
    )
    expect(plan.creates).toEqual([])
    expect(plan.fills).toEqual([{ line: 2, id: 'acme-id', target: 'account', values: { tags_add: ['Tier B'] } }])
    expect(plan.issues).toHaveLength(2)
  })

  it('garde la classification de l’ancien import : famille et pertinence persistées', () => {
    const plan = planUniversalChunk(context({ mapping: { Nom: 'full_name', Poste: 'title' } }), [
      { line: 2, record: { Nom: 'Ada Lovelace', Poste: 'DSI' } },
    ])
    expect(plan.creates[0]?.values['family']).toBe('IT')
    expect(plan.creates[0]?.values['priority']).toEqual(expect.any(Number))
  })

  it('besoins : rattachés au compte, TJM en centimes, date ISO ; une date ambiguë n’est PAS devinée — gardée en extra', () => {
    const ctx = context({
      type: 'need',
      accountId: null,
      mapping: { Intitulé: 'title', Client: 'company', TJM: 'daily_rate', Début: 'start_date', Stack: 'skills' },
      accountByName: new Map([['acme', ACCOUNT]]),
    })
    const plan = planUniversalChunk(ctx, [
      {
        line: 2,
        record: { Intitulé: 'Dev Java', Client: 'Acme', TJM: '550', Début: '03/04/2026', Stack: 'Java; Spring' },
      },
      { line: 3, record: { Intitulé: 'Dev Java', Client: 'Acme' } },
      { line: 4, record: { Intitulé: 'Data', Client: 'Inconnue' } },
    ])
    expect(plan.creates[0]?.values).toMatchObject({
      account_id: ACCOUNT,
      title: 'Dev Java',
      target_tjm_cents: '55000',
      start_on: null,
      stack: ['Java', 'Spring'],
      source: 'csv_import',
      extra: { Début: '03/04/2026' },
    })
    expect(plan.issues.map(issue => [issue.row, issue.kind, issue.reason])).toEqual([
      [3, 'duplicate', 'duplicate'],
      [4, 'rejected', 'unknown_company'],
    ])
  })

  it('consultants : un e-mail déjà au vivier est un doublon PROPOSÉ, jamais mis à jour', () => {
    const ctx = context({
      type: 'talent',
      accountId: null,
      mapping: { Nom: 'full_name', Mail: 'email' },
      known: new Map([['talent|email:ada@x.io', 'talent-1']]),
    })
    const plan = planUniversalChunk(ctx, [{ line: 2, record: { Nom: 'Ada', Mail: 'ada@x.io' } }])
    expect(plan.creates).toEqual([])
    expect(plan.issues[0]).toMatchObject({ kind: 'duplicate', existingId: 'talent-1' })
  })

  it('la mission reste déclarée sans écrivain : rejet nommé', () => {
    const plan = planUniversalChunk(context({ type: 'mission', mapping: { Mission: 'title' } }), [
      { line: 2, record: { Mission: 'Run' } },
    ])
    expect(plan.issues[0]?.reason).toBe('type_not_writable')
  })
})

describe('#4052 / #4053 — un export CRM de contacts : références source et comptes créés', () => {
  const MAPPING = {
    'Réf contact': 'source_ref',
    'Réf société': 'company_ref',
    Nom: 'full_name',
    Email: 'email',
    Téléphone: 'phone',
    Société: 'company',
    Secteur: 'company_sector',
    Effectif: 'company_employees',
    Ville: 'company_city',
    'Type société': 'company_status',
    'Statut contact': null,
  }
  const crm = (overrides: Partial<UniversalPlanContext> = {}) =>
    context({ accountId: null, mapping: MAPPING, canCreateAccounts: true, ...overrides })

  it('#4053.1 — deux contacts à la même référence société créent UN compte nourri des colonnes société', () => {
    const plan = planUniversalChunk(crm(), [
      {
        line: 2,
        record: {
          'Réf contact': 'CCON1',
          'Réf société': 'CSOC1',
          Nom: 'Ada Lovelace',
          Société: 'Acme',
          Secteur: 'Banque',
          Effectif: '250',
          Ville: 'Lyon',
          'Type société': 'Client',
          'Statut contact': 'Engagé',
        },
      },
      { line: 3, record: { 'Réf contact': 'CCON2', 'Réf société': 'CSOC1', Nom: 'Grace Hopper', Société: 'ACME' } },
    ])
    expect(plan.issues).toEqual([])
    expect(plan.accountCreates).toHaveLength(1)
    const account = plan.accountCreates[0]?.values
    expect(account).toMatchObject({
      company_name: 'Acme',
      sector: 'Banque',
      employees: '250',
      headquarters: 'Lyon',
      status: 'imported',
      // #4053.2 — un fait de la source, tel quel, sur le compte — jamais promu.
      extra: { 'Type société': 'Client' },
    })
    expect(plan.creates.map(c => c.values['account_id'])).toEqual([account?.['id'], account?.['id']])
    // #4053.2 — l'état relationnel reste un fait de la source sur le contact, aucune « relation chaude ».
    expect(plan.creates[0]?.values['extra']).toEqual({ 'Statut contact': 'Engagé' })
    expect(Object.keys(plan.creates[0]?.values ?? {})).not.toContain('warmth')
    expect(plan.links).toEqual([
      { entityType: 'account', externalId: 'boondmanager:CSOC1', internalId: account?.['id'] },
      { entityType: 'contact', externalId: 'boondmanager:CCON1', internalId: plan.creates[0]?.id },
      { entityType: 'contact', externalId: 'boondmanager:CCON2', internalId: plan.creates[1]?.id },
    ])
  })

  it('#4052.2 — deux sociétés homonymes à références distinctes ne sont PAS fusionnées : rapprochement proposé', () => {
    const plan = planUniversalChunk(crm(), [
      { line: 2, record: { 'Réf société': 'CSOC1', Nom: 'Ada', Société: 'Acme' } },
      { line: 3, record: { 'Réf société': 'CSOC2', Nom: 'Grace', Société: 'Acme' } },
    ])
    expect(plan.accountCreates).toHaveLength(2)
    const [first, second] = plan.accountCreates
    expect(plan.creates.map(c => c.values['account_id'])).toEqual([first?.id, second?.id])
    expect(plan.issues).toEqual([
      { row: 3, kind: 'to_reconcile', reason: 'probable_duplicate_account', existingId: first?.id, label: 'Acme' },
    ])
  })

  it('#4052.1 — une référence connue rejoint SON compte, même sous un autre nom ; jamais un SIREN ni un nom comme clé', () => {
    const plan = planUniversalChunk(crm({ accountByRef: new Map([['boondmanager:CSOC9', ACCOUNT]]) }), [
      { line: 2, record: { 'Réf société': 'CSOC9', Nom: 'Ada', Société: 'Nom changé SAS' } },
    ])
    expect(plan.accountCreates).toEqual([])
    expect(plan.creates[0]?.values['account_id']).toBe(ACCOUNT)
  })

  it('#4052.1 — une fiche existante au même nom, sans référence de cette source, est rapprochée et reliée', () => {
    const plan = planUniversalChunk(crm({ accountByName: new Map([['acme', ACCOUNT]]) }), [
      { line: 2, record: { 'Réf société': 'CSOC1', Nom: 'Ada', Société: 'ACME SAS' } },
    ])
    expect(plan.accountCreates).toEqual([])
    expect(plan.creates[0]?.values['account_id']).toBe(ACCOUNT)
    expect(plan.links[0]).toEqual({ entityType: 'account', externalId: 'boondmanager:CSOC1', internalId: ACCOUNT })
    expect(plan.matched).toEqual({ account: 1 })
  })

  it('#4052.4 — une référence inconnue sans nom reste « à rapprocher », jamais une société fictive', () => {
    const plan = planUniversalChunk(crm(), [{ line: 2, record: { 'Réf société': 'CSOC7', Nom: 'Ada' } }])
    expect(plan.accountCreates).toEqual([])
    expect(plan.creates).toEqual([])
    expect(plan.issues).toEqual([
      { row: 2, kind: 'to_reconcile', reason: 'unknown_company_ref', existingId: null, label: 'CSOC7' },
    ])
  })

  it('#4052.3 — réimport du CRM à jour : la fiche reconnue se COMPLÈTE, sans copie', () => {
    const plan = planUniversalChunk(
      crm({
        accountByRef: new Map([['boondmanager:CSOC1', ACCOUNT]]),
        contactByRef: new Map([['boondmanager:CCON1', 'contact-1']]),
      }),
      [
        {
          line: 2,
          record: { 'Réf contact': 'CCON1', 'Réf société': 'CSOC1', Nom: 'Ada', Téléphone: '06 39 98 41 27' },
        },
      ],
    )
    expect(plan.creates).toEqual([])
    expect(plan.fills).toEqual([
      {
        line: 2,
        id: 'contact-1',
        target: 'contact',
        values: { title: null, email: null, phone: '+33639984127', linkedin_url: null },
      },
    ])
    expect(plan.matched).toEqual({ contact: 1 })
  })

  it('une même référence contact deux fois dans le fichier : doublon du fichier, pas une complétion', () => {
    const plan = planUniversalChunk(crm(), [
      { line: 2, record: { 'Réf contact': 'CCON1', 'Réf société': 'CSOC1', Nom: 'Ada', Société: 'Acme' } },
      { line: 3, record: { 'Réf contact': 'CCON1', 'Réf société': 'CSOC1', Nom: 'Ada L.', Société: 'Acme' } },
    ])
    expect(plan.creates).toHaveLength(1)
    expect(plan.fills).toEqual([])
    expect(plan.issues[0]).toMatchObject({ row: 3, kind: 'duplicate', existingId: plan.creates[0]?.id })
  })

  it('import PERSONNEL : la référence se LIT pour rattacher, rien ne s’écrit dans la base d’équipe', () => {
    const plan = planUniversalChunk(
      crm({ writesRefs: false, canCreateAccounts: false, accountByRef: new Map([['boondmanager:CSOC1', ACCOUNT]]) }),
      [
        { line: 2, record: { 'Réf contact': 'CCON1', 'Réf société': 'CSOC1', Nom: 'Ada' } },
        { line: 3, record: { 'Réf société': 'CSOC2', Nom: 'Grace', Société: 'Globex' } },
      ],
    )
    expect(plan.creates[0]?.values).toMatchObject({ account_id: ACCOUNT, extra: { 'Réf contact': 'CCON1' } })
    expect(plan.accountCreates).toEqual([])
    expect(plan.links).toEqual([])
    expect(plan.issues).toEqual([
      { row: 3, kind: 'to_reconcile', reason: 'company_to_validate', existingId: null, label: 'Globex' },
    ])
  })

  it('#4052.3 — fichier comptes : une référence connue complète la fiche ; une neuve se relie à la fiche créée', () => {
    const plan = planUniversalChunk(
      context({
        type: 'account',
        accountId: null,
        mapping: { Réf: 'source_ref', Société: 'company_name', Secteur: 'sector' },
        accountByRef: new Map([['boondmanager:CSOC1', ACCOUNT]]),
      }),
      [
        { line: 2, record: { Réf: 'CSOC1', Société: 'Acme', Secteur: 'Banque' } },
        { line: 3, record: { Réf: 'CSOC2', Société: 'Globex' } },
      ],
    )
    expect(plan.fills[0]).toMatchObject({ id: ACCOUNT, target: 'account', values: { sector: 'Banque' } })
    expect(plan.links).toEqual([
      { entityType: 'account', externalId: 'boondmanager:CSOC2', internalId: plan.creates[0]?.id },
    ])
  })

  describe('#4055.5 — rapprochement par alias d’entreprise', () => {
    const accountContext = (known: Map<string, string>) =>
      context({
        type: 'account',
        accountId: null,
        mapping: { Société: 'company_name', Alias: 'company_alias' },
        known,
      })
    const keyOf = (company: string) => accountKeysFor({ company, siren: null, website: null })

    it('un alias qui nomme une fiche existante la rapproche : doublon PROPOSÉ, rien n’est créé', () => {
      const known = new Map(keyOf('Société Générale').map(key => [key, 'sg-id'] as const))
      const plan = planUniversalChunk(accountContext(known), [
        { line: 2, record: { Société: 'SG', Alias: 'Société Générale | SocGen' } },
      ])
      expect(plan.creates).toEqual([])
      expect(plan.issues).toEqual([
        { row: 2, kind: 'duplicate', reason: 'duplicate', existingId: 'sg-id', label: 'SG' },
      ])
    })

    it('sait dire NON : un alias qui ne nomme aucune fiche connue crée le compte, alias gardé en extra', () => {
      const plan = planUniversalChunk(accountContext(new Map()), [
        { line: 2, record: { Société: 'SG', Alias: 'SocGen' } },
      ])
      expect(plan.issues).toEqual([])
      expect(plan.creates[0]?.values).toMatchObject({ company_name: 'SG', extra: { Alias: 'SocGen' } })
    })

    it('l’alias d’un compte créé plus haut rapproche la ligne suivante du fichier', () => {
      const plan = planUniversalChunk(accountContext(new Map()), [
        { line: 2, record: { Société: 'SG', Alias: 'SocGen' } },
        { line: 3, record: { Société: 'SocGen', Alias: '' } },
      ])
      expect(plan.creates).toHaveLength(1)
      expect(plan.issues).toEqual([
        { row: 3, kind: 'duplicate', reason: 'duplicate', existingId: plan.creates[0]?.id, label: 'SocGen' },
      ])
    })
  })
})

// #4597.3 — retrouver UN import précis : chaque fiche créée porte l'identifiant de son import.
describe('#4597.3 — l’identifiant de l’import est posé sur chaque fiche créée', () => {
  const JOB = '33333333-3333-4333-8333-333333333333'

  it('un contact créé porte `import_job_id`', () => {
    const plan = planUniversalChunk(context({ importJobId: JOB }), [{ line: 2, record: { Nom: 'Ada Lovelace' } }])
    expect(plan.creates[0]?.values).toMatchObject({ import_job_id: JOB })
  })

  it('un compte créé par un fichier de comptes, et celui créé depuis un fichier de contacts, le portent aussi', () => {
    const accounts = planUniversalChunk(
      context({ type: 'account', accountId: null, mapping: { Société: 'company_name' }, importJobId: JOB }),
      [{ line: 2, record: { Société: 'Acme' } }],
    )
    expect(accounts.creates[0]?.values).toMatchObject({ import_job_id: JOB })

    const fromContacts = planUniversalChunk(
      context({
        accountId: null,
        canCreateAccounts: true,
        importJobId: JOB,
        mapping: { 'Réf société': 'company_ref', Nom: 'full_name', Société: 'company' },
      }),
      [{ line: 2, record: { 'Réf société': 'CSOC1', Nom: 'Ada Lovelace', Société: 'Acme' } }],
    )
    expect(fromContacts.accountCreates[0]?.values).toMatchObject({ import_job_id: JOB })
  })

  it('sans identifiant d’import, aucune colonne n’est écrite (pas de null forcé sur une fiche)', () => {
    const plan = planUniversalChunk(context(), [{ line: 2, record: { Nom: 'Ada Lovelace' } }])
    expect(plan.creates[0]?.values).not.toHaveProperty('import_job_id')
  })
})

// #5222 — renversement daté de #4053.1 (Louis, 03/11/2026) : une société NOMMÉE sans référence est créée.
describe('#5222 — une société nommée sans référence CRM est créée (clé de rapprochement = le nom)', () => {
  const MAPPING = { Nom: 'full_name', Société: 'company', Secteur: 'company_sector' }
  const named = (overrides: Partial<UniversalPlanContext> = {}) =>
    context({ accountId: null, mapping: MAPPING, canCreateAccounts: true, ...overrides })

  it('société nommée inconnue : compte créé et contact rattaché, sans lien ni référence', () => {
    const ctx = named()
    const plan = planUniversalChunk(ctx, [
      { line: 2, record: { Nom: 'Ada Lovelace', Société: 'Acme', Secteur: 'Banque' } },
    ])
    expect(plan.issues).toEqual([])
    expect(plan.accountCreates).toHaveLength(1)
    const account = plan.accountCreates[0]
    expect(account?.values).toMatchObject({ company_name: 'Acme', sector: 'Banque', status: 'imported' })
    expect(plan.creates[0]?.values['account_id']).toBe(account?.id)
    expect(plan.links).toEqual([])
    expect(ctx.accountByRef.size).toBe(0)
    expect(ctx.refByAccount.size).toBe(0)
    expect(ctx.createdIds.has(account?.id ?? '')).toBe(true)
  })

  it('deux lignes qui nomment la même société font UN seul compte', () => {
    const plan = planUniversalChunk(named(), [
      { line: 2, record: { Nom: 'Ada Lovelace', Société: 'Acme SAS' } },
      { line: 3, record: { Nom: 'Grace Hopper', Société: 'ACME sas' } },
    ])
    expect(plan.accountCreates).toHaveLength(1)
    const id = plan.accountCreates[0]?.id
    expect(plan.creates.map(create => create.values['account_id'])).toEqual([id, id])
  })

  it('société déjà connue par nom : réutilisée, aucun doublon', () => {
    const plan = planUniversalChunk(named({ accountByName: new Map([['acme', ACCOUNT]]) }), [
      { line: 2, record: { Nom: 'Ada Lovelace', Société: 'ACME SAS' } },
    ])
    expect(plan.accountCreates).toEqual([])
    expect(plan.issues).toEqual([])
    expect(plan.creates[0]?.values['account_id']).toBe(ACCOUNT)
  })

  it('canCreateAccounts faux : toujours « company_to_validate », rien de créé', () => {
    const plan = planUniversalChunk(named({ canCreateAccounts: false }), [
      { line: 2, record: { Nom: 'Ada Lovelace', Société: 'Acme' } },
    ])
    expect(plan.accountCreates).toEqual([])
    expect(plan.issues).toEqual([
      { row: 2, kind: 'to_reconcile', reason: 'company_to_validate', existingId: null, label: 'Acme' },
    ])
  })

  it('aucune société nommée : toujours « unknown_company »', () => {
    const plan = planUniversalChunk(named(), [{ line: 2, record: { Nom: 'Ada Lovelace' } }])
    expect(plan.accountCreates).toEqual([])
    expect(plan.issues).toEqual([
      { row: 2, kind: 'rejected', reason: 'unknown_company', existingId: null, label: null },
    ])
  })
})
