import { describe, expect, it } from 'vitest'
import { COMMUNITY_THRESHOLD } from './community-facts.js'
import { decideMarketSignalDate, marketSignalDateSchema } from './market-signal-date.js'

/**
 * #2288.2 — LES DATES REVIENNENT, SANS TRAHIR QUI A VU.
 *
 * Trois cas, et un seul champ par cas : date EXACTE pour ce que mon espace a
 * observé, date GROSSIE AU MOIS pour ce qui vient d'ailleurs, AUCUNE date sous
 * le seuil d'espaces contributeurs.
 */
describe('decideMarketSignalDate — la nature de la date, jamais sa provenance', () => {
  const ASKING = 'ws-moi'

  it('une observation de MON espace rend une date EXACTE', () => {
    const decided = decideMarketSignalDate({
      observations: [{ workspaceId: ASKING, observedAt: '2026-03-04T09:12:00.000Z' }],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(decided).toEqual({ nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' })
  })

  it('mon observation gagne sur celles des autres — et reste exacte', () => {
    const decided = decideMarketSignalDate({
      observations: [
        { workspaceId: ASKING, observedAt: '2026-03-04T09:12:00.000Z' },
        { workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { workspaceId: 'ws-b', observedAt: '2026-07-02T00:00:00.000Z' },
        { workspaceId: 'ws-c', observedAt: '2026-07-03T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(decided).toEqual({ nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' })
  })

  it('la plus RÉCENTE de mes observations, jamais la première écrite', () => {
    const decided = decideMarketSignalDate({
      observations: [
        { workspaceId: ASKING, observedAt: '2025-01-09T10:00:00.000Z' },
        { workspaceId: ASKING, observedAt: '2026-05-20T10:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(decided).toEqual({ nature: 'own', observedOn: '2026-05-20T10:00:00.000Z' })
  })

  it('ce qui vient d’AILLEURS est grossi au MOIS — jamais un jour', () => {
    const decided = decideMarketSignalDate({
      observations: [
        { workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
        { workspaceId: 'ws-c', observedAt: '2026-08-29T23:59:59.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    // Le mois du plus récent, et RIEN d'autre : ni jour, ni compte d'espaces.
    expect(decided).toEqual({ nature: 'shared', observedMonth: '2026-08' })
  })

  it('sous le seuil d’espaces distincts : AUCUNE date — pas une approximation', () => {
    const decided = decideMarketSignalDate({
      observations: [
        { workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(decided).toBeNull()
    expect(COMMUNITY_THRESHOLD).toBe(3)
  })

  it('compte des ESPACES, pas des déclarations — un espace bavard reste une voix', () => {
    const decided = decideMarketSignalDate({
      observations: [
        { workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { workspaceId: 'ws-a', observedAt: '2026-07-02T00:00:00.000Z' },
        { workspaceId: 'ws-a', observedAt: '2026-07-03T00:00:00.000Z' },
        { workspaceId: 'ws-b', observedAt: '2026-07-04T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(decided).toBeNull()
  })

  it('mon espace ne COMPTE PAS dans le seuil des autres', () => {
    const decided = decideMarketSignalDate({
      // Une observation de mon espace SANS date, plus deux espaces datés : le
      // seuil porte sur les espaces D'AILLEURS, mon espace ne le complète pas.
      observations: [
        { workspaceId: ASKING, observedAt: null },
        { workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(decided).toBeNull()
  })

  it('une observation propre NON datée ne bloque pas la lecture partagée', () => {
    const decided = decideMarketSignalDate({
      observations: [
        { workspaceId: ASKING, observedAt: null },
        { workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
        { workspaceId: 'ws-c', observedAt: '2026-07-19T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(decided).toEqual({ nature: 'shared', observedMonth: '2026-07' })
  })

  it('un espace qui ne partage pas ne consomme pas — réciprocité', () => {
    const decided = decideMarketSignalDate({
      observations: [
        { workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
        { workspaceId: 'ws-c', observedAt: '2026-07-19T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: false,
    })

    expect(decided).toBeNull()
  })

  it('… mais SA PROPRE observation lui reste lisible, partage ou pas', () => {
    const decided = decideMarketSignalDate({
      observations: [{ workspaceId: ASKING, observedAt: '2026-03-04T09:12:00.000Z' }],
      askingWorkspaceId: ASKING,
      contributes: false,
    })

    expect(decided).toEqual({ nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' })
  })

  it('aucune observation datée : AUCUNE date', () => {
    expect(
      decideMarketSignalDate({
        observations: [
          { workspaceId: ASKING, observedAt: null },
          { workspaceId: 'ws-a', observedAt: null },
        ],
        askingWorkspaceId: ASKING,
        contributes: true,
      }),
    ).toBeNull()
    expect(decideMarketSignalDate({ observations: [], askingWorkspaceId: ASKING, contributes: true })).toBeNull()
  })

  it('une date ILLISIBLE est ignorée — jamais recopiée, jamais devinée', () => {
    const decided = decideMarketSignalDate({
      observations: [{ workspaceId: ASKING, observedAt: '2026-09-11T07:22:37:46.992Z' }],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(decided).toBeNull()
  })
})

describe('marketSignalDateSchema — le TYPE refuse ce que la doctrine refuse', () => {
  it('accepte les deux natures, chacune avec SON champ', () => {
    expect(marketSignalDateSchema.parse({ nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' })).toEqual({
      nature: 'own',
      observedOn: '2026-03-04T09:12:00.000Z',
    })
    expect(marketSignalDateSchema.parse({ nature: 'shared', observedMonth: '2026-08' })).toEqual({
      nature: 'shared',
      observedMonth: '2026-08',
    })
  })

  it('REFUSE une date exacte présentée comme venant d’ailleurs', () => {
    expect(() => marketSignalDateSchema.parse({ nature: 'shared', observedOn: '2026-03-04T09:12:00.000Z' })).toThrow()
    expect(() => marketSignalDateSchema.parse({ nature: 'shared', observedMonth: '2026-03-04' })).toThrow()
    expect(() =>
      marketSignalDateSchema.parse({
        nature: 'shared',
        observedMonth: '2026-08',
        observedOn: '2026-08-12T00:00:00.000Z',
      }),
    ).toThrow()
  })

  it('REFUSE un mois là où une observation propre doit porter son jour', () => {
    expect(() => marketSignalDateSchema.parse({ nature: 'own', observedMonth: '2026-03' })).toThrow()
    expect(() => marketSignalDateSchema.parse({ nature: 'own', observedOn: '2026-03' })).toThrow()
  })

  it('REFUSE tout ce qui remonterait à un espace — identifiant comme comptage', () => {
    expect(() =>
      marketSignalDateSchema.parse({ nature: 'shared', observedMonth: '2026-08', workspaceId: 'ws-a' }),
    ).toThrow()
    expect(() =>
      marketSignalDateSchema.parse({ nature: 'shared', observedMonth: '2026-08', sourcesCount: 3 }),
    ).toThrow()
    expect(() =>
      marketSignalDateSchema.parse({ nature: 'own', observedOn: '2026-03-04T09:12:00.000Z', workspaceId: 'ws-moi' }),
    ).toThrow()
  })

  it('REFUSE un mois qui n’en est pas un', () => {
    expect(() => marketSignalDateSchema.parse({ nature: 'shared', observedMonth: '2026-13' })).toThrow()
    expect(() => marketSignalDateSchema.parse({ nature: 'shared', observedMonth: '2026-00' })).toThrow()
    expect(() => marketSignalDateSchema.parse({ nature: 'shared', observedMonth: 'août 2026' })).toThrow()
  })
})
