import {
  contactFunctionTier,
  contactGeoTier,
  contactZoneStatus,
  employeesCount,
  orderBySellerFocus,
  sellerFocusFrom,
  sellerFocusTiers,
  withAccountSize,
  zoneSort,
} from './contact-seller-focus'

// LUDOVIC-C LC.1 — fiche STILL en prod (19/10) : 10 « contacts prioritaires » allemands,
// belges, néo-zélandais devant tout contact français de la zone du profil.
const industrial = sellerFocusFrom({
  offerDomain: 'industrial_engineering',
  geoZone: 'Lyon & Auvergne-Rhône-Alpes, PACA, BFC',
})

describe('LC.1 — sellerFocusFrom', () => {
  it("ne rend rien pour un espace IT sans zone : l'ordre d'avant, byte-identique", () => {
    expect(sellerFocusFrom({ offerDomain: 'esn_it' })).toBeNull()
    expect(sellerFocusFrom(null)).toBeNull()
  })
  it('lit TOUTES les zones du profil', () => {
    expect(industrial?.zoneTokens).toEqual(expect.arrayContaining(['lyon', 'auvergne rhone alpes', 'paca', 'bfc']))
    expect(industrial?.industrial).toBe(true)
  })
})

describe('LC.1 — contactGeoTier', () => {
  it('un contact still.de / still.co.nz est hors France, même sans lieu renseigné', () => {
    expect(
      contactGeoTier({ email: 'k.mueller@still.de', location: null, raw_data: null, title: 'CEO' }, industrial!),
    ).toBe(2)
    expect(
      contactGeoTier({ email: 'a@still.co.nz', location: null, raw_data: null, title: 'Manager' }, industrial!),
    ).toBe(2)
    expect(
      contactGeoTier({ email: null, location: 'Hamburg, Germany', raw_data: null, title: null }, industrial!),
    ).toBe(2)
  })
  it('un contact de Lyon est en zone ; un contact français hors zone ou sans lieu reste devant l’étranger', () => {
    expect(
      contactGeoTier({ email: 'j@still.fr', location: 'Lyon, France', raw_data: null, title: null }, industrial!),
    ).toBe(0)
    expect(
      contactGeoTier({ email: 'j@still.fr', location: 'Lille, France', raw_data: null, title: null }, industrial!),
    ).toBe(1)
    expect(contactGeoTier({ email: 'j@still.com', location: null, raw_data: null, title: null }, industrial!)).toBe(1)
  })
})

describe('LC.1 — contactFunctionTier (pack industriel)', () => {
  it('BE, direction technique, méthodes, qualité, maintenance, production, achats industriels devant', () => {
    for (const title of [
      'Responsable bureau d’études',
      'Directeur technique',
      'Responsable méthodes',
      'Quality Manager',
      'Responsable maintenance',
      'Directeur de production',
      'Acheteur industriel',
    ])
      expect(contactFunctionTier(title, industrial!)).toBe(0)
  })
  it('DSI, RH, contrôle de gestion derrière', () => {
    for (const title of [
      'DSI',
      'Directeur des systèmes d’information',
      'DRH',
      'Responsable ressources humaines',
      'Contrôleur de gestion',
    ])
      expect(contactFunctionTier(title, industrial!)).toBe(2)
  })
  // Recette 21/10 D.3 — « Compliance » passait avec les fonctions du pack : hors pack, derrière (jamais retirée, c76).
  it('conformité / juridique derrière aussi — ordre seulement, rien n’est retiré', () => {
    for (const title of ['Compliance Officer', 'Responsable conformité', 'Juriste', 'Legal Counsel'])
      expect(contactFunctionTier(title, industrial!)).toBe(2)
  })
  it('hors pack industriel, la fonction ne réordonne pas', () => {
    const it = sellerFocusFrom({ offerDomain: 'esn_it', geoZone: 'Paris & Île-de-France' })!
    expect(contactFunctionTier('DSI', it)).toBe(1)
  })
})

