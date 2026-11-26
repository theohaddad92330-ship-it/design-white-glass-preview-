import { ServiceUnavailableException } from '@nestjs/common'
import { MODULE_METADATA } from '@nestjs/common/constants'
import { BusinessUnitModule } from '../business-unit/business-unit.module'
import { CopilotBridgeModule } from './copilot-bridge.module'
import { CopilotContactsSearchController } from './copilot-contacts-search.controller'
import { CopilotContactsSearchDto } from './dto/copilot-contacts-search.dto'

// #4982.3 — `search` rend une liste OU une répartition par zone (`byZone`) : on resserre le type sur la liste.
function listOf<T>(out: T): Extract<T, { contacts: unknown }> {
  if (!out || typeof out !== 'object' || !('contacts' in out)) throw new Error('attendu : une liste de contacts')
  return out as Extract<T, { contacts: unknown }>
}

// #2294 — Laura retrouve un contact à travers TOUS les comptes de l'espace.
const USER = '11111111-1111-4111-8111-111111111111'
const WS = '22222222-2222-4222-8222-222222222222'
const BU = '33333333-3333-4333-8333-333333333333'

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: 'c-1',
    account_id: 'a-1',
    full_name: 'Claire Martin',
    title: 'DSI',
    entity: null,
    decision_role: 'technical',
    email: 'claire@example.test',
    phone: null,
    linkedin_url: null,
    company_name: 'Acme',
    user_status: 'replied',
    why_contact: 'Porte le programme cloud',
    ...overrides,
  }
}

function build(opts: { data?: unknown[]; total?: number; scope?: unknown; noBu?: boolean; recent?: unknown[] } = {}) {
  const recentlyActedContacts = jest.fn().mockResolvedValue(opts.recent ?? [])
  const findAllForUser = jest.fn().mockResolvedValue({
    data: opts.data ?? [row()],
    pagination: { totalItems: opts.total ?? (opts.data ?? [row()]).length },
  })
  const zoneBreakdown = jest.fn().mockResolvedValue({
    zones: [{ region: 'ile_de_france', department: '75', count: 3 }],
    unknown_zone: 2,
    total: 5,
  })
  const resolveActiveWorkspace = jest.fn().mockResolvedValue({ workspaceId: WS })
  const scopeFor = jest.fn().mockResolvedValue(opts.scope ?? { businessUnitIds: [BU], includeUnassigned: true })
  const controller = new CopilotContactsSearchController(
    { findAllForUser, recentlyActedContacts, zoneBreakdown } as never,
    { resolveActiveWorkspace } as never,
    opts.noBu ? undefined : ({ scopeFor } as never),
  )
  return { controller, findAllForUser, scopeFor, recentlyActedContacts, zoneBreakdown }
}

