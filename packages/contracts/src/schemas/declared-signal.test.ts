import { describe, expect, it } from 'vitest'
import {
  DECLARED_SIGNAL_SOURCES,
  declareAccountSignalsRequestSchema,
  declaredSignalEntryKindSchema,
  declaredSignalItemInputSchema,
  declaredSignalSchema,
  declareSignalEntryKindRequestSchema,
} from './declared-signal.js'

// #2634.1 — LinkedIn comme source de signaux d'achat, UNIQUEMENT par une voie
// autorisée : saisie manuelle, import d'un export déjà possédé par le client,
// ou connecteur officiel (aucun aujourd'hui). Jamais de scraping.

describe('DECLARED_SIGNAL_SOURCES', () => {
  it('n’admet que LinkedIn — aucune autre plateforme n’a été tranchée', () => {
    expect(DECLARED_SIGNAL_SOURCES).toEqual(['LinkedIn'])
  })
})

describe('declareSignalEntryKindRequestSchema', () => {
  it('accepte manual et import — les deux voies qu’un humain peut soumettre', () => {
    expect(declareSignalEntryKindRequestSchema.parse('manual')).toBe('manual')
    expect(declareSignalEntryKindRequestSchema.parse('import')).toBe('import')
  })

  // LE TEST QUI SAIT DIRE NON : un connecteur n'existe pas aujourd'hui
  // (agent_docs/env-reference.md) — aucune requête humaine ne peut se faire
  // passer pour lui. Casser ce refus (l'admettre) romprait la garantie que
  // seule une voie non automatisée peut être déclenchée par un utilisateur.
  it('REFUSE `connector` — aucun humain ne peut se faire passer pour un connecteur', () => {
    expect(() => declareSignalEntryKindRequestSchema.parse('connector')).toThrow()
  })
})

describe('declaredSignalEntryKindSchema (forme stockée)', () => {
  it('admet aussi `connector`, réservé à un futur chemin automatisé', () => {
    expect(declaredSignalEntryKindSchema.parse('connector')).toBe('connector')
  })
})

describe('declaredSignalItemInputSchema', () => {
  it('exige un libellé non vide', () => {
    expect(() => declaredSignalItemInputSchema.parse({ label: '' })).toThrow()
  })

  it('accepte un libellé seul — le reste est optionnel', () => {
    const parsed = declaredSignalItemInputSchema.parse({ label: 'Poste Lead Data Engineer publié' })
    expect(parsed.label).toBe('Poste Lead Data Engineer publié')
  })

  it('documentDate doit être au format YYYY-MM-DD', () => {
    expect(() => declaredSignalItemInputSchema.parse({ label: 'x', documentDate: '22/09/2026' })).toThrow()
    expect(declaredSignalItemInputSchema.parse({ label: 'x', documentDate: '2026-09-22' }).documentDate).toBe(
      '2026-09-22',
    )
  })
})

describe('declareAccountSignalsRequestSchema', () => {
  const base = { source: 'LinkedIn' as const, entryKind: 'manual' as const, signals: [{ label: 'x' }] }

  it('accepte une requête minimale valide', () => {
    expect(() => declareAccountSignalsRequestSchema.parse(base)).not.toThrow()
  })

  it('refuse une source autre que LinkedIn', () => {
    expect(() => declareAccountSignalsRequestSchema.parse({ ...base, source: 'Twitter' })).toThrow()
  })

  it('refuse `entryKind: connector` à l’écriture humaine', () => {
    expect(() => declareAccountSignalsRequestSchema.parse({ ...base, entryKind: 'connector' })).toThrow()
  })

  it('refuse une liste de signaux vide', () => {
    expect(() => declareAccountSignalsRequestSchema.parse({ ...base, signals: [] })).toThrow()
  })

  it('borne à 50 signaux par appel — au-delà, ce n’est plus une saisie', () => {
    const many = Array.from({ length: 51 }, (_, i) => ({ label: `signal ${i}` }))
    expect(() => declareAccountSignalsRequestSchema.parse({ ...base, signals: many })).toThrow()
  })
})

describe('declaredSignalSchema (forme stockée, tamponnée par le serveur)', () => {
  it('exige declaredAt et declaredBy — jamais fournis par le client', () => {
    const stored = declaredSignalSchema.parse({
      id: '11111111-1111-1111-1111-111111111111',
      label: 'Poste Lead Data Engineer publié',
      source: 'LinkedIn',
      entryKind: 'manual',
      declaredAt: '2026-09-22T18:00:00.000Z',
      declaredBy: '22222222-2222-2222-2222-222222222222',
      declaredByName: 'Louis Schlegel',
    })
    expect(stored.declaredByName).toBe('Louis Schlegel')
  })

  it('declaredBy peut être null (réservé au futur entryKind connector)', () => {
    expect(() =>
      declaredSignalSchema.parse({
        id: '11111111-1111-1111-1111-111111111111',
        label: 'x',
        source: 'LinkedIn',
        entryKind: 'connector',
        declaredAt: '2026-09-22T18:00:00.000Z',
        declaredBy: null,
        declaredByName: null,
      }),
    ).not.toThrow()
  })
})
