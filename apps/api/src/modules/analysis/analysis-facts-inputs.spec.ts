import type { AccountFact } from '@bellum/contracts'
import {
  ANALYSIS_FACTS_MAX,
  KNOWN_CONTACTS_MAX,
  analysisFactsWire,
  knownContactsFromCrm,
  knownContactsFromMissions,
  mergeKnownContacts,
  renderPreviousAnalysis,
} from './analysis-facts-inputs'

const fact = (over: Partial<AccountFact> = {}): AccountFact => ({
  date: '2025-08-12',
  kind: 'need',
  label: 'Migration paie cloud',
  weight: 0.7,
  ageDays: 426,
  ...over,
})

/** #4070 — ce que le pipeline d'analyse reçoit du socle des faits du compte. */
describe('analysisFactsWire (#4070.1/.2)', () => {
  it('rend la nature, le libellé, la date et l’âge — dans l’ordre reçu, qui est celui du poids', () => {
    const wire = analysisFactsWire([
      fact(),
      fact({ kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 }),
    ])
    expect(wire).toEqual([
      { kind: 'need', label: 'Migration paie cloud', date: '2025-08-12', ageDays: 426 },
      { kind: 'deal_lost', label: 'TMA SI RH', date: '2024-06-01', ageDays: 863 },
    ])
  })

  it('NON — ni poids, ni lien, ni aucune clé de provenance ne traverse', () => {
    const [out] = analysisFactsWire([fact({ url: 'https://example.org/annonce' })])
    expect(Object.keys(out).sort()).toEqual(['ageDays', 'date', 'kind', 'label'])
  })

  it('dédoublonne (nature, jour, libellé) et borne : le reste se tait ici, le prompt le dit', () => {
    expect(analysisFactsWire([fact(), fact(), fact({ label: 'MIGRATION PAIE CLOUD ' })])).toHaveLength(1)
    const many = Array.from({ length: ANALYSIS_FACTS_MAX + 30 }, (_, i) => fact({ label: `Besoin n°${i}` }))
    expect(analysisFactsWire(many)).toHaveLength(ANALYSIS_FACTS_MAX)
    expect(analysisFactsWire(many)[0]?.label).toBe('Besoin n°0')
  })

  it('aucun fait → liste vide (la clé sera omise du wire)', () => {
    expect(analysisFactsWire([])).toEqual([])
  })
})

describe('interlocuteurs connus (#4070.3)', () => {
  it('CRM : nom + poste, relation « crm », jamais l’e-mail ; une ligne sans nom ne fait aucune ligne', () => {
    const out = knownContactsFromCrm([
      { id: '1', name: 'Claire Martin', email: 'claire@client.test', jobTitle: 'DSI' },
      { id: '2', name: null, email: 'x@y.test', jobTitle: null },
      { id: '3', name: '  ', email: null, jobTitle: null },
    ])
    expect(out).toEqual([{ name: 'Claire Martin', role: 'DSI', relation: 'crm', lastSeen: null }])
    expect(JSON.stringify(out)).not.toContain('client.test')
  })

  it('missions : le contact chez le client, daté par la mission (ISO seulement)', () => {
    const out = knownContactsFromMissions([
      {
        full_name: 'Paul Durand',
        title: 'Directeur paie',
        started_on: '2024-02-01',
        created_at: new Date('2024-01-20T10:00:00Z'),
      },
      { full_name: 'Alice Roy', title: null, started_on: null, created_at: '2023-05-02T00:00:00.000Z' },
      { full_name: '', title: null, started_on: null, created_at: null },
    ])
    expect(out).toEqual([
      { name: 'Paul Durand', role: 'Directeur paie', relation: 'mission', lastSeen: '2024-02-01' },
      { name: 'Alice Roy', role: null, relation: 'mission', lastSeen: '2023-05-02' },
    ])
  })

  it('fusion : dédoublonne par nom (le CRM d’abord), borne, ne devine rien', () => {
    const crm = knownContactsFromCrm([{ id: '1', name: 'Claire Martin', email: null, jobTitle: 'DSI' }])
    const missions = knownContactsFromMissions([
      { full_name: 'claire martin', title: 'DSI', started_on: '2024-02-01', created_at: null },
      ...Array.from({ length: 40 }, (_, i) => ({
        full_name: `Contact ${i}`,
        title: null,
        started_on: null,
        created_at: '2024-01-01',
      })),
    ])
    const merged = mergeKnownContacts(crm, missions)
    expect(merged).toHaveLength(KNOWN_CONTACTS_MAX)
    expect(merged[0]).toMatchObject({ name: 'Claire Martin', relation: 'crm' })
    expect(merged.filter(c => c.name.toLowerCase() === 'claire martin')).toHaveLength(1)
  })
})

