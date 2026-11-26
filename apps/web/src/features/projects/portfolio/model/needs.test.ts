import { describe, expect, it } from 'vitest'
import type { AccountNeedsRow } from '@bellum/contracts'
import {
  buildAccountNeeds,
  buildNeedsStats,
  filterAccountNeeds,
  groupNeedsByKind,
  normalizeUrgency,
  splitNeedsByConfidence,
  splitPreviewNeeds,
  type AccountNeeds,
} from './needs'

function row(overrides: Partial<AccountNeedsRow> = {}): AccountNeedsRow {
  return {
    account_id: '11111111-1111-1111-1111-111111111111',
    company_name: 'Doctolib',
    sector: 'Santé',
    score: 8.4,
    updated_at: '2026-07-01T10:00:00.000Z',
    it_implications: null,
    pains: [],
    it_challenges: [],
    programs: [],
    angles: [],
    ...overrides,
  }
}

describe('buildAccountNeeds', () => {
  it('maps a pain to a need carrying its impact, ESN offer and urgency', () => {
    const [entry] = buildAccountNeeds([
      row({
        pains: [
          {
            pain: 'Scalabilité de la plateforme',
            business_impact: 'Pannes en heure de pointe',
            esn_offer: 'TMA / SRE',
            urgency: 'haute',
          },
        ],
      }),
    ])

    expect(entry?.needs).toHaveLength(1)
    expect(entry?.needs[0]).toMatchObject({
      kind: 'pain',
      label: 'Scalabilité de la plateforme',
      detail: 'Pannes en heure de pointe',
      offer: 'TMA / SRE',
      urgency: 'high',
    })
    expect(entry?.topUrgency).toBe('high')
    expect(entry?.offers).toEqual(['TMA / SRE'])
  })

  it('reads legacy camelCase keys written before snake_case normalization', () => {
    const [entry] = buildAccountNeeds([
      row({
        pains: [{ pain: 'Dette technique', businessImpact: 'Time-to-market', esnOffer: 'Refonte' } as never],
      }),
    ])

    expect(entry?.needs[0]).toMatchObject({ detail: 'Time-to-market', offer: 'Refonte' })
  })

  it('maps IT challenges (severity as the urgency axis) and programmes with their budget', () => {
    const [entry] = buildAccountNeeds([
      row({
        it_challenges: [
          { title: 'Migration cloud', description: 'Legacy on-prem', severity: 'critique', timeframe: '6 mois' },
        ],
        programs: [{ name: 'Programme Data 2027', budget: '12 M€', description: 'Plateforme data' }],
      }),
    ])

    expect(entry?.needs.map(need => need.kind)).toEqual(['challenge', 'program'])
    expect(entry?.needs[0]).toMatchObject({ label: 'Migration cloud', urgency: 'high', timeframe: '6 mois' })
    expect(entry?.needs[1]?.detail).toBe('12 M€ · Plateforme data')
  })

  it('turns it_implications into a single need and attaches the first attack-angle offer', () => {
    const [entry] = buildAccountNeeds([
      row({
        it_implications: 'Industrialisation des modèles ML',
        angles: [{ angle: 'MLOps', offer: 'Data engineering' }],
      }),
    ])

    expect(entry?.needs[0]).toMatchObject({
      kind: 'implication',
      label: 'Industrialisation des modèles ML',
      offer: 'Data engineering',
      urgency: 'unknown',
    })
  })

  it('dedupes a need surfacing both as a pain and an IT challenge, keeping the offer', () => {
    const [entry] = buildAccountNeeds([
      row({
        pains: [{ pain: 'Migration cloud', esn_offer: null, urgency: 'moyenne' }],
        it_challenges: [{ title: '  migration   Cloud ', severity: 'faible' }],
      }),
    ])

    expect(entry?.needs).toHaveLength(1)
    expect(entry?.needs[0]?.kind).toBe('pain')
  })

  it('drops entries with no usable need and sorts accounts by urgency then score', () => {
    const entries = buildAccountNeeds([
      row({ account_id: '22222222-2222-2222-2222-222222222222', company_name: 'Vide', pains: [{ pain: '   ' }] }),
      row({
        account_id: '33333333-3333-3333-3333-333333333333',
        company_name: 'Moyen',
        score: 9.5,
        pains: [{ pain: 'A', urgency: 'moyenne' }],
      }),
      row({
        account_id: '44444444-4444-4444-4444-444444444444',
        company_name: 'Urgent',
        score: 6,
        pains: [{ pain: 'B', urgency: 'critique' }],
      }),
    ])

    expect(entries.map(entry => entry.companyName)).toEqual(['Urgent', 'Moyen'])
  })

  // #4340 — les pistes vivent dans Signaux, « ordonnées par pertinence et date, pas par ordre alphabétique ».
  it('à pertinence égale, la piste la plus RÉCENTE passe devant — jamais l’ordre alphabétique', () => {
    const same = { score: 7, pains: [{ pain: 'A', urgency: 'moyenne' }] }
    const entries = buildAccountNeeds([
      row({
        ...same,
        account_id: '55555555-5555-5555-5555-555555555555',
        company_name: 'Airbus',
        updated_at: '2026-09-01T00:00:00.000Z',
      }),
      row({
        ...same,
        account_id: '66666666-6666-6666-6666-666666666666',
        company_name: 'Zodiac',
        updated_at: '2026-10-18T00:00:00.000Z',
      }),
      row({ ...same, account_id: '77777777-7777-7777-7777-777777777777', company_name: 'Michelin', updated_at: null }),
    ])

    expect(entries.map(entry => entry.companyName)).toEqual(['Zodiac', 'Airbus', 'Michelin'])
  })
})

