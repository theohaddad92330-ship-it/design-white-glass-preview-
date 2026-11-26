import { AccountAccessService } from './account-access.service'

/**
 * #3247 (décision Louis 15/10/2026, QCM) — `AccountAccessService` répond aussi pour un compte que
 * l'espace NE POSSÈDE PAS : l'accès d'un candidat jamais ajouté au portefeuille se lit par SIREN,
 * à partir du seul verrou communautaire (agrégat, anonyme, GA-43, partage réciproque). Aucune
 * lecture d'un compte d'un autre espace, aucune écriture, jamais un `where: { id }` sans périmètre.
 */

const WS = 'w-1'
const OWNED = '552032534'
const COMMUNITY_ONLY = '302559987'

function build(opts: {
  owned?: string[]
  shares?: boolean
  lockRows?: Array<{ workspace_id: string; value: string }>
}) {
  const find = jest.fn(async (args: { where: { workspace_id: string } }) =>
    (opts.owned ?? []).map(siren => ({ id: `a-${siren}`, siren, workspace_id: args.where.workspace_id })),
  )
  const query = jest.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('community_data_sharing FROM workspaces'))
      return [{ community_data_sharing: opts.shares ?? false }]
    if (sql.includes("f.kind = 'lock'")) {
      return (opts.lockRows ?? []).filter(() => params[0] === COMMUNITY_ONLY).map(r => ({ ...r, observed_at: null }))
    }
    return []
  })
  const service = new AccountAccessService({ query } as never, { find } as never, {} as never)
  return { service, find, query }
}

describe('AccountAccessService.communityAccessBySiren (#3247, 15/10)', () => {
  it('un SIREN POSSÉDÉ est marqué possédé : son onglet Accès fait foi, aucun verrou communautaire servi', async () => {
    const { service, query } = build({ owned: [OWNED] })
    const out = await service.communityAccessBySiren(WS, [OWNED])
    expect(out[OWNED]).toEqual({ owned: true, community: null })
    expect(query.mock.calls.some(([sql]) => String(sql).includes("f.kind = 'lock'"))).toBe(false)
  })

  it('un candidat non possédé obtient le verrou communautaire CONFIRMÉ (trois espaces), partage activé', async () => {
    const lockRows = ['w-a', 'w-b', 'w-c'].map(workspace_id => ({ workspace_id, value: 'verrouille' }))
    const { service } = build({ shares: true, lockRows })
    const out = await service.communityAccessBySiren(WS, [COMMUNITY_ONLY])
    expect(out[COMMUNITY_ONLY]?.owned).toBe(false)
    expect(out[COMMUNITY_ONLY]?.community).toMatchObject({ value: 'verrouille', isCommunity: true, sourcesCount: 3 })
  })

  it('sait dire NON : sans partage activé, une valeur communautaire n’est pas servie (réciprocité)', async () => {
    const lockRows = ['w-a', 'w-b', 'w-c'].map(workspace_id => ({ workspace_id, value: 'ouvert' }))
    const { service } = build({ shares: false, lockRows })
    const out = await service.communityAccessBySiren(WS, [COMMUNITY_ONLY])
    expect(out[COMMUNITY_ONLY]?.community?.isCommunity ?? false).toBe(false)
    expect(out[COMMUNITY_ONLY]?.community?.communityAvailable).toBe(true)
  })

  it('sait dire NON : aucun fait nulle part ⇒ le SIREN est ABSENT (« on ne sait pas » n’est pas « fermé »)', async () => {
    const { service } = build({ shares: true })
    const out = await service.communityAccessBySiren(WS, ['123456782'])
    expect(out).toEqual({})
  })

  it('le périmètre est TOUJOURS l’espace demandeur, et les SIREN invalides ou en surnombre sont écartés', async () => {
    const { service, find } = build({})
    const many = Array.from({ length: 30 }, (_, i) => String(100000000 + i))
    await service.communityAccessBySiren(WS, ['pas-un-siren', '12345', ...many])
    const where = (find.mock.calls[0]?.[0] as { where: { workspace_id: string; siren: { _value: string[] } } }).where
    expect(where.workspace_id).toBe(WS)
    expect(where.siren._value).toHaveLength(20)
    expect(where.siren._value.every(s => /^\d{9}$/.test(s))).toBe(true)
  })
})