describe('CopilotContactsSearchController — #2294 recherche de contacts dans tout l’espace', () => {
  it('passe les critères à la liste de contacts de l’ESPACE, bornée au périmètre (BU) de l’appelant', async () => {
    const { controller, findAllForUser, scopeFor } = build()
    await controller.search({ userId: USER, query: 'DSI', company: 'Acme', role: 'technical', limit: 5 })
    expect(scopeFor).toHaveBeenCalledWith(WS, USER)
    expect(findAllForUser).toHaveBeenCalledWith(
      USER,
      { q: 'DSI', company: 'Acme', role: 'technical', limit: 5, offset: 0 },
      { businessUnitIds: [BU], includeUnassigned: true },
    )
  })

  it('sans service de périmètre, LÈVE (fail-closed) au lieu d’ouvrir tout l’espace', async () => {
    const { controller, findAllForUser } = build({ noBu: true })
    await expect(controller.search({ userId: USER, query: 'DSI' })).rejects.toBeInstanceOf(ServiceUnavailableException)
    expect(findAllForUser).not.toHaveBeenCalled()
  })

  // ⚠️ RENVERSÉ le 07/10 (#2533, décision Louis du 04/10 « e-mails, téléphones,
  // noms : TOUJOURS en clair ») : ce test exigeait « jamais l'adresse ni le
  // téléphone ». Recette prod 07/10 (UNEO) : Laura disait « pas de fiche
  // vérifiée » devant une Directrice des SI à l'e-mail affiché sur sa fiche.
  it('rend le compte de chaque personne, le canal ET la coordonnée en clair (#2533)', async () => {
    const { controller } = build()
    const out = listOf(await controller.search({ userId: USER, query: 'DSI' }))
    expect(out.contacts).toEqual([
      {
        contact_id: 'c-1',
        account_id: 'a-1',
        company_name: 'Acme',
        full_name: 'Claire Martin',
        title: 'DSI',
        decision_role: 'technical',
        relationship_status: 'replied',
        has_email: true,
        has_network_profile: false,
        email: 'claire@example.test',
        phone: null,
      },
    ])
  })

  // #219.8 (#3231, lot X50) — la relation personne↔entreprise DÉCLARÉE voyage
  // jusqu'à Laura (qui en tire la preuve exigée) ; non déclarée = aucune clé.
  it('relaie la relation déclarée, et n’ajoute aucune clé quand elle ne l’est pas', async () => {
    const { controller } = build({
      data: [row({ declared_person_company_relation: 'employee_former' }), row({ id: 'c-2' })],
    })
    const out = listOf(await controller.search({ userId: USER, query: 'DSI' }))
    expect(out.contacts[0]).toMatchObject({ declared_person_company_relation: 'employee_former' })
    expect(out.contacts[1]).not.toHaveProperty('declared_person_company_relation')
  })

  it('rend la localisation connue de la personne (#2294.6, champ déjà collecté par la liste Contacts)', async () => {
    const { controller } = build({ data: [row({ location: 'Lyon, France' })] })
    const out = listOf(await controller.search({ userId: USER, query: 'DSI' }))
    expect(out.contacts[0]).toMatchObject({ location: 'Lyon, France' })
  })

  it('ne rend pas de localisation inventée quand elle est inconnue — jamais une chaîne vide (#2165.38)', async () => {
    const { controller } = build({ data: [row({ location: null })] })
    const out = listOf(await controller.search({ userId: USER, query: 'DSI' }))
    expect(out.contacts[0]).toMatchObject({ location: null })
  })

  it('porte le total et dit quand la liste est tronquée', async () => {
    const { controller } = build({ data: [row()], total: 7 })
    const out = listOf(await controller.search({ userId: USER, query: 'DSI', limit: 1 }))
    expect(out).toMatchObject({ total: 7, truncated: true })
    const exact = listOf(await build({ data: [row()], total: 1 }).controller.search({ userId: USER, query: 'DSI' }))
    expect(exact.truncated).toBe(false)
  })

  it('#4065 — relaie l’offset du listing paginé à la MÊME liste de contacts', async () => {
    const { controller, findAllForUser } = build({ total: 60 })
    await controller.search({ userId: USER, listAll: true, limit: 25, offset: 25 })
    expect(findAllForUser).toHaveBeenCalledWith(USER, { limit: 25, offset: 25 }, expect.anything())
  })

  it('#4982.3 — `sort: zone` relaie le MÊME tri que l’écran Contacts et rend ville + département de chaque ligne', async () => {
    const { controller, findAllForUser } = build({
      data: [row({ zone_city: 'Lyon', zone_department: '69' }), row({ id: 'c-2' })],
    })
    const out = listOf(await controller.search({ userId: USER, sort: 'zone', limit: 5 }))
    expect(findAllForUser).toHaveBeenCalledWith(USER, { limit: 5, offset: 0, sort: 'zone' }, expect.anything())
    expect(out.contacts[0]).toMatchObject({ city: 'Lyon', department: '69' })
    // Lieu inconnu : null, jamais une chaîne vide ni un lieu deviné.
    expect(out.contacts[1]).toMatchObject({ city: null, department: null })
  })

  it('#4982.3 — `byZone` rend des COMPTES par zone (lieux inconnus à part), bornés au périmètre, sans lister de lignes', async () => {
    const { controller, findAllForUser, zoneBreakdown, scopeFor } = build()
    const out = await controller.search({ userId: USER, byZone: true, sector: 'SSII' })
    expect(scopeFor).toHaveBeenCalledWith(WS, USER)
    expect(zoneBreakdown).toHaveBeenCalledWith(
      USER,
      { sector: 'SSII' },
      { businessUnitIds: [BU], includeUnassigned: true },
    )
    expect(findAllForUser).not.toHaveBeenCalled()
    expect(out).toEqual({
      zones: [{ region: 'ile_de_france', department: '75', count: 3 }],
      unknown_zone: 2,
      total: 5,
    })
  })

  it('limite par défaut 10', async () => {
    const { controller, findAllForUser } = build()
    await controller.search({ userId: USER, company: 'Acme' })
    expect(findAllForUser.mock.calls[0][1]).toMatchObject({ limit: 10 })
  })

  // #2294.2 — les 3 filtres de compte ajoutés à `ContactListQuery` : le pont
  // Laura les relaie tel quel, aucun second filtre (GA-26).
  it('relaie sector/groupRole/contactsFreshWithinMonths à la liste de contacts', async () => {
    const { controller, findAllForUser } = build()
    await controller.search({
      userId: USER,
      query: 'DSI',
      sector: 'SSII',
      groupRole: 'filiale',
      contactsFreshWithinMonths: 6,
    })
    expect(findAllForUser).toHaveBeenCalledWith(
      USER,
      { q: 'DSI', sector: 'SSII', groupRole: 'filiale', contactsFreshWithinMonths: 6, limit: 10, offset: 0 },
      { businessUnitIds: [BU], includeUnassigned: true },
    )
  })

  it('sans ces filtres, aucune clé absente n’est envoyée', async () => {
    const { controller, findAllForUser } = build()
    await controller.search({ userId: USER, query: 'DSI' })
    const sent = findAllForUser.mock.calls[0][1] as Record<string, unknown>
    expect(sent).not.toHaveProperty('sector')
    expect(sent).not.toHaveProperty('groupRole')
    expect(sent).not.toHaveProperty('contactsFreshWithinMonths')
    expect(sent).not.toHaveProperty('location')
  })

  // #2367 (LAU-FINAL-035, entrée « territoire ») — `location` existe déjà sur
  // `contactListQuerySchema` (#2158.61, ILIKE ville/pays) ; ce pont le relaie
  // tel quel, même motif que sector/groupRole/contactsFreshWithinMonths.
  it('relaie location (territoire) à la liste de contacts (#2294.2)', async () => {
    const { controller, findAllForUser } = build()
    await controller.search({ userId: USER, query: 'DSI', location: 'Toulouse' })
    expect(findAllForUser).toHaveBeenCalledWith(
      USER,
      { q: 'DSI', location: 'Toulouse', limit: 10, offset: 0 },
      { businessUnitIds: [BU], includeUnassigned: true },
    )
  })
})

