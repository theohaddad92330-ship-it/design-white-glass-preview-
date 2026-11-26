import { GithubIssueService } from './github-issue.service'

/**
 * #1792 — de VRAIS octets de signature, pas un data-URL décoratif : depuis que
 * l'extension écrite se dérive du CONTENU (jamais du `mimeType` déclaré), un
 * fixture qui ne porte pas la bonne signature change de classification.
 */
const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
const JPEG_BYTES = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10])
const GIF_BYTES = Buffer.from('GIF89a-le-reste-importe-peu', 'latin1')
const WEBP_BYTES = Buffer.concat([
  Buffer.from('RIFF', 'latin1'),
  Buffer.from([0, 0, 0, 0]),
  Buffer.from('WEBP', 'latin1'),
])
const PDF_BYTES = Buffer.from('%PDF-1.4\nreste-du-fichier', 'latin1')
const TXT_BYTES = Buffer.from('Le bouton "Enrichir" ne répond plus depuis ce matin.', 'utf8')
/** Un document actif — même sans balise `<script>` visible ailleurs, `onload` suffit à porter du code. */
const SVG_BYTES = Buffer.from('<svg onload="alert(1)"><circle r="4"/></svg>', 'utf8')
/** En-tête `MZ` d'un exécutable Windows, suivi d'octets binaires arbitraires. */
const EXE_BYTES = Buffer.from([0x4d, 0x5a, 0x90, 0x00, 0x03, 0x00, 0x00, 0x00, 0xff, 0xfe, 0x00, 0x01])

const b64 = (bytes: Buffer): string => bytes.toString('base64')

function jsonResponse(body: unknown, status = 200): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response
}

/** Builds a service with the env-gated integration switched on. */
function makeService(): GithubIssueService {
  process.env.FEEDBACK_GITHUB_TOKEN = 'tok'
  process.env.FEEDBACK_GITHUB_REPO = 'Bellum-AI/bellum-monorepo'
  process.env.FEEDBACK_GITHUB_ASSET_BRANCH = 'feedback-assets'
  return new GithubIssueService()
}