describe('LC.1 — orderBySellerFocus', () => {
  it('dit NON au top 10 étranger : la France en zone passe devant, tri stable, personne retiré', () => {
    const rows = [
      { id: 'de', email: 'ceo@still.de', location: null, raw_data: null, title: 'CEO' },
      { id: 'dsi', email: 'dsi@still.fr', location: 'Lyon', raw_data: null, title: 'DSI' },
      { id: 'nz', email: 'x@still.co.nz', location: null, raw_data: null, title: 'Plant Manager' },
      { id: 'be', email: 'resp@still.fr', location: 'Lyon', raw_data: null, title: 'Responsable bureau d’études' },
      { id: 'fr', email: 'm@still.fr', location: 'Paris', raw_data: null, title: 'Responsable méthodes' },
    ]
    const sorted = orderBySellerFocus(
      rows.map(r => ({ contact_id: r.id })),
      rows,
      industrial,
    )
    expect(sorted.map(s => s.contact_id)).toEqual(['be', 'dsi', 'fr', 'nz', 'de'])
  })
  it('sans focus : liste inchangée', () => {
    const items = [{ contact_id: 'a' }, { contact_id: 'b' }]
    expect(orderBySellerFocus(items, [], null)).toBe(items)
  })
})

describe('LC.1 — le noyau rankAccountContacts suit le rang de périmètre AVANT la coupe à dix', () => {
  const base = {
    entity: null,
    decision_role: 'decision_maker',
    email_verified: false,
    phone: null,
    linkedin_url: null,
    source: 'apollo',
    user_status: 'new',
    email_sent_at: null,
    last_enrichment_at: null,
    priority: 3,
    demo_seed_first_door: false,
  }
  // Douze homologues allemands à rôle égal + un responsable méthodes à Lyon.
  const foreign = Array.from({ length: 12 }, (_, i) => ({
    ...base,
    id: `de-${String(i).padStart(2, '0')}`,
    title: 'Responsable méthodes',
    email: `m${i}@still.de`,
    location: null,
    raw_data: null,
  }))
  const lyon = {
    ...base,
    id: 'lyon',
    title: 'Responsable méthodes',
    email: 'm@still.fr',
    location: 'Lyon',
    raw_data: null,
  }
  const rows = [...foreign, lyon]
  it('sans rang : le Lyonnais est hors des dix (le constat de prod)', () => {
    const { rankAccountContacts } = jest.requireActual('./contact-ranking')
    const ids = rankAccountContacts(rows, null, {}).ranked.map((r: { contact_id: string }) => r.contact_id)
    expect(ids).not.toContain('lyon')
  })
  it('avec le rang du profil industriel : le Lyonnais ouvre le chemin', () => {
    const { rankAccountContacts } = jest.requireActual('./contact-ranking')
    const { sellerFocusTiers } = jest.requireActual('./contact-seller-focus')
    const ranked = rankAccountContacts(
      rows,
      null,
      {},
      undefined,
      undefined,
      undefined,
      sellerFocusTiers(rows, industrial),
    )
    expect(ranked.ranked[0].contact_id).toBe('lyon')
    expect(ranked.ranked).toHaveLength(10)
  })
})

// LUDOVIC-E LC.1 — le n°1 de STILL était « Head of Service Process Development ITS EMEA » devant un
// responsable BE / méthodes : le mot « process » seul suffisait à l'ranger parmi les fonctions du pack.
describe('LC.1 — « process » seul n’est pas une fonction du pack', () => {
  it('un responsable de développement de processus de service passe derrière BE / méthodes / qualité', () => {
    expect(contactFunctionTier('Head of Service Process Development ITS EMEA', industrial!)).toBe(1)
    expect(contactFunctionTier('Responsable Bureau d’Études', industrial!)).toBe(0)
    expect(contactFunctionTier('Responsable méthodes', industrial!)).toBe(0)
  })
  it('un ingénieur process industriel reste dans le pack', () => {
    expect(contactFunctionTier('Ingénieur process', industrial!)).toBe(0)
    expect(contactFunctionTier('Process engineer', industrial!)).toBe(0)
  })
})