describe('CopilotContactsSearchDto — #2294', () => {
  const schema = (
    CopilotContactsSearchDto as unknown as { schema: { safeParse: (v: unknown) => { success: boolean } } }
  ).schema

  it('refuse une recherche sans AUCUN critère (elle rendrait les derniers contacts créés, pas une réponse)', () => {
    expect(schema.safeParse({ userId: USER }).success).toBe(false)
  })

  it('#4065 — accepte un LISTING complet explicite (`listAll`), paginé par `offset`', () => {
    expect(schema.safeParse({ userId: USER, listAll: true, offset: 25 }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, listAll: false }).success).toBe(false)
    expect(schema.safeParse({ userId: USER, company: 'Acme', offset: -1 }).success).toBe(false)
  })

  it('accepte un seul critère et borne la limite à 25', () => {
    expect(schema.safeParse({ userId: USER, company: 'Acme' }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, company: 'Acme', limit: 26 }).success).toBe(false)
  })

  // #2294.2 — sector/groupRole/contactsFreshWithinMonths sont des critères
  // aussi légitimes que `company` : SEULS, ils doivent suffire à valider.
  it('accepte sector/groupRole/contactsFreshWithinMonths SEULS, chacun', () => {
    expect(schema.safeParse({ userId: USER, sector: 'SSII' }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, groupRole: 'filiale' }).success).toBe(true)
    expect(schema.safeParse({ userId: USER, contactsFreshWithinMonths: 6 }).success).toBe(true)
  })

  // #2367 (territoire) — `location` SEUL doit suffire à valider, même motif
  // que sector.
  it('accepte location SEUL (#2294.2)', () => {
    expect(schema.safeParse({ userId: USER, location: 'Toulouse' }).success).toBe(true)
  })

  it('refuse un rôle hors du vocabulaire partagé', () => {
    expect(schema.safeParse({ userId: USER, role: 'boss' }).success).toBe(false)
  })
})

describe('CopilotBridgeModule — #2294 câblage', () => {
  it('déclare le contrôleur ET importe le module qui porte son périmètre (sinon : panne au démarrage, GA-20)', () => {
    const controllers = Reflect.getMetadata(MODULE_METADATA.CONTROLLERS, CopilotBridgeModule)
    const imports = Reflect.getMetadata(MODULE_METADATA.IMPORTS, CopilotBridgeModule)
    expect(controllers).toContain(CopilotContactsSearchController)
    expect(imports).toContain(BusinessUnitModule)
  })
})

