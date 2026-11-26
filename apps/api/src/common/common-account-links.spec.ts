import { type CommonAccountQuery, resolveCommonAccounts, resolveCommonKeys } from './common-account-links'

/**
 * Lot 793 (Louis 04/11/2026) — LE résolveur compte de l'espace → identifiants communs (BM-A, DF, groupe et filiales).
 * Ordre : SIREN, puis domaine du site, puis nom/alias normalisé UNIQUE. Une ambiguïté = vide, comptée. Filtré par l'espace.
 */

const WS = '11111111-1111-4111-8111-111111111111'
const OTHER_WS = '99999999-9999-4999-8999-999999999999'
const ACC = '22222222-2222-4222-8222-222222222222'

type Link = {
  key_kind: 'siren' | 'domain' | 'name'
  key_value: string
  common_id: string
  bm_account_id: string | null
  dataforge_source_id: string | null
  group_account_id: string | null
  company_name: string
}

const bm = (id: string, name: string, over: Partial<Link> = {}): Omit<Link, 'key_kind' | 'key_value'> => ({
  common_id: id,
  bm_account_id: id,
  dataforge_source_id: null,
  group_account_id: id,
  company_name: name,
  ...over,
})

const key = (kind: Link['key_kind'], value: string, company: Omit<Link, 'key_kind' | 'key_value'>): Link => ({
  key_kind: kind,
  key_value: value,
  ...company,
})

function harness(options: {
  accounts: Array<{
    workspace_id: string
    id: string
    company_name: string
    website?: string | null
    siren?: string | null
  }>
  links: Link[]
}) {
  const calls: Array<{ sql: string; params: unknown[] }> = []
  const q: CommonAccountQuery = async <R>(sql: string, params: unknown[]): Promise<R[]> => {
    calls.push({ sql, params })
    if (/FROM accounts\b/.test(sql)) {
      const [ws, ids] = params as [string, string[]]
      return options.accounts
        .filter(a => a.workspace_id === ws && ids.includes(a.id))
        .map(a => ({
          id: a.id,
          company_name: a.company_name,
          website: a.website ?? null,
          siren: a.siren ?? null,
          group_head_siren: null,
        })) as R[]
    }
    if (/FROM common_account_links/.test(sql) && /group_account_id = ANY/.test(sql)) {
      const [groups] = params as [string[]]
      return options.links.filter(l => l.group_account_id && groups.includes(l.group_account_id)) as R[]
    }
    if (/FROM common_account_links/.test(sql)) {
      const [sirens, domains, names] = params as [string[], string[], string[]]
      return options.links.filter(
        l =>
          (l.key_kind === 'siren' && sirens.includes(l.key_value)) ||
          (l.key_kind === 'domain' && domains.includes(l.key_value)) ||
          (l.key_kind === 'name' && names.includes(l.key_value)),
      ) as R[]
    }
    return []
  }
  return { q, calls }
}

const ALTEN = bm('BM-A-000001', 'Alten', { dataforge_source_id: 'DF-0001' })
const ALTEN_SUD = bm('BM-A-000002', 'Alten Sud', { group_account_id: 'BM-A-000001' })
const ORANGE_TEL = bm('BM-A-000010', 'Orange')
const ORANGE_BANK = bm('BM-A-000011', 'Orange Bank')

