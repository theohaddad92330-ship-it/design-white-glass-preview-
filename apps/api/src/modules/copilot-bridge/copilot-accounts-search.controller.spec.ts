import { ServiceUnavailableException } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { CopilotAccountsSearchController } from './copilot-accounts-search.controller'
import { CopilotBridgeModule } from './copilot-bridge.module'
import { CopilotAccountsByOwnerDto } from './dto/copilot-accounts-by-owner.dto'
import { CopilotAccountsSearchDto } from './dto/copilot-accounts-search.dto'

// #2148.4 (#2848) — Laura retrouve un compte DÉJÀ ANALYSÉ à travers tout le
// portefeuille, avant de proposer une analyse neuve (« réutiliser avant de
// rechercher », #2148 étape 3).
const USER = '11111111-1111-4111-8111-111111111111'
const WS = '22222222-2222-4222-8222-222222222222'
const BU = '33333333-3333-4333-8333-333333333333'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'a-1',
    company_name: 'Acme',
    sector: 'SSII',
    last_analyzed_at: '2026-08-01T00:00:00.000Z',
    owner: 'Bedros Astourian',
    ...overrides,
  }
}

function build(
  opts: {
    data?: unknown[]
    total?: number
    visibility?: 'open' | 'restricted'
    noBu?: boolean
    members?: { userId: string; fullName: string }[]
    accountsAssignedTo?: unknown[]
  } = {},
) {
  const findAccountsByWorkspace = jest.fn().mockResolvedValue({
    data: opts.data ?? [row()],
    pagination: { totalItems: opts.total ?? (opts.data ?? [row()]).length },
  })
  const accountsAssignedTo = jest.fn().mockResolvedValue(opts.accountsAssignedTo ?? [])
  const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' })
  const portfolioVisibilityOf = jest.fn().mockResolvedValue(opts.visibility ?? 'open')
  const listMembers = jest.fn().mockResolvedValue(opts.members ?? [])
  const scopeFor = jest.fn().mockResolvedValue({ businessUnitIds: [BU], includeUnassigned: true })
  const controller = new CopilotAccountsSearchController(
    { findAccountsByWorkspace, accountsAssignedTo } as never,
    { resolveActiveWorkspace, portfolioVisibilityOf, listMembers } as never,
    opts.noBu ? undefined : ({ scopeFor } as never),
  )
  return { controller, findAccountsByWorkspace, accountsAssignedTo, scopeFor, listMembers }
}

describe('CopilotAccountsSearchController — #4065 listing complet du portefeuille', () => {
  const schema = (
    CopilotAccountsSearchDto as unknown as { schema: { safeParse: (v: unknown) => { success: boolean } } }
  ).schema

  it('accepte `listAll` sans critère, refuse toujours une recherche vide', () => {
    expect(schema.safeParse({ userId: USER, listAll: true, offset: 25 }).success).toBe(true)
    expect(schema.safeParse({ userId: USER }).success).toBe(false)
  })

  it('relaie l’offset, dans le MÊME périmètre (scope + BU)', async () => {
    const { controller, findAccountsByWorkspace } = build({ total: 40 })
    await controller.search({ userId: USER, listAll: true, limit: 25, offset: 25 } as never)
    expect(findAccountsByWorkspace).toHaveBeenCalledWith(
      WS,
      { reusableOnly: true, limit: 25, offset: 25 },
      null,
      undefined,
      { businessUnitIds: [BU], includeUnassigned: true },
    )
  })
})

