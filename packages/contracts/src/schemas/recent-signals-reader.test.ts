import { describe, expect, it } from 'vitest'
import { dedupeNearIdenticalSignals, isRecentSignal, readRecentSignals } from './recent-signals-reader.js'

const NOW = Date.UTC(2026, 9, 9)

describe('readRecentSignals — #3928.a le lecteur UNIQUE de `recent_signals`', () => {
  it('lit la clé que le pipeline écrit (`signal`) AVANT les autres — même ordre que `signal_history`', () => {
    const [read] = readRecentSignals([{ signal: 'Nomination DSI', title: 'Titre presse', source: 'Les Échos' }])
    expect(read?.label).toBe('Nomination DSI')
  })

  it('retombe sur title/label/description/summary quand `signal` manque, et ignore une ligne sans libellé', () => {
    const read = readRecentSignals([
      { title: 'A' },
      { label: 'B' },
      { description: 'C' },
      { summary: 'D' },
      { date: '2026-01' },
      'x',
      null,
    ])
    expect(read.map(signal => signal.label)).toEqual(['A', 'B', 'C', 'D'])
  })

  it('garde l’index BRUT de chaque ligne (les identifiants stables des écrans en dépendent)', () => {
    const read = readRecentSignals([{ date: '2026' }, { signal: 'Deuxième' }])
    expect(read).toHaveLength(1)
    expect(read[0]?.index).toBe(1)
  })

  it('dédoublonne un même fait (même libellé, même source) — une seule règle pour tous les écrans', () => {
    const read = readRecentSignals([
      { signal: 'Levée de fonds', source: 'Presse' },
      { signal: 'Levée de fonds', source: 'Presse' },
      { signal: 'Levée de fonds', source: 'BODACC' },
    ])
    expect(read.map(signal => signal.source)).toEqual(['Presse', 'BODACC'])
  })

  it('transporte le lien vérifiable, jamais un lien deviné (`javascript:` → null)', () => {
    const [linked, unsafe] = readRecentSignals([
      { signal: 'Annonce', url: 'https://www.bodacc.fr/a/1', source_kind: 'bodacc' },
      { signal: 'Piège', url: 'javascript:alert(1)', source_kind: 'press' },
    ])
    expect(linked).toMatchObject({ source_url: 'https://www.bodacc.fr/a/1', source_kind: 'bodacc' })
    expect(unsafe).toMatchObject({ source_url: null, source_kind: null })
  })

  it('lit les deux orthographes de la lecture commerciale (blob IA camelCase, semis snake_case)', () => {
    const [camel, snake] = readRecentSignals([
      { signal: 'A', salesImplication: 'Pourquoi A' },
      { signal: 'B', sales_implication: 'Pourquoi B', impact: 'Groupe entier' },
    ])
    expect(camel?.sales_implication).toBe('Pourquoi A')
    expect(snake).toMatchObject({ sales_implication: 'Pourquoi B', impact: 'Groupe entier' })
  })

  it('une fraîcheur hors contrat devient `null`, jamais devinée', () => {
    const [read] = readRecentSignals([{ signal: 'A', freshness: 'brulant' }])
    expect(read?.freshness).toBeNull()
  })

  // #4020 / #4022 — le lieu d'une offre d'emploi, tel que collecté ; absent = `null`, jamais deviné.
  it('transporte le lieu collecté, `null` sans lieu', () => {
    const [withPlace, without] = readRecentSignals([
      { signal: 'Data engineer', location: ' Lyon ' },
      { signal: 'Dev', location: '  ' },
    ])
    expect(withPlace?.location).toBe('Lyon')
    expect(without?.location).toBeNull()
  })

  it('une entrée qui n’est pas une liste rend une liste vide', () => {
    expect(readRecentSignals(null)).toEqual([])
    expect(readRecentSignals({ signal: 'A' })).toEqual([])
  })
})

describe('isRecentSignal — #3928.1 un signal sans date n’est pas récent', () => {
  it('daté de moins de 24 mois (ou stampé `current`) : récent', () => {
    expect(isRecentSignal({ date: '2026-09-01' }, NOW)).toBe(true)
    expect(isRecentSignal({ freshness: 'current', date: '2026-09' }, NOW)).toBe(true)
  })

  it('sait dire NON : sans date, `undated`, archivé, résolu', () => {
    expect(isRecentSignal({}, NOW)).toBe(false)
    expect(isRecentSignal({ date: 'récemment' }, NOW)).toBe(false)
    expect(isRecentSignal({ freshness: 'undated', date: null }, NOW)).toBe(false)
    expect(isRecentSignal({ freshness: 'archive', date: '2021-03-10' }, NOW)).toBe(false)
    expect(isRecentSignal({ date: '2021-03-10' }, NOW)).toBe(false)
    expect(isRecentSignal({ date: '2026-09-01', history_status: 'resolved' }, NOW)).toBe(false)
  })

  it('#3928.2 — un tampon `RECENT` ne remplace pas la date : sans date lisible, jamais récent (BlaBlaCar)', () => {
    expect(isRecentSignal({ temporal_status: 'RECENT', date: null }, NOW)).toBe(false)
    expect(isRecentSignal({ temporal_status: 'RECENT', freshness: 'current', date: '' }, NOW)).toBe(false)
    expect(isRecentSignal({ last_verified_at: '2026-10-01T00:00:00Z', date: null }, NOW)).toBe(false)
    expect(isRecentSignal({ temporal_status: 'RECENT', date: '2026-09-01' }, NOW)).toBe(true)
  })
})