// #4432.4 — la zone du profil se NOMME sur chaque contact : en zone, hors zone, ou « lieu absent » (jamais deviné).
describe('#4432.4 — contactZoneStatus', () => {
  it('un contact de Lyon est en zone', () => {
    expect(
      contactZoneStatus({ email: 'j@still.fr', location: 'Lyon, France', raw_data: null, title: null }, industrial!),
    ).toBe('in_zone')
  })
  it('un lieu connu hors de la zone (Lille, Hamburg) est hors zone', () => {
    expect(
      contactZoneStatus({ email: 'j@still.fr', location: 'Lille, France', raw_data: null, title: null }, industrial!),
    ).toBe('out_of_zone')
    expect(
      contactZoneStatus({ email: null, location: 'Hamburg, Germany', raw_data: null, title: null }, industrial!),
    ).toBe('out_of_zone')
  })
  it('un lieu absent se dit « lieu absent » : ni en zone, ni hors zone', () => {
    expect(contactZoneStatus({ email: 'j@still.com', location: null, raw_data: null, title: null }, industrial!)).toBe(
      'place_absent',
    )
    expect(contactZoneStatus({ email: null, location: '  ', raw_data: {}, title: null }, industrial!)).toBe(
      'place_absent',
    )
  })
  it('dit NON : sans zone dans le profil (pack seul), aucun statut — rien n’est nommé hors d’une zone inexistante', () => {
    const noZone = sellerFocusFrom({ offerDomain: 'industrial_engineering' })!
    expect(contactZoneStatus({ email: null, location: 'Lille', raw_data: null, title: null }, noZone)).toBeNull()
    expect(contactZoneStatus({ email: null, location: 'Lille', raw_data: null, title: null }, null)).toBeNull()
  })
})

// #4983.1 — un profil « France » (aucun lieu précis) classait les étrangers comme les autres : NON_ZONE_WORDS
// vidait les jetons de zone, le focus restait null et aucune rétrogradation ne partait.
describe('#4983 — profil « France » : les contacts hors France passent en dernier, personne n’est retiré', () => {
  const france = sellerFocusFrom({ offerDomain: 'esn_it', geoZone: 'France' })
  const rows = [
    { id: 'de', email: 'k@acme.de', location: 'Berlin, Germany', title: 'DSI', raw_data: null },
    { id: 'fr1', email: null, location: 'Lyon', title: 'DSI', raw_data: null },
    { id: 'be', email: 'x@acme.be', location: null, title: 'DSI', raw_data: null },
    { id: 'fr2', email: null, location: null, title: 'DSI', raw_data: null },
  ]
  const sorted = rows.map(row => ({ contact_id: row.id }))

  it('rend un focus pour la zone « France », sans jeton de zone (rien n’est nommé à l’écran)', () => {
    expect(france).not.toBeNull()
    expect(france?.zoneTokens).toEqual([])
    expect(contactZoneStatus(rows[0]!, france)).toBeNull()
  })
  it('range les étrangers en dernier, l’ordre d’avant est gardé entre égaux, 4 contacts restent 4', () => {
    const out = orderBySellerFocus(sorted, rows, france).map(item => item.contact_id)
    expect(out).toEqual(['fr1', 'fr2', 'de', 'be'])
  })
  it('« Europe » ou « International » ne rétrograde personne : ordre d’avant, byte-identique', () => {
    expect(sellerFocusFrom({ offerDomain: 'esn_it', geoZone: 'Europe' })).toBeNull()
    expect(sellerFocusFrom({ offerDomain: 'esn_it', geoZone: 'International' })).toBeNull()
  })
})

