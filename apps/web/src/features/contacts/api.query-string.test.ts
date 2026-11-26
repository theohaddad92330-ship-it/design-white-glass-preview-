import { describe, expect, it, vi } from 'vitest'
import { contactListQuerySchema } from '@bellum/contracts'

const apiFetch = vi.fn().mockResolvedValue({ data: [], pagination: { totalItems: 0 } })
vi.mock('@/lib/api', () => ({ apiFetch: (...a: unknown[]) => apiFetch(...a) }))

const { contactsApi } = await import('./api')

/** Le chemin demandé par le dernier appel, sans le préfixe. */
function lastQuery(): URLSearchParams {
  const path = (apiFetch.mock.calls.at(-1)?.[0] as { path: string }).path
  return new URLSearchParams(path.split('?')[1] ?? '')
}

/**
 * Les filtres de la liste de contacts atteignent RÉELLEMENT l'API.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * CE QUE ÇA PROTÈGE, ET COMMENT ON L'A TROUVÉ
 * ─────────────────────────────────────────────────────────────────────────────
 * `buildQueryString` est une LISTE BLANCHE écrite à la main. Un filtre ajouté au
 * contrat, câblé dans l'URL, passé au hook, mis dans la clé de cache et honoré
 * par le serveur peut malgré tout ne jamais partir : il suffit que personne
 * n'ajoute sa ligne ici. Rien n'échoue, rien ne se journalise — l'écran rend
 * simplement la liste NON filtrée.
 *
 * Mesuré en production le 04/09/2026, sur la salle de démonstration :
 *
 *  · `GET /contacts?state=detecte`      → 187 sur 257  (le serveur filtre)
 *  · `GET /contacts?includeExcluded`    → 258 sur 257  (le serveur filtre)
 *  · `GET /contacts?unassigned=true`    → 0 sur 257    (le serveur filtre)
 *  · l'écran, sous chacun de ces filtres → **25 lignes**, la première page
 *    entière, non filtrée.
 *
 * `state` était pourtant documenté « filtré SERVER-side » à TROIS endroits (le
 * contrat, la route, le hook), et `visibleContacts` ne filtre que par VUE —
 * donc la pastille de cycle de vie ne filtrait rien du tout, depuis le début.
 *
 * ⚠️ Cette garde ne vérifie pas que chaque filtre FONCTIONNE — elle vérifie
 * qu'il PART. C'est le défaut qu'on a rencontré, et le seul qu'un test sans
 * serveur puisse voir.
 */