// #4287.11 / #4287.14 — « relance les 2 derniers contacts » : Laura n'avait AUCUN outil triant les contacts par
// dernière interaction datée ; elle répondait « je ne peux pas identifier les deux plus récents ».
describe('CopilotContactsSearchController — #4287.11 les N derniers contacts (dernière interaction datée)', () => {
  const recentRow = (id: string, at: string) => ({
    ...row({ id, full_name: `Contact ${id}` }),
    last_action_at: at,
  })

  it('recentFirst : rend les N contacts à dernière interaction la plus récente, DATÉE, sans critère de recherche', async () => {
    const { controller, findAllForUser, recentlyActedContacts } = build({
      recent: [recentRow('c-9', '2026-10-18T09:00:00.000Z'), recentRow('c-8', '2026-10-12T09:00:00.000Z')],
    })
    const out = listOf(await controller.search({ userId: USER, recentFirst: true, limit: 2 }))
    expect(recentlyActedContacts).toHaveBeenCalledWith(USER, 2, { businessUnitIds: [BU], includeUnassigned: true })
    expect(findAllForUser).not.toHaveBeenCalled()
    expect(out.contacts.map(c => [c.contact_id, c.last_action_at])).toEqual([
      ['c-9', '2026-10-18T09:00:00.000Z'],
      ['c-8', '2026-10-12T09:00:00.000Z'],
    ])
  })

  it('aucune interaction datée : liste VIDE et total 0 mesuré, jamais des contacts non datés présentés comme récents', async () => {
    const { controller } = build({ recent: [] })
    const out = listOf(await controller.search({ userId: USER, recentFirst: true, limit: 2 }))
    expect(out.contacts).toEqual([])
  })

  it('la DTO accepte recentFirst seul (aucun autre critère)', () => {
    const parsed = (
      CopilotContactsSearchDto as unknown as { schema: { safeParse: (v: unknown) => { success: boolean } } }
    ).schema.safeParse({
      userId: USER,
      recentFirst: true,
    })
    expect(parsed.success).toBe(true)
  })
})

// #4386.1 — recette prod 23/10 : « Trouve Théo Haddad chez Bellum » → aucune fiche, alors que la barre
// globale trouve « Haddad ». La phrase entière partait en `q` (ILIKE sur le nom seul) : rien ne contient
// « théo haddad chez bellum ». Le nom et la société se séparent, la société perd son suffixe juridique.
describe('CopilotContactsSearchController — #4386.1 personne + société en une phrase', () => {
  it('« Théo Haddad chez Bellum » → nom en q, société en company', async () => {
    const { controller, findAllForUser } = build()
    await controller.search({ userId: USER, query: 'Théo Haddad chez Bellum' })
    expect(findAllForUser.mock.calls[0]![1]).toMatchObject({ q: 'Théo Haddad', company: 'Bellum' })
  })

  it('« haddad theo BELLUM SAS » (société en queue) : repli, nom + société sans suffixe juridique', async () => {
    const { controller, findAllForUser } = build()
    findAllForUser.mockResolvedValueOnce({ data: [], pagination: { totalItems: 0 } })
    const out = listOf(await controller.search({ userId: USER, query: 'haddad theo BELLUM SAS' }))
    const calls = findAllForUser.mock.calls.map(call => call[1])
    expect(calls).toContainEqual(expect.objectContaining({ q: 'haddad theo', company: 'BELLUM' }))
    expect(out.contacts).toHaveLength(1)
  })

  it('la société passée à part perd « SAS » / « Group » (« Bellum SAS » ↔ BELLUM)', async () => {
    const { controller, findAllForUser } = build()
    await controller.search({ userId: USER, query: 'Théo Haddad', company: 'Bellum SAS' })
    expect(findAllForUser.mock.calls[0]![1]).toMatchObject({ q: 'Théo Haddad', company: 'Bellum' })
  })

  it('un nom seul (« Haddad ») part tel quel, sans repli inventé', async () => {
    const { controller, findAllForUser } = build({ data: [] })
    await controller.search({ userId: USER, query: 'Haddad' })
    expect(findAllForUser).toHaveBeenCalledTimes(1)
    expect(findAllForUser.mock.calls[0]![1]).toMatchObject({ q: 'Haddad' })
  })
})