// #4984.1 — le niveau hiérarchique ciblé suit la taille du compte (ORDRE seulement).
describe('#4984 — niveau ciblé selon l’effectif du compte', () => {
  it('lit l’effectif libre du compte, ou null (« non mesuré » n’est jamais 0)', () => {
    expect(employeesCount('500')).toBe(500)
    expect(employeesCount('50 000+')).toBe(50000)
    expect(employeesCount('1 000 - 5 000 salariés')).toBe(3000)
    expect(employeesCount(null)).toBeNull()
    expect(employeesCount('')).toBeNull()
    expect(employeesCount('inconnu')).toBeNull()
    expect(employeesCount('0')).toBeNull()
  })
  const rows = [
    { id: 'ceo', email: null, location: null, title: 'Directeur général', raw_data: null },
    { id: 'dsi', email: null, location: null, title: 'Directeur des systèmes d’information', raw_data: null },
    { id: 'mgr', email: null, location: null, title: 'Responsable infrastructure', raw_data: null },
    { id: 'dev', email: null, location: null, title: 'Développeur', raw_data: null },
  ]
  const sorted = rows.map(row => ({ contact_id: row.id }))
  const order = (employees: string | null) =>
    orderBySellerFocus(sorted, rows, withAccountSize(null, employees)).map(item => item.contact_id)

  it('PME (< 1 000) : la direction d’abord, le COMEX ensuite', () => {
    expect(order('500').slice(0, 2)).toEqual(['dsi', 'ceo'])
  })
  it('palier intermédiaire (1 000 – 10 000) : direction puis management, COMEX après', () => {
    expect(order('3 000').slice(0, 3)).toEqual(['dsi', 'mgr', 'ceo'])
  })
  it('grand compte (> 10 000) : le management d’abord, le COMEX en dernier niveau connu', () => {
    const out = order('20 000')
    expect(out[0]).toBe('mgr')
    expect(out.indexOf('ceo')).toBeGreaterThan(out.indexOf('dsi'))
  })
  it('personne n’est retiré, et l’effectif inconnu garde l’ordre d’avant', () => {
    expect(order('20 000')).toHaveLength(4)
    expect(order(null)).toEqual(['ceo', 'dsi', 'mgr', 'dev'])
    expect(sellerFocusTiers(rows, withAccountSize(null, null))).toBeNull()
  })
})

// #4982.1 — le tri « zone » SQL reprend les paliers de contactGeoTier ; le lieu inconnu est TOUJOURS le dernier palier.
describe('#4982.1 — zoneSort', () => {
  it('un jeton de zone par paramètre lié (jamais interpolé), en zone = palier 0', () => {
    const { tier, params } = zoneSort(industrial)
    expect(Object.values(params)).toEqual(expect.arrayContaining(['%lyon%', '%paca%']))
    expect(tier).toMatch(/THEN 0/)
    // #4982.3b — « lyon » figure désormais au référentiel FERMÉ des villes : c'est le JETON du profil qui ne s'interpole pas.
    expect(tier).not.toContain('%lyon%')
  })
  it('sans zone au profil : pas de palier 0, le lieu inconnu reste le dernier (3)', () => {
    const { tier, params } = zoneSort(null)
    expect(params).toEqual({})
    expect(tier).not.toMatch(/THEN 0/)
    expect(tier).toMatch(/= '' THEN 3/)
  })
  // #4982 — région d'abord (Louis 31/10)
  it('la région du vendeur est le palier 0 : ses départements, liés en paramètres (référentiel des contrats)', () => {
    const focus = sellerFocusFrom({ offerDomain: 'esn_it', geoZone: 'Hauts-de-France' })
    const { tier, params } = zoneSort(focus)
    expect(tier).toMatch(/THEN 0/)
    expect(tier).toContain(':zoneRegion0')
    expect(params['zoneRegion0']).toBe('hauts_de_france')
  })
  it('la région du contact se lit au département de son code postal ; sans code postal = NULL (jamais devinée)', () => {
    const { region } = zoneSort(null)
    expect(region).toMatch(/WHEN '59'.*THEN 'hauts_de_france'|IN \([^)]*'59'[^)]*\) THEN 'hauts_de_france'/s)
    expect(region).not.toMatch(/ELSE '/)
  })
})

describe('#4432.4 / #4556.4 — la zone du profil NOMMÉE', () => {
  it('sellerFocusFrom garde le libellé de zone déclaré par le profil', () => {
    const focus = sellerFocusFrom({ offerDomain: 'esn_it', geoZone: 'Paris & Île-de-France, Toulouse & Occitanie' })
    expect(focus?.zoneLabel).toBe('Paris & Île-de-France, Toulouse & Occitanie')
  })

  it('dit NON : un profil sans zone nommable (France, remote) ne porte aucun libellé de zone', () => {
    const focus = sellerFocusFrom({ offerDomain: 'industrial_engineering', geoZone: 'France, Europe' })
    expect(focus?.zoneLabel).toBeNull()
  })
})
