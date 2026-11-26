import {
  buildCommonAccountLinks,
  type CommonAccountLinksStore,
  type LinkDraft,
  runCommonAccountLinks,
} from './common-account-links'

/** Lot 793 — construction du référentiel pivot depuis `market_v2_rows` (accounts, account_aliases) et `dataforge_accounts`. */

const v2 = (over: Record<string, string>): Record<string, string> => ({
  account_id: 'BM-A-000001',
  account_name: 'Alten',
  group_account_id: 'BM-A-000001',
  is_group_root: '1',
  ...over,
})

const df = (
  over: Partial<{
    source_id: string
    name: string
    legal_name: string | null
    siren: string | null
    website: string | null
  }>,
) => ({
  source_id: 'DF-0001',
  name: 'Alten',
  legal_name: null,
  siren: null,
  website: null,
  ...over,
})

const find = (links: LinkDraft[], kind: LinkDraft['keyKind'], value: string) =>
  links.filter(l => l.keyKind === kind && l.keyValue === value)

describe('buildCommonAccountLinks — lot 793', () => {
  it('un BM-A qui porte un dataforge_id relie BM-A ↔ DF ↔ groupe, et la fiche DF n’est pas un second compte', () => {
    const { links, report } = buildCommonAccountLinks({
      accounts: [v2({ dataforge_id: 'DF-0001', website: 'https://www.alten.fr', siren_siret: '348 607 417 00012' })],
      aliases: [],
      dataforge: [df({ siren: '348607417', website: 'alten.fr', legal_name: 'ALTEN SA' })],
    })
    for (const [kind, value] of [
      ['siren', '348607417'],
      ['domain', 'alten.fr'],
      ['name', 'alten'],
    ] as const) {
      expect(find(links, kind, value)).toEqual([
        expect.objectContaining({
          commonId: 'BM-A-000001',
          bmAccountId: 'BM-A-000001',
          dataforgeSourceId: 'DF-0001',
          groupAccountId: 'BM-A-000001',
        }),
      ])
    }
    expect(find(links, 'siren', '348607417')[0]?.origins.sort()).toEqual(['dataforge_accounts', 'market_v2_accounts'])
    expect(report).toMatchObject({ bmAccounts: 1, dataforgeLinkedToBm: 1, dataforgeOnly: 0 })
  })

  it('une fiche DF que nul BM-A ne référence reste une entreprise commune à part entière', () => {
    const { links, report } = buildCommonAccountLinks({
      accounts: [],
      aliases: [],
      dataforge: [df({ source_id: 'DF-0415', name: 'Sopra Steria' })],
    })
    expect(find(links, 'name', 'sopra steria')).toEqual([
      expect.objectContaining({
        commonId: 'DF-0415',
        bmAccountId: null,
        dataforgeSourceId: 'DF-0415',
        groupAccountId: null,
      }),
    ])
    expect(report.dataforgeOnly).toBe(1)
  })

  it('les alias se normalisent avec NOTRE clé (pas alias_norm du pack) ; un alias partagé fait deux lignes, compté ambigu', () => {
    const { links, report } = buildCommonAccountLinks({
      accounts: [
        v2({}),
        v2({ account_id: 'BM-A-000002', account_name: 'Orange Bank', group_account_id: 'BM-A-000002' }),
      ],
      aliases: [
        { alias: 'Alten Technologies SAS', alias_norm: 'ALTENTECH', account_id: 'BM-A-000001', is_preferred: '1' },
        { alias: 'Alten', alias_norm: 'x', account_id: 'BM-A-000002', is_preferred: '0' },
        { alias: 'Fantôme', alias_norm: 'f', account_id: 'BM-A-999999', is_preferred: '1' },
      ],
      dataforge: [],
    })
    expect(find(links, 'name', 'alten technologies')).toHaveLength(1)
    expect(find(links, 'name', 'altentech')).toHaveLength(0)
    expect(
      find(links, 'name', 'alten')
        .map(l => l.commonId)
        .sort(),
    ).toEqual(['BM-A-000001', 'BM-A-000002'])
    expect(report.ambiguousKeys.name).toBe(1)
    expect(report.aliasesWithoutAccount).toBe(1)
  })

  it('aucune clé inventée : sans site, sans SIREN, on n’écrit ni domaine ni SIREN ; une plateforme n’est pas un domaine', () => {
    const { links } = buildCommonAccountLinks({
      accounts: [v2({ website: 'https://www.linkedin.com/company/alten', siren_siret: '12' })],
      aliases: [],
      dataforge: [],
    })
    expect(links.filter(l => l.keyKind !== 'name')).toEqual([])
  })

  it('les variantes fusionnées par le pack deviennent des clés de nom du compte (on relie, on ne fusionne pas)', () => {
    const { links } = buildCommonAccountLinks({
      accounts: [v2({ merged_variants: 'ALTEN SA | Alten Group' })],
      aliases: [],
      dataforge: [],
    })
    expect(find(links, 'name', 'alten')).toHaveLength(1)
  })
})

describe('runCommonAccountLinks — opérateur, idempotent, --dry-run', () => {
  const store = (
    overrides: Partial<CommonAccountLinksStore> = {},
  ): CommonAccountLinksStore & { replaced: LinkDraft[][] } => {
    const replaced: LinkDraft[][] = []
    return {
      replaced,
      latestVersion: async table => (table === 'accounts' || table === 'account_aliases' ? 'a'.repeat(64) : null),
      readRows: async table => (table === 'accounts' ? [v2({})] : []),
      readDataforge: async () => [],
      replace: async links => {
        replaced.push(links)
        return { written: links.length, removed: 0 }
      },
      ...overrides,
    }
  }

  it('à blanc : compte, n’écrit rien', async () => {
    const s = store()
    const report = await runCommonAccountLinks({ store: s, dryRun: true, log: () => undefined })
    expect(report.links).toBeGreaterThan(0)
    expect(report.written).toBe(0)
    expect(s.replaced).toEqual([])
  })

  it('pour de vrai : remplace en une fois (rejeu = mêmes lignes)', async () => {
    const s = store()
    await runCommonAccountLinks({ store: s, dryRun: false, log: () => undefined })
    await runCommonAccountLinks({ store: s, dryRun: false, log: () => undefined })
    expect(s.replaced).toHaveLength(2)
    expect(s.replaced[0]).toEqual(s.replaced[1])
  })

  it('pack v2.1 sans `accounts` chargé : erreur claire, rien écrit', async () => {
    const s = store({ latestVersion: async () => null })
    const report = await runCommonAccountLinks({ store: s, dryRun: false, log: () => undefined })
    expect(report.error).toMatch(/ingest:market-v2/)
    expect(s.replaced).toEqual([])
  })
})