describe('buildQueryString — un filtre déclaré au contrat part réellement', () => {
  // Une garde qui ne lit rien est verte sur du vide.
  it('LIT le contrat, et il porte des filtres', () => {
    const keys = Object.keys(contactListQuerySchema.shape)
    expect(keys.length).toBeGreaterThan(5)
    expect(keys).toContain('unassigned')
  })

  /**
   * Ce que chaque filtre du contrat doit produire dans la requête.
   *
   * `offset` et `limit` ne viennent pas de l'écran mais de la pagination : ils
   * sont ajoutés par `listPage`, et testés à part.
   */
  const CASES: Array<{ key: string; value: unknown; param: string; expected: string }> = [
    { key: 'q', value: 'dupont', param: 'q', expected: 'dupont' },
    { key: 'role', value: 'sponsor', param: 'role', expected: 'sponsor' },
    { key: 'company', value: 'Acme', param: 'company', expected: 'Acme' },
    // #2159.26 — l'étiquette.
    { key: 'tag', value: 'sap', param: 'tag', expected: 'sap' },
    { key: 'channel', value: 'with_email', param: 'channel', expected: 'with_email' },
    { key: 'unassigned', value: true, param: 'unassigned', expected: 'true' },
    { key: 'placeholderEmail', value: true, param: 'placeholderEmail', expected: 'true' },
    { key: 'includeExcluded', value: true, param: 'includeExcluded', expected: 'true' },
    { key: 'state', value: 'detecte', param: 'state', expected: 'detecte' },
    { key: 'dormantMonths', value: 12, param: 'dormantMonths', expected: '12' },
    // #2158.61 — la ville/le pays.
    { key: 'location', value: 'Lyon', param: 'location', expected: 'Lyon' },
    // #2158.65 — le porteur du contact.
    { key: 'assignedTo', value: 'member-1', param: 'assignedTo', expected: 'member-1' },
    // #1903.15 — le compte discuté en conversation, égalité exacte.
    { key: 'accountId', value: 'account-1', param: 'accountId', expected: 'account-1' },
    // #2294.2 — le secteur du compte.
    { key: 'sector', value: 'SSII', param: 'sector', expected: 'SSII' },
    // #2294.2 — groupe ou filiale.
    { key: 'groupRole', value: 'filiale', param: 'groupRole', expected: 'filiale' },
    // #2294.2 — fraîcheur min de la collecte de contacts.
    { key: 'contactsFreshWithinMonths', value: 6, param: 'contactsFreshWithinMonths', expected: '6' },
    // #2834 (#2106.24) — les contacts « a changé d'employeur ».
    { key: 'sourceTag', value: 'RISQUE', param: 'sourceTag', expected: 'RISQUE' },
    // #2158.60 — la famille métier.
    { key: 'family', value: 'IT', param: 'family', expected: 'IT' },
    // #2158.57 — l'entité déclarée par le contact.
    { key: 'entity', value: 'DSI', param: 'entity', expected: 'DSI' },
    // #2158.58 — la fonction du contact.
    {
      key: 'title',
      value: 'Directeur des systèmes d’information',
      param: 'title',
      expected: 'Directeur des systèmes d’information',
    },
    // #2158.67 — la fraîcheur de la fiche.
    { key: 'updatedWithinMonths', value: 3, param: 'updatedWithinMonths', expected: '3' },
    // #2158.68 (#2997) — la cible.
    { key: 'targetListId', value: 'list-1', param: 'targetListId', expected: 'list-1' },
    // #2158.66 (#2997) — la source.
    { key: 'source', value: 'apollo', param: 'source', expected: 'apollo' },
    // #2158.59 (#2997) — le niveau.
    { key: 'hierarchyLevel', value: 'management', param: 'hierarchyLevel', expected: 'management' },
    // #2158.14 (#2997) — la vue « Sans prochaine action ».
    { key: 'withoutNextAction', value: true, param: 'withoutNextAction', expected: 'true' },
    // #2158.69 (#2997) — la nature de la dernière activité échangée.
    { key: 'lastActivityKind', value: 'call', param: 'lastActivityKind', expected: 'call' },
    // #3718 — le statut déclaré (« Répondu »), filtré CÔTÉ SERVEUR.
    { key: 'userStatus', value: 'replied', param: 'userStatus', expected: 'replied' },
    // #3942.2 — la portée « Recommandés », filtrée CÔTÉ SERVEUR (recette prod 09/10, #3942).
    { key: 'recommendedScope', value: 'recommended', param: 'recommendedScope', expected: 'recommended' },
    // #4982.1 — le tri « zone », fait EN SQL côté serveur (la liste est paginée).
    { key: 'sort', value: 'zone', param: 'sort', expected: 'zone' },
    // #4597.3 — « voir les N contacts de CET import » : l'identifiant du job d'import, jamais sa date.
    {
      key: 'importJob',
      value: '3f1c9a7e-5b2d-4c8e-9a10-7d6f2b4e8c31',
      param: 'importJob',
      expected: '3f1c9a7e-5b2d-4c8e-9a10-7d6f2b4e8c31',
    },
  ]

  it.each(CASES)('$key part dans la requête', async ({ key, value, param, expected }) => {
    apiFetch.mockClear()
    await contactsApi.listAll({ [key]: value } as never)
    expect(lastQuery().get(param)).toBe(expected)
  })

  /**
   * LE point qui casse en silence : la liste blanche ne doit rien OUBLIER.
   *
   * Un filtre ajouté au contrat sans sa ligne ici ne partirait jamais. Ce test
   * compare les deux et NOMME le manquant — c'est ce qui a manqué le 04/09.
   */
  it('n’oublie AUCUN filtre du contrat', async () => {
    const paginationOnly = new Set(['offset', 'limit'])
    // #4475 — alias snake_case d'un filtre camelCase (appelants hors web) : le web envoie
    // la forme camelCase, l'alias est réputé couvert SEULEMENT si sa cible l'est.
    const aliases: Record<string, string> = { account_id: 'accountId' }
    const contractFilters = Object.keys(contactListQuerySchema.shape).filter(key => !paginationOnly.has(key))
    const covered = new Set(CASES.map(c => c.key))
    for (const [alias, target] of Object.entries(aliases)) if (covered.has(target)) covered.add(alias)
    expect([...contractFilters].filter(key => !covered.has(key))).toEqual([])
  })

  // Deux valeurs qui ne veulent RIEN dire ne doivent pas partir : `role: 'all'`
  // est le libellé « pas de filtre », et un booléen faux n'est pas un filtre.
  it('ne transmet pas ce qui ne filtre rien', async () => {
    apiFetch.mockClear()
    await contactsApi.listAll({ role: 'all', unassigned: false, includeExcluded: false, recommendedScope: 'all' })
    const qs = lastQuery()
    expect(qs.get('role')).toBeNull()
    expect(qs.get('unassigned')).toBeNull()
    expect(qs.get('includeExcluded')).toBeNull()
    expect(qs.get('recommendedScope')).toBeNull()
  })

  /**
   * #1800 — TDD, sens « no network call » : `favorite` n'existe plus au
   * contrat, `buildQueryString` ne le construit plus. Si quelqu'un le
   * réintroduisait d'un côté sans l'autre, `n'oublie AUCUN filtre du contrat`
   * juste au-dessus le nommerait déjà — ce test-ci prouve l'absence dans la
   * requête RÉELLEMENT envoyée, pas seulement dans la liste blanche.
   */
  it('#1800 — ne construit plus jamais `favorite`, même si on le passe', async () => {
    apiFetch.mockClear()
    await contactsApi.listAll({ favorite: true } as never)
    expect(lastQuery().get('favorite')).toBeNull()
  })

  it('la pagination part avec le reste', async () => {
    apiFetch.mockClear()
    await contactsApi.listPage({ state: 'detecte', offset: 50, limit: 25 })
    const qs = lastQuery()
    expect(qs.get('state')).toBe('detecte')
    expect(qs.get('offset')).toBe('50')
    expect(qs.get('limit')).toBe('25')
  })
})