describe('resolveCommonAccounts — lot 793', () => {
  it('résout par SIREN d’abord, groupe et filiales compris (BM-A et DF)', async () => {
    const { q } = harness({
      accounts: [{ workspace_id: WS, id: ACC, company_name: 'Nom sans rapport', siren: '552 120 222' }],
      links: [key('siren', '552120222', ALTEN), key('name', 'alten sud', ALTEN_SUD), key('name', 'alten', ALTEN)],
    })
    const { sets, counts } = await resolveCommonAccounts(q, WS, [ACC])
    const set = sets.get(ACC)
    expect(set?.matchedOn).toBe('siren')
    expect(set?.direct).toEqual(['BM-A-000001'])
    expect(set?.members.map(m => m.commonId).sort()).toEqual(['BM-A-000001', 'BM-A-000002'])
    expect(set?.members.find(m => m.commonId === 'BM-A-000001')?.dataforgeSourceId).toBe('DF-0001')
    expect(counts).toEqual({ resolved: 1, ambiguous: 0, none: 0 })
  })

  it('résout par le domaine racine du site quand le SIREN manque', async () => {
    const { q } = harness({
      accounts: [{ workspace_id: WS, id: ACC, company_name: 'Autre nom', website: 'https://www.alten.fr/carrieres' }],
      links: [key('domain', 'alten.fr', ALTEN)],
    })
    const { sets } = await resolveCommonAccounts(q, WS, [ACC])
    expect(sets.get(ACC)?.matchedOn).toBe('domain')
    expect(sets.get(ACC)?.direct).toEqual(['BM-A-000001'])
  })

  it('résout par un alias UNIQUE, normalisé comme le reste du dépôt (forme juridique écartée)', async () => {
    const { q } = harness({
      accounts: [{ workspace_id: WS, id: ACC, company_name: 'ALTEN SAS' }],
      links: [key('name', 'alten', ALTEN)],
    })
    const { sets } = await resolveCommonAccounts(q, WS, [ACC])
    expect(sets.get(ACC)?.matchedOn).toBe('name')
    expect(sets.get(ACC)?.direct).toEqual(['BM-A-000001'])
  })

  it('alias AMBIGU (deux entreprises de groupes différents) ⇒ vide, compté — jamais deviné', async () => {
    const { q } = harness({
      accounts: [{ workspace_id: WS, id: ACC, company_name: 'Orange' }],
      links: [key('name', 'orange', ORANGE_TEL), key('name', 'orange', ORANGE_BANK)],
    })
    const { sets, counts } = await resolveCommonAccounts(q, WS, [ACC])
    expect(sets.has(ACC)).toBe(false)
    expect(counts).toEqual({ resolved: 0, ambiguous: 1, none: 0 })
  })

  it('une clé forte ambiguë ARRÊTE la résolution : le nom ne la rattrape pas', async () => {
    const { q } = harness({
      accounts: [{ workspace_id: WS, id: ACC, company_name: 'Orange', website: 'orange.fr' }],
      links: [
        key('domain', 'orange.fr', ORANGE_TEL),
        key('domain', 'orange.fr', ORANGE_BANK),
        key('name', 'orange', ORANGE_TEL),
      ],
    })
    const { sets, counts } = await resolveCommonAccounts(q, WS, [ACC])
    expect(sets.has(ACC)).toBe(false)
    expect(counts.ambiguous).toBe(1)
  })

  it('deux entreprises d’un MÊME groupe sur une clé = le groupe, pas une ambiguïté', async () => {
    const { q } = harness({
      accounts: [{ workspace_id: WS, id: ACC, company_name: 'Alten' }],
      links: [key('name', 'alten', ALTEN), key('name', 'alten', ALTEN_SUD)],
    })
    const { sets } = await resolveCommonAccounts(q, WS, [ACC])
    expect([...(sets.get(ACC)?.direct ?? [])].sort()).toEqual(['BM-A-000001', 'BM-A-000002'])
  })

  it('refus cross-espace : un compte d’un AUTRE espace ne résout rien, et la lecture porte l’espace', async () => {
    const { q, calls } = harness({
      accounts: [{ workspace_id: OTHER_WS, id: ACC, company_name: 'Alten', siren: '552120222' }],
      links: [key('siren', '552120222', ALTEN)],
    })
    const { sets, counts } = await resolveCommonAccounts(q, WS, [ACC])
    expect(sets.size).toBe(0)
    expect(counts).toEqual({ resolved: 0, ambiguous: 0, none: 0 })
    expect(calls[0]?.sql).toMatch(/workspace_id = \$1/)
    expect(calls[0]?.params[0]).toBe(WS)
    expect(calls.some(c => /common_account_links/.test(c.sql))).toBe(false)
  })

  it('sans aucune clé connue : aucun ensemble, compté « none »', async () => {
    const { q } = harness({ accounts: [{ workspace_id: WS, id: ACC, company_name: 'Inconnue' }], links: [] })
    const { sets, counts } = await resolveCommonAccounts(q, WS, [ACC])
    expect(sets.size).toBe(0)
    expect(counts).toEqual({ resolved: 0, ambiguous: 0, none: 1 })
  })
})

describe('resolveCommonKeys — une clé de nom nue (ex. l’entreprise d’un besoin sans fiche)', () => {
  it('unique ⇒ l’entreprise commune ; ambiguë ⇒ absente', async () => {
    const { q } = harness({
      accounts: [],
      links: [key('name', 'alten', ALTEN), key('name', 'orange', ORANGE_TEL), key('name', 'orange', ORANGE_BANK)],
    })
    const out = await resolveCommonKeys(q, ['alten', 'orange', 'inconnue'])
    expect(out.get('alten')).toEqual(['BM-A-000001'])
    expect(out.has('orange')).toBe(false)
    expect(out.has('inconnue')).toBe(false)
  })
})