describe('renderPreviousAnalysis (#4070.4)', () => {
  const now = new Date('2026-10-12T09:00:00Z')

  it('datée en mots, ses faits de fiche ; une correction humaine est NOMMÉE et datée', () => {
    const text = renderPreviousAnalysis(
      {
        analyzedAt: '2026-06-18T08:00:00.000Z',
        businessDescription: 'Banque de détail.',
        angles: ['Modernisation SI', 'Conformité DORA'],
        fields: [
          { key: 'sector', value: 'Banque', humanCorrectedAt: null },
          { key: 'headquarters', value: 'Lyon', humanCorrectedAt: '2026-07-01T10:00:00.000Z' },
          { key: 'employees', value: '', humanCorrectedAt: null },
        ],
      },
      now,
    )
    expect(text).toContain('Analyse du 2026-06-18 (il y a 4 mois)')
    expect(text).toContain('Secteur : Banque')
    expect(text).toContain("Siège : Lyon (corrigé par l'équipe le 2026-07-01)")
    expect(text).toContain('Angles retenus : Modernisation SI ; Conformité DORA')
    // NON — une valeur vide ne fait aucune ligne (jamais « 0 », jamais « non renseigné » inventé).
    expect(text).not.toContain('Effectif')
  })

  it('NON — sans date d’analyse, il le DIT au lieu d’en deviner une', () => {
    const text = renderPreviousAnalysis(
      { analyzedAt: null, fields: [{ key: 'sector', value: 'Banque', humanCorrectedAt: null }] },
      now,
    )
    expect(text).toContain('Analyse précédente (date non connue)')
    expect(text).not.toMatch(/il y a \d/)
  })

  it('NON — rien d’exploitable → null (pas de bloc, prompt byte-identique)', () => {
    expect(renderPreviousAnalysis({ analyzedAt: '2026-06-18T08:00:00.000Z', fields: [] }, now)).toBeNull()
    expect(
      renderPreviousAnalysis(
        { analyzedAt: null, fields: [{ key: 'sector', value: null, humanCorrectedAt: null }] },
        now,
      ),
    ).toBeNull()
  })

  it('une correction sans valeur lisible n’invente pas de ligne', () => {
    expect(
      renderPreviousAnalysis(
        { analyzedAt: null, fields: [{ key: 'phone', value: '', humanCorrectedAt: '2026-07-01T00:00:00Z' }] },
        now,
      ),
    ).toBeNull()
  })

  it('NON — aucun nom de source, bornée', () => {
    const text = renderPreviousAnalysis(
      {
        analyzedAt: '2026-06-18T08:00:00.000Z',
        businessDescription: 'x'.repeat(5000),
        angles: Array.from({ length: 50 }, (_, i) => `Angle ${i}`),
        fields: [{ key: 'sector', value: 'Banque', humanCorrectedAt: null }],
      },
      now,
    )
    expect(text).not.toMatch(/pappers|apollo|dataforge|hubspot/i)
    expect((text ?? '').length).toBeLessThan(2500)
  })
})