describe('buildNeedsStats', () => {
  it('counts accounts, needs, urgent NEEDS (not accounts) and accounts with no ESN offer', () => {
    const entries: AccountNeeds[] = buildAccountNeeds([
      row({
        pains: [
          { pain: 'A', urgency: 'critique', esn_offer: 'Cloud' },
          { pain: 'A2', urgency: 'haute' },
        ],
      }),
      row({
        account_id: '55555555-5555-5555-5555-555555555555',
        company_name: 'Qonto',
        pains: [{ pain: 'B' }, { pain: 'C' }],
      }),
    ])

    expect(buildNeedsStats(entries)).toEqual({
      accounts: 2,
      needs: 4,
      buyingSignals: 0,
      urgentNeeds: 2,
      accountsWithoutOffer: 1,
    })
  })
})

describe('splitPreviewNeeds', () => {
  const entry = buildAccountNeeds([
    row({ pains: [{ pain: 'A' }, { pain: 'B' }, { pain: 'C' }, { pain: 'D' }, { pain: 'E' }] }),
  ])[0] as AccountNeeds

  it('keeps the three strongest needs in the row and counts the rest', () => {
    const { preview, remaining } = splitPreviewNeeds(entry)
    expect(preview.map(need => need.label)).toEqual(['A', 'B', 'C'])
    expect(remaining).toBe(2)
  })

  it('reports no remainder when the account has three needs or fewer', () => {
    const short = buildAccountNeeds([row({ pains: [{ pain: 'A' }] })])[0] as AccountNeeds
    expect(splitPreviewNeeds(short)).toEqual({ preview: short.needs, remaining: 0 })
  })
})

/**
 * ⚠️ LA DÉFINITION A CHANGÉ LE 03/09/2026, ET C'EST LE SUJET DE CES TESTS.
 *
 * Ce décompte retenait `pain` + `challenge` + `program` (« repose sur un fait
 * sourcé »). Mesuré en production sur la carte de BlaBlaCar, à quarante pixels
 * d'écart : « 14 opportunités détectées : **7 confirmées** » au-dessus de
 * « **2 besoins confirmés** à traiter », et deux badges verts seulement dans la
 * liste — trois lectures du même mot sur la même carte.
 *
 * Il lit maintenant `maturityOfStage`, la table que les onglets, les badges et
 * le geste prioritaire lisent déjà : **seul un besoin EXPRIMÉ est confirmé**,
 * parce que lui seul repose sur une parole. Un chantier IT lu dans la presse est
 * sourcé ; il n'est pas confirmé par le client.
 */
describe('splitNeedsByConfidence', () => {
  it('ne compte comme confirmé que ce que quelqu’un a EXPRIMÉ — un chantier sourcé reste à qualifier', () => {
    const entry = buildAccountNeeds([
      row({
        pains: [{ pain: 'A' }, { pain: 'B' }],
        it_challenges: [{ title: 'Migration' }],
        it_implications: 'Déduction ESN',
      }),
    ])[0] as AccountNeeds

    // Deux douleurs exprimées = confirmées ; le chantier IT et la déduction
    // rejoignent « à qualifier ». Avant le 03/09 ce cas rendait 3 / 1, et la
    // carte annonçait un chantier de presse comme une demande du client.
    expect(splitNeedsByConfidence(entry.needs)).toEqual({ confirmed: 2, toQualify: 2 })
  })

  it('reports zero to-qualify when nothing is inferred', () => {
    const entry = buildAccountNeeds([row({ pains: [{ pain: 'A' }] })])[0] as AccountNeeds
    expect(splitNeedsByConfidence(entry.needs)).toEqual({ confirmed: 1, toQualify: 0 })
  })

  it('is empty-safe', () => {
    expect(splitNeedsByConfidence([])).toEqual({ confirmed: 0, toQualify: 0 })
  })
})

describe('groupNeedsByKind', () => {
  it('groups needs by source, ordered by strength of evidence, dropping empty groups', () => {
    const entry = buildAccountNeeds([
      row({
        pains: [{ pain: 'Scalabilité' }],
        programs: [{ name: 'Programme Data' }],
        it_challenges: [{ title: 'Cyber' }, { title: 'Cloud' }],
      }),
    ])[0] as AccountNeeds

    expect(groupNeedsByKind(entry.needs).map(group => [group.kind, group.needs.length])).toEqual([
      ['pain', 1],
      ['challenge', 2],
      ['program', 1],
    ])
  })
})

