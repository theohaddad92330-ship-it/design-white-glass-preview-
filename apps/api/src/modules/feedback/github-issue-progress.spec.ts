import { GithubIssueService } from './github-issue.service'

/**
 * #1960.10 — LA LECTURE DE L'ÉTAT DES TICKETS, pour « Mes signalements ».
 *
 * Ce qui se garde ici :
 *  - sans intégration, AUCUN appel (sans clé = no-op strict) ;
 *  - UN appel par chargement, borné, pour les seules références demandées ;
 *  - un échec rend « je n'ai pas pu regarder », jamais un état par défaut ;
 *  - une lecture réussie se garde une minute, un échec jamais.
 */

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

function makeService(): GithubIssueService {
  process.env.FEEDBACK_GITHUB_TOKEN = 'tok'
  process.env.FEEDBACK_GITHUB_REPO = 'Bellum-AI/bellum-monorepo'
  return new GithubIssueService()
}

/** Un nœud tel que la requête le rend — ouvert, créé, jamais touché. */
function node(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    state: 'OPEN',
    stateReason: null,
    assignees: { totalCount: 0 },
    labels: { nodes: [{ name: 'beta-feedback' }, { name: 'feedback:bug' }] },
    comments: { nodes: [{ author: { __typename: 'Bot' } }] },
    ...over,
  }
}

type FetchCall = [string, { body: string; method: string }]

describe('#1960.10 — GithubIssueService.issueProgress', () => {
  const originalEnv = { ...process.env }
  let fetchMock: jest.Mock

  beforeEach(() => {
    fetchMock = jest.fn()
    global.fetch = fetchMock as unknown as typeof fetch
  })

  afterEach(() => {
    process.env = { ...originalEnv }
    jest.restoreAllMocks()
  })

  it('intégration éteinte → null, et AUCUN appel réseau', async () => {
    delete process.env.FEEDBACK_GITHUB_TOKEN
    delete process.env.FEEDBACK_GITHUB_REPO

    await expect(new GithubIssueService().issueProgress([913])).resolves.toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('aucune référence lisible → carte vide, aucun appel', async () => {
    await expect(makeService().issueProgress([0, -3, 1.5, Number.NaN])).resolves.toEqual(new Map())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('UN seul appel pour toutes les références — entières, positives, dédoublonnées, passées en variables', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { repository: { i0: node(), i1: node() } } }))

    await makeService().issueProgress([913, 913, 0, -4, 1.5, 914])

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0] as FetchCall
    expect(url).toBe('https://api.github.com/graphql')
    expect(init.method).toBe('POST')
    const body = JSON.parse(init.body) as { query: string; variables: Record<string, unknown> }
    expect(body.variables).toEqual({ owner: 'Bellum-AI', name: 'bellum-monorepo', n0: 913, n1: 914 })
    expect(body.query).toContain('i0: issue(number: $n0)')
    // Une référence ne se colle JAMAIS dans le texte de la requête.
    expect(body.query).not.toContain('913')
    // Rien que ce qui sert à dériver un état : ni titre, ni corps, ni lien.
    expect(body.query).not.toMatch(/\b(title|body|url)\b/)
  })

  it('borne la lecture à 50 références par appel', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ data: { repository: {} } }))

    await makeService().issueProgress(Array.from({ length: 80 }, (_, index) => index + 1))

    const body = JSON.parse((fetchMock.mock.calls[0] as FetchCall)[1].body) as { variables: Record<string, unknown> }
    expect(Object.keys(body.variables).filter(key => /^n\d+$/.test(key))).toHaveLength(50)
  })

  it('traduit ce que le ticket dit — état, raison, attribution, étiquettes, réponse HUMAINE', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({
        data: {
          repository: {
            i0: node({ state: 'CLOSED', stateReason: 'NOT_PLANNED' }),
            i1: node({
              assignees: { totalCount: 2 },
              labels: { nodes: [{ name: 'beta-feedback' }, { name: 'lot-12' }] },
              comments: { nodes: [{ author: { __typename: 'Bot' } }, { author: { __typename: 'User' } }] },
            }),
          },
        },
      }),
    )

    const progress = await makeService().issueProgress([913, 914])

    expect(progress?.get(913)).toEqual({
      state: 'closed',
      stateReason: 'NOT_PLANNED',
      assigned: false,
      labels: ['beta-feedback', 'feedback:bug'],
      // Un robot qui commente n'est pas quelqu'un qui a pris le signalement.
      humanComment: false,
    })
    expect(progress?.get(914)).toEqual({
      state: 'open',
      stateReason: null,
      assigned: true,
      labels: ['beta-feedback', 'lot-12'],
      humanComment: true,
    })
  })

  it('une raison de fermeture inconnue ne devient pas une raison', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ data: { repository: { i0: node({ state: 'CLOSED', stateReason: 'SOMETHING_NEW' }) } } }),
    )

    const progress = await makeService().issueProgress([913])

    expect(progress?.get(913)?.stateReason).toBeNull()
  })

  it('réponse en échec → null (« je n’ai pas pu regarder »), jamais une carte vide', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ message: 'Bad gateway' }, 502))
    await expect(makeService().issueProgress([913])).resolves.toBeNull()
  })

  it('exception réseau → null, sans lever', async () => {
    fetchMock.mockRejectedValue(new Error('ECONNRESET'))
    await expect(makeService().issueProgress([913])).resolves.toBeNull()
  })

  it('erreur globale → null ; erreur sur UN ticket → ce ticket seul reste inconnu', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ errors: [{ message: 'API rate limit exceeded' }] }))
    await expect(makeService().issueProgress([913])).resolves.toBeNull()

    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        data: { repository: { i0: node(), i1: null } },
        errors: [{ message: 'Could not resolve to an Issue', path: ['repository', 'i1'] }],
      }),
    )
    const progress = await makeService().issueProgress([913, 914])

    expect([...(progress?.keys() ?? [])]).toEqual([913])
  })

  it('garde une lecture réussie une minute, puis relit', async () => {
    const now = jest.spyOn(Date, 'now').mockReturnValue(1_000_000)
    fetchMock.mockResolvedValue(jsonResponse({ data: { repository: { i0: node() } } }))
    const service = makeService()

    await service.issueProgress([913])
    const cached = await service.issueProgress([913])
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(cached?.get(913)?.state).toBe('open')

    now.mockReturnValue(1_000_000 + 61_000)
    await service.issueProgress([913])
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it('ne garde JAMAIS un échec : la lecture suivante réessaie', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, 503))
    fetchMock.mockResolvedValueOnce(jsonResponse({ data: { repository: { i0: node() } } }))
    const service = makeService()

    await expect(service.issueProgress([913])).resolves.toBeNull()
    const progress = await service.issueProgress([913])

    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(progress?.get(913)?.state).toBe('open')
  })
})
