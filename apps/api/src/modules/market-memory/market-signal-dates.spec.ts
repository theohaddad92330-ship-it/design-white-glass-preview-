import { marketSignalDatesByKey } from './market-signal-dates'

/**
 * #2288.2 — le regroupement qui précède la décision, et RIEN de plus.
 *
 * La règle elle-même vit dans `@bellum/contracts`
 * (`decideMarketSignalDate`) — ce fichier vérifie qu'on lui donne les bonnes
 * observations, et qu'aucune entreprise ne reçoit la date d'une autre.
 */
describe('marketSignalDatesByKey — chaque entreprise reçoit SA date, ou aucune', () => {
  const ASKING = 'ws-moi'

  it('rend la date EXACTE de mon espace sur l’entreprise qui la porte', () => {
    const dates = marketSignalDatesByKey({
      accountByKey: new Map([['acme', 'account-1']]),
      rows: [{ accountId: 'account-1', workspaceId: ASKING, observedAt: '2026-03-04T09:12:00.000Z' }],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(dates.get('acme')).toEqual({ nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' })
  })

  it('grossit au MOIS ce qui vient d’ailleurs, au-dessus du seuil', () => {
    const dates = marketSignalDatesByKey({
      accountByKey: new Map([['acme', 'account-1']]),
      rows: [
        { accountId: 'account-1', workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { accountId: 'account-1', workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
        { accountId: 'account-1', workspaceId: 'ws-c', observedAt: '2026-08-02T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(dates.get('acme')).toEqual({ nature: 'shared', observedMonth: '2026-08' })
  })

  it('sous le seuil, l’entreprise n’est PAS dans la table — jamais une date vide', () => {
    const dates = marketSignalDatesByKey({
      accountByKey: new Map([['acme', 'account-1']]),
      rows: [
        { accountId: 'account-1', workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { accountId: 'account-1', workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(dates.has('acme')).toBe(false)
    expect(dates.size).toBe(0)
  })

  it('ne mélange JAMAIS deux entreprises — chaque compte décide seul', () => {
    const dates = marketSignalDatesByKey({
      accountByKey: new Map([
        ['acme', 'account-1'],
        ['globex', 'account-2'],
      ]),
      rows: [
        { accountId: 'account-1', workspaceId: ASKING, observedAt: '2026-03-04T09:12:00.000Z' },
        { accountId: 'account-2', workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { accountId: 'account-2', workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(dates.get('acme')).toEqual({ nature: 'own', observedOn: '2026-03-04T09:12:00.000Z' })
    // Deux espaces seulement derrière `globex` : aucune date, et surtout pas
    // celle d'`acme`.
    expect(dates.has('globex')).toBe(false)
  })

  it('ignore une ligne dont le compte n’est rattaché à aucune entreprise du corpus', () => {
    const dates = marketSignalDatesByKey({
      accountByKey: new Map([['acme', 'account-1']]),
      rows: [{ accountId: 'account-orphelin', workspaceId: ASKING, observedAt: '2026-03-04T09:12:00.000Z' }],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(dates.size).toBe(0)
  })

  it('aucune ligne : une table VIDE, jamais une entrée non datée', () => {
    const dates = marketSignalDatesByKey({
      accountByKey: new Map([['acme', 'account-1']]),
      rows: [],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    expect(dates.size).toBe(0)
  })

  it('un espace qui ne partage pas ne consomme pas la mémoire des autres', () => {
    const dates = marketSignalDatesByKey({
      accountByKey: new Map([['acme', 'account-1']]),
      rows: [
        { accountId: 'account-1', workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { accountId: 'account-1', workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
        { accountId: 'account-1', workspaceId: 'ws-c', observedAt: '2026-08-02T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: false,
    })

    expect(dates.size).toBe(0)
  })

  it('ne rend AUCUN identifiant d’espace — la table ne porte que des dates', () => {
    const dates = marketSignalDatesByKey({
      accountByKey: new Map([['acme', 'account-1']]),
      rows: [
        { accountId: 'account-1', workspaceId: 'ws-a', observedAt: '2026-07-01T00:00:00.000Z' },
        { accountId: 'account-1', workspaceId: 'ws-b', observedAt: '2026-07-18T00:00:00.000Z' },
        { accountId: 'account-1', workspaceId: 'ws-c', observedAt: '2026-08-02T00:00:00.000Z' },
      ],
      askingWorkspaceId: ASKING,
      contributes: true,
    })

    const serialized = JSON.stringify([...dates.entries()])
    for (const workspaceId of [ASKING, 'ws-a', 'ws-b', 'ws-c']) {
      expect(serialized).not.toContain(workspaceId)
    }
    // Ni un comptage de contributeurs : « vu par 3 espaces » est déjà un indice.
    expect(serialized).not.toContain('3')
  })
})