describe('CopilotAccountsSearchController — #3215 « Est-ce que je peux ouvrir SG ? »', () => {
  const active = row({ id: '0125b778', company_name: 'Société Générale', status: 'completed' })
  const archived = row({ id: '8b25ec87', company_name: 'Societe Generale', status: 'archived' })

  it('rejoue le tour de la recette : « SG » rend la fiche ACTIVE avant l’archivée, jamais une liste vide', async () => {
    const findAccountsByWorkspace = jest
      .fn()
      // 1er appel : le filtre ILIKE de l'écran Comptes ne trouve rien pour « SG ».
      .mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
      // 2e appel (#3670.9, lot H06) : MÊME `q`, sans `reusableOnly` — « sg » n'est
      // le sous-texte littéral d'aucun des deux noms, l'ILIKE ne rapproche rien non plus.
      .mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
      // 3e appel : le portefeuille borné, lu pour rapprocher le sigle.
      .mockResolvedValueOnce({
        data: [archived, row({ id: 'o-1', company_name: 'Airbus' }), active],
        pagination: { totalItems: 3 },
      })
    const controller = new CopilotAccountsSearchController(
      { findAccountsByWorkspace } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const result = await controller.search({ userId: USER, query: 'SG' })
    expect(result.accounts.map(account => account.account_id)).toEqual(['0125b778', '8b25ec87'])
    expect(result.total).toBe(2)
    // 2e appel (#3670.9) : même `q`, sans `reusableOnly`.
    expect(findAccountsByWorkspace.mock.calls[1][1]).toEqual(expect.objectContaining({ q: 'SG' }))
    // 3e appel, le portefeuille borné qui rapproche le sigle : sans `q`.
    expect(findAccountsByWorkspace.mock.calls[2][1]).toEqual(expect.not.objectContaining({ q: expect.anything() }))
  })

  it('le filtre direct qui trouve déjà une fiche active ne déclenche pas de seconde lecture', async () => {
    const { controller, findAccountsByWorkspace } = build({ data: [active] })
    await controller.search({ userId: USER, query: 'Société Générale' })
    expect(findAccountsByWorkspace).toHaveBeenCalledTimes(1)
  })

  it('« SG » ne rapproche rien dans un portefeuille sans correspondance : liste vide, aucun compte deviné', async () => {
    const findAccountsByWorkspace = jest
      .fn()
      .mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
      // #3670.9 — 2e lecture (MÊME `q`, sans `reusableOnly`) : « sg » n'est le
      // substring d'aucun des deux noms (« Société Générale », « Societe
      // Generale »), l'ILIKE de la base ne rapproche rien non plus.
      .mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
      .mockResolvedValueOnce({ data: [row({ company_name: 'Airbus' })], pagination: { totalItems: 1 } })
      // #3670.5 — 4e lecture (hors `reusableOnly`) : même source que le briefing,
      // rien n'y correspond non plus.
      .mockResolvedValueOnce({ data: [row({ company_name: 'Airbus' })], pagination: { totalItems: 1 } })
      // #3670 (RAW2) — 5e lecture : les fiches SUPPRIMÉES de même nom, aucune non plus.
      .mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
    const c = new CopilotAccountsSearchController(
      { findAccountsByWorkspace } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const result = await c.search({ userId: USER, query: 'SG' })
    expect(result.accounts).toEqual([])
  })

  /**
   * #3670.5 — recette prod 08/10 : Laura (« /chat ») disait ne pas connaître
   * Altran alors que le briefing le citait (`accountsToWatch`, un signal
   * frais — AUCUN filtre `reusableOnly` côté briefing). Un compte à peine
   * repéré (sans contact, analyse non terminée) échoue `reusableOnly`
   * (#3184.1) mais EXISTE dans l'espace : la résolution de chat doit encore
   * le trouver, même sans rien proposer d'« exploitable » dessus.
   */
  it('un compte repéré par signal seul (hors `reusableOnly`) se trouve encore par son nom (#3670.5)', async () => {
    const prospect = row({ id: 'altran-1', company_name: 'Altran', status: 'analyzing' })
    const findAccountsByWorkspace = jest
      .fn()
      // 1er appel : le filtre direct (`reusableOnly`, `q`) ne trouve rien — Altran échoue `reusableOnly`.
      .mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
      // 2e appel (#3670.9, lot H06) : MÊME `q`, SANS `reusableOnly` — l'ILIKE de la base
      // retrouve directement « Altran », qui matche son propre nom au mot pour mot : la
      // résolution s'arrête ICI, avant même d'avoir besoin du portefeuille borné à 100 lignes.
      .mockResolvedValueOnce({ data: [prospect], pagination: { totalItems: 1 } })
    const c = new CopilotAccountsSearchController(
      { findAccountsByWorkspace } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const result = await c.search({ userId: USER, query: 'Altran' })
    expect(result.accounts.map(account => account.account_id)).toEqual(['altran-1'])
    expect(findAccountsByWorkspace).toHaveBeenCalledTimes(2)
    expect(findAccountsByWorkspace.mock.calls[1][1]).not.toHaveProperty('reusableOnly')
  })

  /**
   * #3670.9 (recette prod 09/10) — « que sais-tu du compte Altran Technologies ? »
   * répondait « aucune fiche correspondante » alors qu'ALTRAN TECHNOLOGIES existe,
   * repérée par le briefing (#3670.5) : SIMPLE différence de CASSE (le registre
   * écrit le nom en capitales, le commercial le tape normalement). Les deux lectures
   * de rattrapage de #3670.5 (ci-dessus) FETCHENT un portefeuille borné à 100 lignes,
   * trié par date de dernière activité — une fiche à peine repérée, jamais retouchée
   * depuis, peut rester hors de ces 100 lignes dans un grand portefeuille, quelle que
   * soit la qualité du rapprochement de nom fait EN MÉMOIRE sur ce qui a été ramené.
   * Avant de s'y risquer, on retente le MÊME filtre `q` SANS `reusableOnly` : l'ILIKE
   * de la base reste insensible à la casse ET n'est borné par AUCUN tri de récence —
   * il retrouve la fiche quel que soit le nombre de comptes du portefeuille.
   */
  it('une casse différente (ALTRAN TECHNOLOGIES / Altran Technologies) se trouve même hors du portefeuille borné à 100 lignes (#3670.9)', async () => {
    const altran = row({ id: 'altran-1', company_name: 'ALTRAN TECHNOLOGIES', status: 'analyzing' })
    const findAccountsByWorkspace = jest
      .fn()
      // 1er appel : direct (`q`+`reusableOnly`) — Altran échoue `reusableOnly` (analyse non terminée, aucun contact).
      .mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
      // 2e appel : MÊME `q`, SANS `reusableOnly` — l'ILIKE insensible à la casse de la base
      // retrouve la fiche, sans jamais passer par le portefeuille borné à 100 lignes.
      .mockResolvedValueOnce({ data: [altran], pagination: { totalItems: 1 } })
    const c = new CopilotAccountsSearchController(
      { findAccountsByWorkspace } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const result = await c.search({ userId: USER, query: 'Altran Technologies' })
    expect(result.accounts.map(account => account.account_id)).toEqual(['altran-1'])
    // Deux appels seulement : jamais besoin du portefeuille borné à 100 lignes.
    expect(findAccountsByWorkspace).toHaveBeenCalledTimes(2)
    expect(findAccountsByWorkspace.mock.calls[1][1]).toEqual(expect.objectContaining({ q: 'Altran Technologies' }))
    expect(findAccountsByWorkspace.mock.calls[1][1]).not.toHaveProperty('reusableOnly')
  })

  /**
   * #3670.10 (recette MZ 10/10, prod fdb2424dbb) — « Altran Technologies » reste KO alors que la fiche
   * ne porte que « ALTRAN » : l'ILIKE `%Altran Technologies%` ne la voit pas (la saisie est PLUS LONGUE
   * que le nom), et le rapprochement « nom contenu dans la saisie » (#3670, `embedded`) ne s'exécute
   * que sur 100 lignes triées par récence. On retente donc l'ILIKE sur le DÉBUT de la saisie (« Altran »),
   * en base, sans borne de récence — puis on ne garde que ce que `resolveAccountsByName` accepte.
   */
  it('la saisie plus longue que la fiche (« Altran Technologies » / « ALTRAN ») se trouve par son début, hors des 100 lignes (#3670.10)', async () => {
    const altran = row({ id: 'f5451cf4', company_name: 'ALTRAN', status: 'analyzing' })
    const findAccountsByWorkspace = jest.fn().mockImplementation((_ws: string, filters: { q?: string }) => {
      const hit = filters.q?.toLowerCase() === 'altran' ? [altran] : []
      return Promise.resolve({ data: hit, pagination: { totalItems: hit.length } })
    })
    const c = new CopilotAccountsSearchController(
      { findAccountsByWorkspace } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const result = await c.search({ userId: USER, query: 'Altran Technologies' })
    expect(result.accounts.map(account => account.account_id)).toEqual(['f5451cf4'])
  })

  /**
   * #3670 (RAN, recette ND 10/10 en prod, toujours KO) — le modèle passe la saisie telle qu'il la lit :
   * « compte Altran Technologies ». Retirer les mots par la FIN ne retombe jamais sur « Altran » : un mot
   * d'introduction en tête empêchait toute lecture. Les fenêtres de mots contiguës sont donc toutes essayées.
   */
  it.each(['compte Altran Technologies', 'le compte Altran', 'fiche de Altran Technologies SA'])(
    'un mot d’introduction en tête de la saisie ne cache pas la fiche « ALTRAN » (%s) (#3670, RAN)',
    async query => {
      const altran = row({ id: 'f5451cf4', company_name: 'ALTRAN', status: 'analyzing' })
      const findAccountsByWorkspace = jest.fn().mockImplementation((_ws: string, filters: { q?: string }) => {
        const hit = filters.q?.toLowerCase() === 'altran' ? [altran] : []
        return Promise.resolve({ data: hit, pagination: { totalItems: hit.length } })
      })
      const c = new CopilotAccountsSearchController(
        { findAccountsByWorkspace } as never,
        {
          resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' }),
          portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
        } as never,
        { scopeFor: jest.fn().mockResolvedValue(null) } as never,
      )
      const result = await c.search({ userId: USER, query })
      expect(result.accounts.map(account => account.account_id)).toEqual(['f5451cf4'])
    },
  )

  it('le début de la saisie ne rapproche pas une fiche dont le nom n’y figure pas en mots entiers (#3670.10, dit NON)', async () => {
    const other = row({ id: 'x-1', company_name: 'Altrans Conseil', status: 'completed' })
    const findAccountsByWorkspace = jest.fn().mockImplementation((_ws: string, filters: { q?: string }) => {
      const hit = filters.q?.toLowerCase() === 'altran' ? [other] : []
      return Promise.resolve({ data: hit, pagination: { totalItems: hit.length } })
    })
    const c = new CopilotAccountsSearchController(
      { findAccountsByWorkspace } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const result = await c.search({ userId: USER, query: 'Altran Technologies' })
    expect(result.accounts).toEqual([])
  })

  /**
   * #3670.9 — un nom qui ne matche QUE par sigle ou par accent (ILIKE littéral
   * impossible, #3215) continue de retomber sur le portefeuille borné, inchangé :
   * la nouvelle lecture `q` sans `reusableOnly` ne trouve rien pour « SG » (aucun
   * nom ne porte « sg » comme sous-chaîne), donc elle n'intercepte jamais ce cas.
   */
  it('un sigle sans correspondance ILIKE littérale retombe toujours sur le portefeuille borné (#3215, non régressé)', async () => {
    const active = row({ id: '0125b778', company_name: 'Société Générale', status: 'completed' })
    const findAccountsByWorkspace = jest
      .fn()
      .mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
      // 2e appel (nouveau, #3670.9) : « sg » n'étant le sous-texte littéral d'aucun nom, rien.
      .mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
      .mockResolvedValueOnce({ data: [active], pagination: { totalItems: 1 } })
    const c = new CopilotAccountsSearchController(
      { findAccountsByWorkspace } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'member' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const result = await c.search({ userId: USER, query: 'SG' })
    expect(result.accounts.map(account => account.account_id)).toEqual(['0125b778'])
    expect(findAccountsByWorkspace).toHaveBeenCalledTimes(3)
  })

  /**
   * #3670 (lot RAT, recette NF 10/10, prod b5c1ee1480) — « que sais-tu du compte Altran Technologies ? »
   * → « aucune fiche ». Journal API 19:46:13 : `accounts/search` a fait 47 requêtes — TOUS les replis ont
   * tourné, aucun n'a rendu de ligne. Le pré-tour IA, lui, avait bien rattaché la fiche f5451cf4 au
   * message (RAG `account_id.eq.f5451cf4`). Ce que les tests RAN/MZ/H06 ne simulaient jamais : une fiche
   * NON ACTIVE (archivée). L'ILIKE la trouvait, puis chaque repli la JETAIT (`hasActive` faux) ; seuls
   * les deux portefeuilles bornés à 100 lignes pouvaient encore la rendre, et elle n'y était pas.
   * Ce test simule la BASE (filtres `q`/`reusableOnly`/`limit` réellement appliqués, 150 comptes plus
   * récents), pas une file de réponses écrites pour le cas.
   */
  it('une fiche archivée trouvée par son nom est rendue (marquée inactive), jamais « aucune fiche »', async () => {
    const altran = row({
      id: 'f5451cf4',
      company_name: 'Altran Technologies',
      status: 'completed',
      commercial_status: 'archived',
      reusable: false,
    })
    const recent = Array.from({ length: 150 }, (_, index) =>
      row({ id: `r-${index}`, company_name: `Compte ${index}`, status: 'completed', reusable: true }),
    )
    const base = [...recent, altran]
    const findAccountsByWorkspace = jest.fn(
      async (_ws: string, filters: { q?: string; reusableOnly?: boolean; limit?: number }) => {
        const matching = base.filter(
          account =>
            (!filters.q || account.company_name.toLowerCase().includes(filters.q.toLowerCase())) &&
            (!filters.reusableOnly || (account as { reusable?: boolean }).reusable === true),
        )
        return { data: matching.slice(0, filters.limit ?? 10), pagination: { totalItems: matching.length } }
      },
    )
    const c = new CopilotAccountsSearchController(
      { findAccountsByWorkspace } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'owner' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
    const result = await c.search({ userId: USER, query: 'Altran Technologies' })
    expect(result.accounts.map(account => account.account_id)).toEqual(['f5451cf4'])
    expect(result.accounts[0]).toEqual(expect.objectContaining({ inactive: true }))
  })

  /**
   * #3670 (RAW2, décision Louis 11/10) — une fiche SUPPRIMÉE ne ressort JAMAIS : aucun compte rendu,
   * seulement un constat d'existence `deleted_match` (le nom, rien d'autre) pour que Laura le NOMME.
   */
  const buildDeleted = (byWorkspace: Record<string, Array<ReturnType<typeof row> & { status?: string }>>) => {
    const findAccountsByWorkspace = jest.fn(async (ws: string, filters: { q?: string; status?: string }) => {
      const pool = (byWorkspace[ws] ?? []).filter(account =>
        filters.status === 'deleted' ? account.status === 'deleted' : account.status !== 'deleted',
      )
      const matching = pool.filter(
        account => !filters.q || account.company_name.toLowerCase().includes(filters.q.toLowerCase()),
      )
      return { data: matching, pagination: { totalItems: matching.length } }
    })
    return new CopilotAccountsSearchController(
      { findAccountsByWorkspace } as never,
      {
        resolveActiveWorkspace: jest.fn().mockResolvedValue({ workspaceId: WS, role: 'owner' }),
        portfolioVisibilityOf: jest.fn().mockResolvedValue('open'),
      } as never,
      { scopeFor: jest.fn().mockResolvedValue(null) } as never,
    )
  }

  it('#3670 RAW2 — fiche supprimée seule : aucun compte rendu, indicateur deleted_match', async () => {
    const c = buildDeleted({
      [WS]: [row({ id: 'f5451cf4', company_name: 'ALTRAN TECHNOLOGIES', status: 'deleted' })],
    })
    const result = await c.search({ userId: USER, query: 'Altran Technologies' })
    expect(result.accounts).toEqual([])
    expect(result.deleted_match).toBe(true)
    expect(JSON.stringify(result)).not.toContain('f5451cf4')
  })

  it('#3670 RAW2 — fiche active du même nom : compte rendu, pas d’indicateur', async () => {
    const c = buildDeleted({
      [WS]: [
        row({ id: 'old', company_name: 'Acme', status: 'deleted' }),
        row({ id: 'live', company_name: 'Acme', status: 'completed' }),
      ],
    })
    const result = await c.search({ userId: USER, query: 'Acme' })
    expect(result.accounts.map(account => account.account_id)).toEqual(['live'])
    expect(result.deleted_match).toBeUndefined()
  })

  it('#3670 RAW2 — fiche supprimée d’un AUTRE espace : rien', async () => {
    const c = buildDeleted({
      'autre-espace': [row({ id: 'x', company_name: 'Altran Technologies', status: 'deleted' })],
    })
    const result = await c.search({ userId: USER, query: 'Altran Technologies' })
    expect(result.accounts).toEqual([])
    expect(result.deleted_match).toBeUndefined()
  })

  it('une fiche active rendue ne porte pas de marque « inactive » (sortie inchangée)', async () => {
    const { controller } = build({ data: [row({ id: 'a-1', company_name: 'Acme', status: 'completed' })] })
    const result = await controller.search({ userId: USER, query: 'Acme' })
    expect(result.accounts[0]).not.toHaveProperty('inactive')
  })
})

describe('CopilotAccountsSearchController — #2148.4 réutiliser avant de rechercher', () => {
  it('passe les critères à la liste de comptes de l’espace, bornée aux comptes déjà exploitables', async () => {
    const { controller, findAccountsByWorkspace } = build()
    await controller.search({ userId: USER, query: 'Acme', sector: 'SSII', limit: 5 })
    expect(findAccountsByWorkspace).toHaveBeenCalledWith(
      WS,
      { reusableOnly: true, q: 'Acme', sector: 'SSII', limit: 5, offset: 0 },
      null,
      undefined,
      { businessUnitIds: [BU], includeUnassigned: true },
    )
  })

  it('sans service de périmètre (BU), LÈVE (fail-closed) au lieu d’ouvrir tout l’espace', async () => {
    const { controller, findAccountsByWorkspace } = build({ noBu: true })
    await expect(controller.search({ userId: USER, query: 'Acme' })).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(findAccountsByWorkspace).not.toHaveBeenCalled()
  })

  it('rend les comptes trouvés — nom, secteur, date de dernière analyse, responsable', async () => {
    const { controller } = build()
    const out = await controller.search({ userId: USER, query: 'Acme' })
    expect(out.accounts).toEqual([
      {
        account_id: 'a-1',
        company_name: 'Acme',
        sector: 'SSII',
        last_analyzed_at: '2026-08-01T00:00:00.000Z',
        signal_freshness: null,
        owner: 'Bedros Astourian',
      },
    ])
  })

  it('#3682.6 — Laura reçoit la même fraîcheur que la liste : fait de 2024 historique, vérification récente', async () => {
    const freshness = { verifiedAt: '2026-10-06T08:00:00.000Z', eventDate: '2024-10', state: 'historical' as const }
    const { controller } = build({ data: [row({ signal_freshness: freshness })] })
    const out = await controller.search({ userId: USER, query: 'Acme' })
    expect(out.accounts[0]).toMatchObject({ signal_freshness: freshness })
  })

  it('#3094 — un compte non attribué rend `owner: null`, jamais un nom deviné', async () => {
    const { controller } = build({ data: [row({ owner: null })] })
    const out = await controller.search({ userId: USER, query: 'Acme' })
    expect(out.accounts[0]).toMatchObject({ owner: null })
  })

  it('ne devine jamais une date manquante — `null`, jamais une valeur de remplissage', async () => {
    const { controller } = build({ data: [row({ last_analyzed_at: null })] })
    const out = await controller.search({ userId: USER, query: 'Acme' })
    expect(out.accounts[0]).toMatchObject({ last_analyzed_at: null })
  })

  it('porte le total et dit quand la liste est tronquée', async () => {
    const { controller } = build({ data: [row()], total: 7 })
    const out = await controller.search({ userId: USER, query: 'Acme', limit: 1 })
    expect(out).toMatchObject({ total: 7, truncated: true })
    const exact = await build({ data: [row()], total: 1 }).controller.search({ userId: USER, query: 'Acme' })
    expect(exact.truncated).toBe(false)
  })

  it('limite par défaut 10', async () => {
    const { controller, findAccountsByWorkspace } = build()
    await controller.search({ userId: USER, sector: 'SSII' })
    expect(findAccountsByWorkspace.mock.calls[0][1]).toMatchObject({ limit: 10 })
  })

  it('sans critère de secteur, aucune clé absente n’est envoyée', async () => {
    const { controller, findAccountsByWorkspace } = build()
    await controller.search({ userId: USER, query: 'Acme' })
    const sent = findAccountsByWorkspace.mock.calls[0][1] as Record<string, unknown>
    expect(sent).not.toHaveProperty('sector')
  })

  it('toujours borné aux comptes déjà exploitables, quel que soit le critère demandé', async () => {
    const { controller, findAccountsByWorkspace } = build()
    await controller.search({ userId: USER, sector: 'Banque' })
    expect(findAccountsByWorkspace.mock.calls[0][1]).toMatchObject({ reusableOnly: true })
  })
})

describe('CopilotAccountsSearchController.byOwner — #3094 « quels sont les comptes de <membre> ? »', () => {
  const MEMBERS = [
    { userId: 'u-1', fullName: 'Bedros Astourian' },
    { userId: 'u-2', fullName: 'Louis Schlegel' },
  ]

  it('résout le nom tapé vers un membre réel et rend SES comptes, avec son nom cité', async () => {
    const { controller, accountsAssignedTo } = build({
      members: MEMBERS,
      accountsAssignedTo: [{ id: 'a-1', company_name: 'Acme', sector: 'SSII' }],
    })
    const out = await controller.byOwner({ userId: USER, ownerName: 'Bedros' })
    expect(accountsAssignedTo).toHaveBeenCalledWith('u-1', WS, 10)
    expect(out).toEqual({
      memberFound: true,
      ownerName: 'Bedros Astourian',
      accounts: [{ account_id: 'a-1', company_name: 'Acme', sector: 'SSII' }],
    })
  })

  it('aucun membre de l’espace ne porte ce nom : le dit, n’invente aucun compte', async () => {
    const { controller, accountsAssignedTo } = build({ members: MEMBERS })
    const out = await controller.byOwner({ userId: USER, ownerName: 'Personne Inconnue' })
    expect(accountsAssignedTo).not.toHaveBeenCalled()
    expect(out).toEqual({ memberFound: false, accounts: [] })
  })

  it('deux membres partagent le même prénom : le dit, nomme les deux, ne choisit pas au hasard', async () => {
    const withTwoLouis = [...MEMBERS, { userId: 'u-3', fullName: 'Louis Martin' }]
    const { controller, accountsAssignedTo } = build({ members: withTwoLouis })
    const out = await controller.byOwner({ userId: USER, ownerName: 'Louis' })
    expect(accountsAssignedTo).not.toHaveBeenCalled()
    expect(out).toMatchObject({
      memberFound: false,
      ambiguousCandidates: expect.arrayContaining(['Louis Schlegel', 'Louis Martin']),
    })
  })

  it('respecte la limite demandée, plafonnée à 25 par le DTO', async () => {
    const { controller, accountsAssignedTo } = build({ members: MEMBERS })
    await controller.byOwner({ userId: USER, ownerName: 'Bedros', limit: 3 })
    expect(accountsAssignedTo).toHaveBeenCalledWith('u-1', WS, 3)
  })
})

describe('CopilotAccountsSearchDto — #2148.4', () => {
  const schema = (
    CopilotAccountsSearchDto as unknown as { schema: { safeParse: (v: unknown) => { success: boolean } } }
  ).schema

  it('refuse une recherche sans AUCUN critère (elle rendrait les comptes les plus RÉCEMMENT créés, pas une réponse)', () => {
    expect(schema.safeParse({ userId: USER }).success).toBe(false)
  })

  it('accepte query seul, ou sector seul', () => {
    expect(schema.safeParse({ userId: USER, query: 'Acme' }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, sector: 'SSII' }).success).toBe(true)
  })

  it('borne la limite à 25', () => {
    expect(schema.safeParse({ userId: USER, query: 'Acme', limit: 25 }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, query: 'Acme', limit: 26 }).success).toBe(false)
  })
})

describe('CopilotAccountsByOwnerDto — #3094', () => {
  const schema = (
    CopilotAccountsByOwnerDto as unknown as { schema: { safeParse: (v: unknown) => { success: boolean } } }
  ).schema

  it('exige un nom de membre', () => {
    expect(schema.safeParse({ userId: USER }).success).toBe(false)
    expect(schema.safeParse({ userId: USER, ownerName: '' }).success).toBe(false)
  })

  it('accepte un nom seul', () => {
    expect(schema.safeParse({ userId: USER, ownerName: 'Bedros' }).success).toBe(true)
  })

  it('borne la limite à 25', () => {
    expect(schema.safeParse({ userId: USER, ownerName: 'Bedros', limit: 25 }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, ownerName: 'Bedros', limit: 26 }).success).toBe(false)
  })
})

describe('CopilotBridgeModule — #2148.4 câblage', () => {
  it('déclare le contrôleur ET importe le module qui porte son périmètre (sinon : panne au démarrage, GA-20)', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CopilotBridgeModule)
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, CopilotBridgeModule)
    expect(controllers).toContain(CopilotAccountsSearchController)
    expect(imports).toContain(BusinessUnitModule)
  })
})