describe('GithubIssueService', () => {
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

  describe('uploadAsset', () => {
    it('is a no-op when the integration is disabled', async () => {
      delete process.env.FEEDBACK_GITHUB_TOKEN
      delete process.env.FEEDBACK_GITHUB_REPO
      await expect(new GithubIssueService().uploadAsset(b64(PNG_BYTES), 'image/png', 'capture.png')).resolves.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    /**
     * ⚠️ Preuve que la garde sait dire NON : un binaire qui ne correspond à
     * AUCUNE signature de la liste blanche (et n'est pas du texte lisible —
     * il porte des octets de contrôle) est rejeté SANS toucher le réseau,
     * quoi que le client ait déclaré comme `mimeType`.
     */
    it('rejette un contenu qui ne correspond à AUCUNE signature de la liste blanche, sans toucher le réseau', async () => {
      const service = makeService()
      const garbage = Buffer.from([0x01, 0x02, 0x03, 0xfe, 0xfd, 0x00, 0x10, 0x20])
      await expect(service.uploadAsset(b64(garbage), 'image/png', 'mensonge.png')).resolves.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('ignore le mimeType déclaré par le client — un contenu PNG est accepté même déclaré autre chose', async () => {
      const service = makeService()
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ object: { sha: 'abc' } }))
        .mockResolvedValueOnce(jsonResponse({ content: {} }, 201))

      const result = await service.uploadAsset(b64(PNG_BYTES), 'application/x-msdownload', 'capture.png')

      expect(result?.kind).toBe('png')
      expect(result?.url).toMatch(/\.png\?raw=1$/)
    })

    it.each([
      ['png', PNG_BYTES],
      ['jpg', JPEG_BYTES],
      ['gif', GIF_BYTES],
      ['webp', WEBP_BYTES],
      ['pdf', PDF_BYTES],
      ['txt', TXT_BYTES],
    ] as const)('accepte un %s reconnu par sa signature et écrit l’extension qui en découle', async (kind, bytes) => {
      const service = makeService()
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ object: { sha: 'abc' } }))
        .mockResolvedValueOnce(jsonResponse({ content: {} }, 201))

      const result = await service.uploadAsset(b64(bytes), 'application/octet-stream', `pièce.${kind}`)

      expect(result?.kind).toBe(kind)
      expect(result?.url).toMatch(new RegExp(`\\.${kind}\\?raw=1$`))
      const [, put] = fetchMock.mock.calls[1] as [string, RequestInit]
      expect(JSON.parse(String(put.body)).content).toBe(b64(bytes))
    })

    /**
     * ⚠️⚠️ LE CŒUR DE LA GARDE — #1792. Un SVG est un document actif : même
     * envoyé avec `mimeType: 'text/plain'` (donc passé le pré-filtre du DTO),
     * il porte du script et ne doit JAMAIS être accepté comme « texte ».
     */
    it('refuse un SVG même déguisé en texte brut — un document actif ne se glisse pas sous .txt', async () => {
      const service = makeService()
      await expect(service.uploadAsset(b64(SVG_BYTES), 'text/plain', 'inoffensif.txt')).resolves.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refuse un exécutable — l’en-tête MZ ne correspond à aucun type de la liste blanche', async () => {
      const service = makeService()
      await expect(service.uploadAsset(b64(EXE_BYTES), 'image/png', 'photo.png')).resolves.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    /**
     * ⚠️⚠️ LA PREUVE QUE LE NOM PIÉGÉ EST INERTE — #1792. `filenameHint`
     * porte une tentative de traversée de chemin ; le chemin RÉELLEMENT
     * envoyé à l'API GitHub ne doit contenir ni `..`, ni `evil`, ni aucun
     * fragment du nom fourni — seul un identifiant généré ici et l'extension
     * de la liste blanche le composent.
     */
    it('rend un nom de fichier piégé (`../../evil.png`) totalement inerte sur le chemin déposé', async () => {
      const service = makeService()
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ object: { sha: 'abc' } }))
        .mockResolvedValueOnce(jsonResponse({ content: {} }, 201))

      const result = await service.uploadAsset(b64(PNG_BYTES), 'image/png', '../../evil.png')

      expect(result?.url).not.toContain('..')
      expect(result?.url).not.toContain('evil')
      expect(result?.url).toMatch(
        /^https:\/\/github\.com\/Bellum-AI\/bellum-monorepo\/blob\/feedback-assets\/attachments\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.png\?raw=1$/,
      )
      const [putUrl, put] = fetchMock.mock.calls[1] as [string, RequestInit]
      expect(putUrl).not.toContain('..')
      expect(putUrl).not.toContain('evil')
      const body = JSON.parse(String(put.body)) as { content: string; branch: string }
      expect(body.content).toBe(b64(PNG_BYTES))
      expect(body.branch).toBe('feedback-assets')
    })

    /** Un `../` mène en dehors du dossier du jour : même issue, même inertie. */
    it('rend un nom de fichier piégé absolu (`/etc/passwd`) tout aussi inerte', async () => {
      const service = makeService()
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ object: { sha: 'abc' } }))
        .mockResolvedValueOnce(jsonResponse({ content: {} }, 201))

      const result = await service.uploadAsset(b64(TXT_BYTES), 'text/plain', '/etc/passwd')

      expect(result?.url).not.toContain('etc')
      expect(result?.url).not.toContain('passwd')
      expect(result?.url).toMatch(/\/attachments\/\d{4}-\d{2}-\d{2}\/[0-9a-f-]+\.txt\?raw=1$/)
    })

    it('creates the asset branch off the default branch when it is missing', async () => {
      const service = makeService()
      fetchMock
        .mockResolvedValueOnce(jsonResponse({}, 404)) // asset branch missing
        .mockResolvedValueOnce(jsonResponse({ default_branch: 'main' }))
        .mockResolvedValueOnce(jsonResponse({ object: { sha: 'head-sha' } }))
        .mockResolvedValueOnce(jsonResponse({}, 201)) // ref created
        .mockResolvedValueOnce(jsonResponse({}, 201)) // contents PUT

      await expect(service.uploadAsset(b64(PNG_BYTES), 'image/png', 'capture.png')).resolves.toMatchObject({
        kind: 'png',
      })
      const [refUrl, refInit] = fetchMock.mock.calls[3] as [string, RequestInit]
      expect(refUrl).toContain('/git/refs')
      expect(JSON.parse(String(refInit.body))).toEqual({ ref: 'refs/heads/feedback-assets', sha: 'head-sha' })
    })

    it('returns null when the upload fails so the report is still stored', async () => {
      const service = makeService()
      fetchMock
        .mockResolvedValueOnce(jsonResponse({ object: { sha: 'abc' } }))
        .mockResolvedValueOnce(jsonResponse({ message: 'nope' }, 403))
      await expect(service.uploadAsset(b64(PNG_BYTES), 'image/png', 'capture.png')).resolves.toBeNull()
    })

    it('swallows network errors', async () => {
      const service = makeService()
      fetchMock.mockRejectedValue(new Error('offline'))
      await expect(service.uploadAsset(b64(PNG_BYTES), 'image/png', 'capture.png')).resolves.toBeNull()
    })
  })

  describe('cycle de vie des retours', () => {
    it('rend l’état des issues, sans les pull requests', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(
        jsonResponse([
          {
            number: 913,
            title: '[beta:bug] marche pas',
            state: 'open',
            html_url: 'https://github.com/o/r/issues/913',
            comments: 2,
            updated_at: '2026-08-14T18:00:00Z',
            closed_at: null,
            labels: [{ name: 'beta-feedback' }, 'feedback:bug'],
          },
          // L'endpoint `issues` rend AUSSI les PR : les compter fausserait les
          // compteurs de l'écran.
          { number: 914, title: 'une PR', state: 'open', html_url: 'x', comments: 0, pull_request: {} },
        ]),
      )

      const issues = await service.listIssues()

      expect(issues).toEqual([
        {
          number: 913,
          state: 'open',
          title: '[beta:bug] marche pas',
          url: 'https://github.com/o/r/issues/913',
          comments: 2,
          updatedAt: '2026-08-14T18:00:00Z',
          closedAt: null,
          labels: ['beta-feedback', 'feedback:bug'],
        },
      ])
      const [url] = fetchMock.mock.calls[0] as [string]
      expect(url).toContain('labels=beta-feedback')
      expect(url).toContain('state=all')
    })

    // La distinction qui porte tout l'écran : « rien à signaler » n'est pas
    // « je n'ai pas pu regarder ».
    it('rend null — et non un tableau vide — quand GitHub ne répond pas', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'boom' }, 502))
      await expect(service.listIssues()).resolves.toBeNull()
    })

    it('ne touche à rien quand l’intégration est éteinte', async () => {
      delete process.env.FEEDBACK_GITHUB_TOKEN
      delete process.env.FEEDBACK_GITHUB_REPO
      const service = new GithubIssueService()
      await expect(service.listIssues()).resolves.toBeNull()
      await expect(service.setIssueState(1, 'closed')).resolves.toBe(false)
      await expect(service.addComment(1, 'x')).resolves.toBe(false)
      await expect(service.listComments(1)).resolves.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('ferme une issue via PATCH', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(jsonResponse({ number: 913, state: 'closed' }))

      await expect(service.setIssueState(913, 'closed')).resolves.toBe(true)

      const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
      expect(url).toBe('https://api.github.com/repos/Bellum-AI/bellum-monorepo/issues/913')
      expect(init.method).toBe('PATCH')
      expect(JSON.parse(String(init.body))).toEqual({ state: 'closed' })
    })

    it('dit false quand le commentaire n’est pas parti', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'nope' }, 403))
      await expect(service.addComment(913, 'coucou')).resolves.toBe(false)
    })

    it('rend le fil de discussion', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(
        jsonResponse([{ id: 1, user: { login: 'louis' }, body: 'corrigé', created_at: '2026-08-14T19:00:00Z' }]),
      )

      await expect(service.listComments(913)).resolves.toEqual([
        { id: 1, author: 'louis', body: 'corrigé', createdAt: '2026-08-14T19:00:00Z' },
      ])
    })
  })

  describe('codeExcerpt', () => {
    const FILE = ['const a = 1', 'const b = 2', 'const c = 3', 'const d = 4'].join('\n')
    const contents = () => jsonResponse({ content: Buffer.from(FILE, 'utf8').toString('base64'), encoding: 'base64' })

    it('lit le fichier AU COMMIT demandé et marque la ligne pointée', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(contents())

      const excerpt = await service.codeExcerpt('apps/web/src/x.tsx:3:5', 'a1b2c3d4e5', 1)

      const [url] = fetchMock.mock.calls[0] as [string]
      expect(url).toBe(
        'https://api.github.com/repos/Bellum-AI/bellum-monorepo/contents/apps/web/src/x.tsx?ref=a1b2c3d4e5',
      )
      expect(excerpt).toEqual({
        path: 'apps/web/src/x.tsx',
        line: 3,
        ref: 'a1b2c3d4e5',
        snippet: ['     2 | const b = 2', '>    3 | const c = 3', '     4 | const d = 4'].join('\n'),
      })
    })

    // Sans commit, la seule lecture possible serait celle d'aujourd'hui — donc
    // potentiellement d'autres lignes que celles vues par le rapporteur.
    it('ne lit RIEN sans commit', async () => {
      const service = makeService()
      await expect(service.codeExcerpt('apps/web/src/x.tsx:3:5', null)).resolves.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('refuse un chemin qui sort du dépôt', async () => {
      const service = makeService()
      await expect(service.codeExcerpt('../../etc/passwd:1:1', 'a1b2c3d4e5')).resolves.toBeNull()
      await expect(service.codeExcerpt('/etc/passwd:1:1', 'a1b2c3d4e5')).resolves.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('rend null quand le fichier n’existe pas à ce commit — l’issue s’ouvre quand même', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Not Found' }, 404))
      await expect(service.codeExcerpt('apps/web/src/x.tsx:3:5', 'a1b2c3d4e5')).resolves.toBeNull()
    })
  })

  /**
   * #1658.2 — la première réponse HUMAINE de chaque retour, en un appel GraphQL.
   *
   * Le cas qui porte tout le reste : chaque issue de retour reçoit dans la
   * minute un lien-retour automatique. Le compter afficherait « répondu en
   * 3 min » sur des retours que personne n'a lus.
   */
  describe('firstHumanResponses', () => {
    function graphql(nodes: unknown[], errors?: unknown[]): Response {
      return jsonResponse({ data: { repository: { issues: { nodes } } }, ...(errors ? { errors } : {}) })
    }

    it('ne touche pas le réseau quand l’intégration est éteinte', async () => {
      delete process.env.FEEDBACK_GITHUB_TOKEN
      delete process.env.FEEDBACK_GITHUB_REPO
      await expect(new GithubIssueService().firstHumanResponses()).resolves.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })

    it('IGNORE les commentaires de robots — un lien-retour n’est pas une réponse', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(
        graphql([
          {
            number: 1658,
            comments: {
              nodes: [
                { createdAt: '2026-09-06T11:12:21Z', author: { __typename: 'Bot' } },
                { createdAt: '2026-09-07T13:55:55Z', author: { __typename: 'User' } },
              ],
            },
          },
        ]),
      )
      const premieres = await service.firstHumanResponses()
      expect(premieres?.get(1658)).toBe('2026-09-07T13:55:55Z')
    })

    it('prend la PLUS ANCIENNE réponse humaine, quel que soit l’ordre rendu', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(
        graphql([
          {
            number: 7,
            comments: {
              nodes: [
                { createdAt: '2026-09-07T13:00:00Z', author: { __typename: 'User' } },
                { createdAt: '2026-09-05T09:00:00Z', author: { __typename: 'User' } },
              ],
            },
          },
        ]),
      )
      const premieres = await service.firstHumanResponses()
      expect(premieres?.get(7)).toBe('2026-09-05T09:00:00Z')
    })

    it('une issue sans réponse humaine est ABSENTE de la carte — elle n’y vaut pas `null`', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(
        graphql([
          { number: 8, comments: { nodes: [{ createdAt: '2026-09-06T11:00:00Z', author: { __typename: 'Bot' } }] } },
          { number: 9, comments: { nodes: [] } },
        ]),
      )
      const premieres = await service.firstHumanResponses()
      expect(premieres?.size).toBe(0)
      // Et surtout : la carte EXISTE. C'est ce qui distingue « personne n'a
      // répondu » de « je n'ai pas pu regarder ».
      expect(premieres).not.toBeNull()
    })

    it('rend `null` sur une réponse 200 QUI PORTE DES ERREURS — une carte partielle ment', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(graphql([], [{ message: 'rate limited' }]))
      await expect(service.firstHumanResponses()).resolves.toBeNull()
    })

    it('rend `null` sur une panne, jamais une carte vide', async () => {
      const service = makeService()
      fetchMock.mockResolvedValueOnce(jsonResponse({ message: 'Bad credentials' }, 401))
      await expect(service.firstHumanResponses()).resolves.toBeNull()

      fetchMock.mockRejectedValueOnce(new Error('offline'))
      await expect(service.firstHumanResponses()).resolves.toBeNull()
    })
  })
})
