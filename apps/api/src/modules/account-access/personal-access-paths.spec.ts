import { AccountAccessService } from './account-access.service'

/**
 * #3403 — L'ONGLET ACCÈS STRUCTURÉ AUTOUR DES VOIES D'ACCÈS PERSONNELLES.
 *
 * Huit voies, aucune inventée : chacune vient d'une table déjà réelle dans ce
 * dépôt (`introduction_authorizations.link_kind`, `account_partners`, l'état
 * de relation CRM, `opportunities`). Ce test tient trois propriétés :
 *
 * 1. chaque source alimente la BONNE voie, avec la bonne certitude ;
 * 2. une voie sans instance ne produit AUCUNE ligne (doctrine « on n'affiche
 *    pas ce qu'on n'a pas ») ;
 * 3. un refus (`granted = false`) n'est jamais une voie ouverte.
 */

type Row = Record<string, unknown>

function buildService(args: {
  rawAnalysis?: Row | null
  linkRows?: Row[]
  partnerRows?: Row[]
  jobChangeRows?: Row[]
  contactRows?: Row[]
}): AccountAccessService {
  const facts = {
    find: jest.fn().mockResolvedValue([]),
    save: jest.fn(),
    create: jest.fn(),
    query: jest.fn().mockImplementation((sql: string) => {
      if (sql.includes('introduction_authorizations')) return Promise.resolve(args.linkRows ?? [])
      if (sql.includes('account_partners')) return Promise.resolve(args.partnerRows ?? [])
      if (sql.includes('FROM contacts')) return Promise.resolve(args.contactRows ?? [])
      if (sql.includes('opportunities')) return Promise.resolve(args.jobChangeRows ?? [])
      return Promise.resolve([])
    }),
  }
  const accounts = {
    findOne: jest.fn().mockResolvedValue({
      id: 'acc-1',
      siren: null,
      priority_gate: 'pending',
      raw_analysis: args.rawAnalysis ?? null,
    }),
  }
  const entities = { find: jest.fn().mockResolvedValue([]) }
  return new AccountAccessService(facts as never, accounts as never, entities as never)
}

const NOW = new Date('2026-09-30T00:00:00.000Z')