describe('filterAccountNeeds', () => {
  const entries = buildAccountNeeds([
    row({ pains: [{ pain: 'Scalabilité', esn_offer: 'SRE' }], it_challenges: [{ title: 'Cybersécurité' }] }),
    row({ account_id: '66666666-6666-6666-6666-666666666666', company_name: 'Qonto', pains: [{ pain: 'KYC' }] }),
  ])

  it('ne garde que le STADE demandé, et laisse tomber les comptes vidés', () => {
    // Le filtre porte désormais le NIVEAU DE MATURITÉ (#1330, 3/7), pas
    // l'étape : « Cybersécurité » est un chantier lu dans les actualités, donc
    // un projet plausible — rangé sous « opportunités à creuser ».
    const filtered = filterAccountNeeds(entries, 'to_dig', '')
    expect(filtered).toHaveLength(1)
    expect(filtered[0]?.needs.map(need => need.label)).toEqual(['Cybersécurité'])
  })

  it('remonte le plus engageant en tête d’un même compte', () => {
    // Sur un compte qui porte à la fois une demande exprimée et un chantier
    // déduit, c'est la demande qu'il faut lire en premier : elle est la seule
    // sur laquelle quelqu'un s'est exprimé.
    const [first] = filterAccountNeeds(entries, 'all', '')
    expect(first?.needs[0]?.label).toBe('Scalabilité')
  })

  it('réserve « demande confirmée » à ce qui a été exprimé', () => {
    const confirmed = filterAccountNeeds(entries, 'confirmed', '')
    const labels = confirmed.flatMap(entry => entry.needs.map(need => need.label))
    expect(labels).toContain('Scalabilité')
    expect(labels).not.toContain('Cybersécurité')
  })

  it('matches the query against company, sector, label, detail and offer', () => {
    expect(filterAccountNeeds(entries, 'all', 'qonto').map(entry => entry.companyName)).toEqual(['Qonto'])
    expect(filterAccountNeeds(entries, 'all', 'sre')[0]?.needs.map(need => need.label)).toEqual(['Scalabilité'])
    expect(filterAccountNeeds(entries, 'all', 'introuvable')).toEqual([])
  })
})

describe('normalizeUrgency', () => {
  it('normalizes FR/EN wordings, accents included', () => {
    expect(normalizeUrgency('Élevée')).toBe('high')
    expect(normalizeUrgency('HIGH')).toBe('high')
    expect(normalizeUrgency('modérée')).toBe('medium')
    expect(normalizeUrgency('low')).toBe('low')
  })

  it('never invents an urgency the IA did not provide', () => {
    expect(normalizeUrgency(null)).toBe('unknown')
    expect(normalizeUrgency('  ')).toBe('unknown')
    expect(normalizeUrgency('bizarre')).toBe('unknown')
    expect(normalizeUrgency(3)).toBe('unknown')
  })
})

/**
 * 5ᵉ nature du graphe (§6) : le signal d'achat entre dans l'écran Besoins sans
 * jamais être compté comme un besoin. C'est là que se joue l'honnêteté des
 * compteurs — « 11 besoins identifiés » ne doit pas gonfler de dépêches de presse.
 */
describe('signaux d’achat — la 5ᵉ nature', () => {
  const withSignals = () =>
    buildAccountNeeds([
      row({
        pains: [{ pain: 'Migration ERP', urgency: 'haute', esn_offer: 'Cloud' }],
        signals: [
          { title: 'Levée de fonds de 50 M€', source: 'Les Échos', date: '2026-07-12', salesImplication: 'Budget IT' },
          { label: 'Nomination d’un CTO' },
          { title: '   ' },
        ],
      }),
    ])

  it('rattache les signaux au compte, sous leur propre nature', () => {
    const kinds = withSignals()[0]!.needs.map(need => need.kind)
    expect(kinds.filter(kind => kind === 'signal')).toHaveLength(2)
  })

  it('ignore un signal sans libellé — jamais de ligne vide', () => {
    expect(withSignals()[0]!.needs).toHaveLength(3)
  })

  it('cite ce que la source dit, sans rien compléter', () => {
    const signal = withSignals()[0]!.needs.find(need => need.kind === 'signal')!
    expect(signal.detail).toBe('Budget IT — Les Échos · 2026-07-12')
    expect(signal.urgency).toBe('unknown')
  })

  it('ne gonfle AUCUN compteur de besoins', () => {
    const stats = buildNeedsStats(withSignals())
    expect(stats.needs).toBe(1)
    expect(stats.buyingSignals).toBe(2)
    expect(stats.urgentNeeds).toBe(1)
  })

  it('reste hors du décompte « confirmées / à qualifier » (§7)', () => {
    expect(splitNeedsByConfidence(withSignals()[0]!.needs)).toEqual({ confirmed: 1, toQualify: 0 })
  })
})