describe('readRecentSignals — #4044 une offre de STAGE n’est jamais un signal', () => {
  it('écarte une ligne de recrutement qui est un stage, garde l’alternance, les autres offres et les actualités', () => {
    const read = readRecentSignals([
      { signal: 'CS27 - Bac 5 - Stage Supply Chain H/F', type: 'recrutement', date: '2026-10-01' },
      { signal: 'Alternance Développeur', type: 'recrutement', date: '2026-10-01' },
      { signal: 'Architecte cloud', type: 'recrutement', date: '2026-10-01' },
      { signal: 'Programme de stage solidaire annoncé', type: 'other' },
    ])
    expect(read.map(signal => signal.label)).toEqual([
      'Alternance Développeur',
      'Architecte cloud',
      'Programme de stage solidaire annoncé',
    ])
    // l’index BRUT survit au filtre : les identifiants stables des écrans ne glissent pas
    expect(read.map(signal => signal.index)).toEqual([1, 2, 3])
  })
})

// #4182.5 — le demandeur d'une offre traverse le lecteur unique tel que la collecte l'a posé.
describe('readRecentSignals — requester (#4182.5)', () => {
  it('le dossier posé par la collecte est transmis, un autre type est ignoré', () => {
    const requester = { status: 'a_identifier', method: ['lire_offre'] }
    const read = readRecentSignals([
      { signal: 'Développeur Java', requester },
      { signal: 'Architecte cloud', requester: 'rien' },
      { signal: 'Chef de projet' },
    ])
    expect(read.map(signal => signal.requester)).toEqual([requester, null, null])
  })
})

// #4294.6 (#4142.5) — fiche Veolia : quatre titres quasi identiques répétés deux fois.
describe('readRecentSignals — #4294.6 les signaux quasi identiques ne s’affichent qu’une fois', () => {
  it('même titre à la ponctuation, la casse et l’accent près, même source : une ligne', () => {
    const read = readRecentSignals([
      { signal: 'Veolia : après 20 % de baisse…', source: 'Les Échos', date: '2026-10-01' },
      { signal: 'VEOLIA: apres 20% de baisse', source: 'les echos', date: '2026-10-01' },
    ])
    expect(read).toHaveLength(1)
    expect(read[0]?.label).toBe('Veolia : après 20 % de baisse…')
  })

  it('même titre, sources différentes mais dates proches : une ligne', () => {
    const read = readRecentSignals([
      { signal: 'Stéphane Caplier a été nommé DSI', source: 'LinkedIn', date: '2026-10-02' },
      { signal: 'Stéphane Caplier a été nommé DSI.', source: 'Les Échos', date: '2026-10-03' },
    ])
    expect(read).toHaveLength(1)
  })

  it('même titre, une source absente : le même fait', () => {
    const read = readRecentSignals([
      { signal: 'Architecte cloud', source: 'Welcome to the Jungle' },
      { signal: 'Architecte cloud' },
    ])
    expect(read).toHaveLength(1)
  })

  it('même titre mais deux faits distincts (sources et dates éloignées) : deux lignes', () => {
    const read = readRecentSignals([
      { signal: 'Levée de fonds', source: 'Les Échos', date: '2025-03-01' },
      { signal: 'Levée de fonds', source: 'LinkedIn', date: '2026-10-01' },
    ])
    expect(read).toHaveLength(2)
  })

  it('deux titres différents ne se confondent pas', () => {
    expect(readRecentSignals([{ signal: 'Nomination DSI' }, { signal: 'Nomination DAF' }])).toHaveLength(2)
  })
})

// #4294.6 — à l’ÉCRITURE : la même règle, sur la liste brute, sans toucher à la forme des lignes gardées.
describe('dedupeNearIdenticalSignals — #4294.6', () => {
  it('garde la première ligne brute de chaque fait, et laisse passer ce qu’il ne sait pas lire', () => {
    const first = { signal: 'Veolia : après 20 % de baisse', source: 'Les Échos', extra: 1 }
    const out = dedupeNearIdenticalSignals([
      first,
      { signal: 'Veolia: apres 20% de baisse', source: 'les echos' },
      'pas un objet',
      { signal: 'Autre fait' },
    ])
    expect(out).toEqual([first, 'pas un objet', { signal: 'Autre fait' }])
    expect(out[0]).toBe(first)
  })

  it('une valeur qui n’est pas une liste est rendue telle quelle', () => {
    expect(dedupeNearIdenticalSignals(null)).toBeNull()
  })
})

describe('readRecentSignals — rattachement d’une offre (#4437.5)', () => {
  it('lit le rattachement posé par la collecte, ou null — jamais recomposé', () => {
    const offer_attachment = {
      status: 'attached',
      fact_type: 'hiring',
      skills: ['React'],
      job_family: 'developpement',
      extract: 'Développeur React',
    }
    const read = readRecentSignals([
      { signal: 'Développeur React', offer_attachment },
      { signal: 'Collaborateur', offer_attachment: { status: 'unclassified', skills: [], extract: 'Collaborateur' } },
      { signal: 'Architecte cloud', offer_attachment: 'rien' },
      { signal: 'Chef de projet', offer_attachment: { status: 'inventé', skills: ['X'] } },
      { signal: 'Sans rien' },
    ])
    expect(read[0]?.offer_attachment).toEqual(offer_attachment)
    expect(read[1]?.offer_attachment).toEqual({
      status: 'unclassified',
      fact_type: null,
      skills: [],
      job_family: null,
      extract: 'Collaborateur',
    })
    expect(read.slice(2).map(signal => signal.offer_attachment)).toEqual([null, null, null])
  })
})