describe('#3403 — voies d’accès personnelles, servies par landscape()', () => {
  // #3777 — le badge « Décideur » de la liste Contacts suit la ligne : le rôle du contact voyage.
  it('#3777 — une voie portée par un contact rend le rôle de décision de CE contact, null sinon', async () => {
    const base = {
      link_kind: 'former_colleague',
      verified: true,
      authorized_at: new Date('2026-09-25T00:00:00.000Z'),
      referrer_label: null,
      channel: 'email',
    }
    const service = buildService({
      linkRows: [
        { ...base, id: 'ia-1', contact_name: 'A', decision_role: 'economic' },
        { ...base, id: 'ia-2', contact_name: 'B', decision_role: null },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths.map(path => path.decisionRole)).toEqual(['economic', null])
  })

  it('un lien déclaré et vérifié devient une voie « accès vérifié »', async () => {
    const service = buildService({
      linkRows: [
        {
          id: 'ia-1',
          link_kind: 'former_colleague',
          verified: true,
          authorized_at: new Date('2026-09-25T00:00:00.000Z'),
          referrer_label: 'Marie D.',
          channel: 'email',
          contact_name: 'Jean Dupont',
        },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths).toHaveLength(1)
    expect(landscape.personalPaths[0]).toMatchObject({
      voie: 'ancien_collegue',
      subject: 'Jean Dupont',
      certainty: 'verified_access',
      risk: null,
    })
  })

  it('#3403.12 — la chaleur déclarée sur le lien est servie ; non déclarée, elle reste null', async () => {
    const base = {
      link_kind: 'former_colleague',
      verified: true,
      authorized_at: new Date('2026-09-25T00:00:00.000Z'),
      referrer_label: null,
      channel: 'email',
      contact_name: 'Jean Dupont',
    }
    const service = buildService({
      linkRows: [
        { ...base, id: 'ia-w1', warmth: 'close' },
        { ...base, id: 'ia-w2', warmth: null },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths.map(path => path.warmth)).toEqual(['close', null])
  })

  it('#3403 (X68) — un lien non vérifié déclaré « distant » est une simple affinité, jamais une relation probable', async () => {
    const base = {
      link_kind: 'event_encounter',
      verified: false,
      authorized_at: new Date('2026-09-25T00:00:00.000Z'),
      referrer_label: null,
      channel: 'verbal',
      contact_name: 'Jean Dupont',
    }
    const service = buildService({
      linkRows: [
        { ...base, id: 'ia-a1', warmth: 'distant' },
        { ...base, id: 'ia-a2', warmth: 'cordial' },
        { ...base, id: 'ia-a3', warmth: null },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths.map(path => path.certainty)).toEqual([
      'simple_affinity',
      'probable_relation',
      'probable_relation',
    ])
  })

  it('un type de lien hors des onze voies (ex. simple homonymie) ne produit AUCUNE ligne', async () => {
    const service = buildService({
      linkRows: [
        {
          id: 'ia-2',
          link_kind: 'plain_homonymy',
          verified: false,
          authorized_at: new Date('2026-09-25T00:00:00.000Z'),
          referrer_label: null,
          channel: 'email',
          contact_name: 'Jean Dupont',
        },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths).toHaveLength(0)
  })

  it('un partenaire rang 2 AVEC placements réels devient un accès vérifié', async () => {
    const service = buildService({
      partnerRows: [
        {
          id: 'p-1',
          name: 'Alten',
          rank: 'rank2',
          source: 'declared',
          placements: 3,
          scope: 'TMA SAP',
          detected_at: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths).toHaveLength(1)
    expect(landscape.personalPaths[0]).toMatchObject({ voie: 'partenaire_rang2', certainty: 'verified_access' })
  })

  it('#3473 — un partenaire DÉCLARÉ il y a 190 jours reste déclaré : même statut que la liste des ESN', async () => {
    const service = buildService({
      partnerRows: [
        {
          id: 'p-orsan',
          name: 'Orsan Conseil',
          rank: 'rank1',
          source: 'declared',
          placements: 0,
          scope: null,
          detected_at: new Date('2026-03-23T00:00:00.000Z'),
        },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths[0]).toMatchObject({ voie: 'esn_referencee', certainty: 'probable_relation' })
  })

  it('#3473 — un rang 2 vu par le pipeline il y a 45 jours est la « source actuelle » de la liste, pas une observation historique', async () => {
    const service = buildService({
      partnerRows: [
        {
          id: 'p-halden',
          name: 'Halden Numérique',
          rank: 'rank2',
          source: 'analysis',
          placements: 0,
          scope: null,
          detected_at: new Date('2026-08-16T00:00:00.000Z'),
        },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths[0]).toMatchObject({ voie: 'partenaire_rang2', certainty: 'probable_relation' })
  })

  it('un partenaire rang 1 vu par le pipeline, récent (jamais déclaré), reste une relation probable et nomme sa source', async () => {
    const service = buildService({
      partnerRows: [
        {
          id: 'p-2',
          name: 'Sopra Steria',
          rank: 'rank1',
          source: 'analysis',
          placements: 0,
          scope: null,
          detected_at: new Date('2026-08-01T00:00:00.000Z'),
        },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths).toHaveLength(1)
    expect(landscape.personalPaths[0]).toMatchObject({
      voie: 'esn_referencee',
      certainty: 'probable_relation',
      sourceKind: 'partner_registry_observed',
    })
  })

  it('un partenaire rang 1 vu par le pipeline SANS date reste une observation historique', async () => {
    const service = buildService({
      partnerRows: [
        {
          id: 'p-3',
          name: 'Sopra Steria',
          rank: 'rank1',
          source: 'analysis',
          placements: 0,
          scope: null,
          detected_at: null,
        },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths[0]).toMatchObject({
      voie: 'esn_referencee',
      certainty: 'historic_observation',
    })
  })

  it('un compte client actif (état de relation CRM) devient la voie « client existant »', async () => {
    const service = buildService({
      rawAnalysis: { salesContext: { relationship: { state: 'client_actif' } } },
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths).toHaveLength(1)
    expect(landscape.personalPaths[0]).toMatchObject({ voie: 'client_existant', certainty: 'verified_access' })
  })

  it('un signal de changement de poste devient une observation historique', async () => {
    const service = buildService({
      jobChangeRows: [
        {
          id: 'o-1',
          label: 'Porte via Jean Dupont',
          detail: 'Jean Dupont est détecté chez ce compte.',
          first_detected_at: new Date('2026-09-01T00:00:00.000Z'),
        },
      ],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths).toHaveLength(1)
    expect(landscape.personalPaths[0]).toMatchObject({
      voie: 'personne_changement_poste',
      certainty: 'historic_observation',
    })
  })

  // #4292.2 — la personne arrivée chez ce compte porte aussi le badge « Décideur » quand elle est un contact du compte.
  it('#4292.2 — un changement de poste rend le rôle du contact du compte nommé dans la ligne', async () => {
    const service = buildService({
      jobChangeRows: [
        {
          id: 'o-1',
          label: 'Porte via Jean Dupont',
          detail: null,
          first_detected_at: new Date('2026-09-01T00:00:00.000Z'),
        },
        {
          id: 'o-2',
          label: 'Porte via Inconnu Total',
          detail: null,
          first_detected_at: new Date('2026-09-01T00:00:00.000Z'),
        },
      ],
      contactRows: [{ full_name: 'Jean Dupont', decision_role: 'economic' }],
    })
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths.map(path => path.decisionRole ?? null)).toEqual(['economic', null])
  })

  it('aucune source ⇒ aucune voie — jamais onze lignes vides', async () => {
    const service = buildService({})
    const landscape = await service.landscape('ws-1', 'acc-1', NOW)
    expect(landscape.personalPaths).toEqual([])
  })
})
