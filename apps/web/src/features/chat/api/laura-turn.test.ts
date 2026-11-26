/**
 * #1958.8 — la porte du tour de Laura transmet la langue de l'INTERFACE.
 *
 * `laura-turn.ts` est la SEULE porte du navigateur vers `POST /ia/chat`
 * (GA-237) : le champ se pose ICI, dérivé de `i18n.language` — jamais dans un
 * appelant, qui aurait à s'en souvenir. Absent de la requête = français côté
 * serveur (rétrocompatibilité) ; ici on teste ce que la porte ENVOIE, pas ce
 * que le serveur en fait.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n'
import { askLaura, askLauraStreaming } from './laura-turn'

function mockStreamResponse(): Response {
  const encoder = new TextEncoder()
  const frame = `data: ${JSON.stringify({ type: 'done', success: true, data: { reply: 'ok' } })}\n\n`
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(frame))
      controller.close()
    },
  })
  return new Response(stream, { status: 200 })
}

describe('#2453 — le mode de contexte voyage dans le corps du tour', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envoie le mode choisi', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    await askLaura({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [], contextMode: 'neutral' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).contextMode).toBe('neutral')
  })

  it('sans mode, la clé n’est pas envoyée — corps d’avant ce lot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    await askLaura({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('contextMode')
  })
})

describe('#2450.1 (reste partiel, épopée #2882) — le mode de recherche voyage dans le corps du tour', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envoie le mode choisi quand il force le palier de modèle', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    await askLaura({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [], mode: 'approfondi' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).mode).toBe('approfondi')
  })

  it('sans mode, la clé n’est pas envoyée — corps d’avant ce champ', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    await askLaura({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('mode')
  })

  it('« auto » n’est pas envoyé non plus — même comportement qu’une clé absente', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    await askLaura({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [], mode: 'auto' })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('mode')
  })
})

describe('#2148.16 — la pièce jointe de conversation (cas a) voyage dans le corps du tour', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envoie le texte déjà extrait, jamais un identifiant', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    await askLaura({
      message: 'Que dit ce CV ?',
      accountId: null,
      conversationId: 'c-1',
      history: [],
      attachedFiles: [{ name: 'cv.pdf', text: 'Jean Dupont, développeur.' }],
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).attachedFiles).toEqual([
      { name: 'cv.pdf', text: 'Jean Dupont, développeur.' },
    ])
  })

  it('sans pièce, la clé part vide — corps d’avant ce lot pour tout appelant qui l’ignore', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    await askLaura({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).attachedFiles).toEqual([])
  })
})

describe('#1951.2 / #1951.3 — la portée objet voyage dans le corps du tour', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envoie la nature et l’identifiant du consultant — jamais son nom', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)

    const id = '6f1c1b1e-8a51-4c2f-9d1e-2b9d0c7a4e11'
    await askLaura({
      message: 'Où la positionner ?',
      accountId: null,
      conversationId: 'c-1',
      history: [],
      scopeObject: { kind: 'consultant', id },
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.scopeObject).toEqual({ kind: 'consultant', id })
    expect(body.accountId).toBeNull()
  })

  it('sans portée objet, la clé n’est pas envoyée — corps d’avant ce lot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)

    await askLaura({ message: 'Bonjour', accountId: null, conversationId: 'general', history: [], scopeObject: null })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('scopeObject')
  })
})

describe('#2428.12 — la mention voyage par son id CANONIQUE, jamais un texte seul', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envoie `mentionedUserId` quand un collègue a été choisi au clic', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)

    await askLaura({
      message: 'Peux-tu résumer avec Théo ?',
      accountId: null,
      conversationId: 'c-1',
      history: [],
      mentionedUserId: 'u-2',
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.mentionedUserId).toBe('u-2')
  })

  it('sans mention, la clé n’est pas envoyée — corps d’avant ce lot', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)

    await askLaura({ message: 'Bonjour', accountId: null, conversationId: 'general', history: [] })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('mentionedUserId')
  })
})

describe('#1958.8 — la langue de l’interface voyage dans le corps du tour', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    void i18n.changeLanguage('fr')
  })

  it('envoie "fr" quand l’interface est en français (le défaut du produit)', async () => {
    await i18n.changeLanguage('fr')
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)

    await askLaura({ message: 'Bonjour', accountId: null, conversationId: 'general', history: [] })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.interfaceLanguage).toBe('fr')
  })

  it('envoie "en" quand l’interface est en anglais', async () => {
    await i18n.changeLanguage('en')
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)

    await askLaura({ message: 'Hello', accountId: null, conversationId: 'general', history: [] })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body.interfaceLanguage).toBe('en')
  })

  it('ne casse jamais le corps existant — les autres champs restent inchangés', async () => {
    await i18n.changeLanguage('fr')
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)

    await askLaura({
      message: 'Bonjour',
      accountId: 'acc-1',
      conversationId: 'account-acc-1',
      history: [{ role: 'user', content: 'Salut' }],
      documentIds: ['doc-1'],
      clarificationAsked: true,
    })

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    const body = JSON.parse(init.body as string)
    expect(body).toMatchObject({
      message: 'Bonjour',
      accountId: 'acc-1',
      conversationId: 'account-acc-1',
      history: [{ role: 'user', content: 'Salut' }],
      documentIds: ['doc-1'],
      clarificationAsked: true,
      interfaceLanguage: 'fr',
    })
  })
})

/**
 * #1957.8 — « le serveur a ACCEPTÉ le tour » est un fait que la porte connaît :
 * les en-têtes du flux sont partis, donc le plafond est passé. L'écran n'écrit
 * la question dans le fil qu'à ce moment-là — une question refusée au plafond
 * n'entre plus dans le fil, et ne compte plus contre ce même plafond.
 */
describe('#1957.8 — la porte signale l’acceptation du tour', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('appelle onAccepted dès que le flux est ouvert, AVANT la fin de la réponse', async () => {
    const order: string[] = []
    const encoder = new TextEncoder()
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: 'delta', text: 'Bon' })}\n\n`))
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: 'done', success: true, data: { reply: 'Bonjour' } })}\n\n`),
        )
        controller.close()
      },
    })
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(stream, { status: 200 })))

    await askLauraStreaming(
      { message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] },
      { onAccepted: () => order.push('accepted'), onDelta: () => order.push('delta') },
    )

    expect(order).toEqual(['accepted', 'delta'])
  })

  it('ne l’appelle PAS quand le serveur refuse (429 au plafond)', async () => {
    const body = {
      statusCode: 429,
      message: 'Plafond atteint.',
      code: 'chat_quota_reached',
      limit: 50,
      reopensAt: null,
    }
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 429 })))
    const onAccepted = vi.fn()

    await expect(
      askLauraStreaming({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] }, { onAccepted }),
    ).rejects.toMatchObject({ status: 429, code: 'chat_quota_reached', details: body })
    expect(onAccepted).not.toHaveBeenCalled()
  })
})

/**
 * #1901.15 — « même utilisateur, même contexte et mêmes permissions partout ».
 *
 * La bulle appelle `askLaura`, l'écran `/chat` appelle `askLauraStreaming`. Le
 * serveur ne connaît pas la surface : il applique `@RequireFeature('chat_ai')`,
 * le plafond du jour et la résolution du compte (`accounts.findOne(id, userId)`)
 * à CE qu'il reçoit. Si les deux portes envoient la même requête, les deux
 * surfaces subissent donc exactement le même contrôle — c'est ce qui est vérifié
 * ici, octet par octet, plutôt que supposé.
 */
describe('#1901.15 — la bulle et la page envoient la MÊME requête', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('même chemin, même méthode, mêmes identifiants, même corps', async () => {
    const fetchMock = vi.fn().mockImplementation(() => Promise.resolve(mockStreamResponse()))
    vi.stubGlobal('fetch', fetchMock)
    const request = {
      message: 'Où en est ACME ?',
      accountId: 'acc-1',
      conversationId: 'account-acc-1',
      history: [{ role: 'user' as const, content: 'Salut' }],
    }

    await askLaura(request)
    await askLauraStreaming(request, { onDelta: () => undefined })

    const [bubbleUrl, bubbleInit] = fetchMock.mock.calls[0] as [string, RequestInit]
    const [pageUrl, pageInit] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(pageUrl).toBe(bubbleUrl)
    expect(bubbleUrl).toMatch(/\/ia\/chat$/)
    expect(pageInit.method).toBe(bubbleInit.method)
    expect(pageInit.credentials).toBe(bubbleInit.credentials)
    expect(pageInit.headers).toEqual(bubbleInit.headers)
    expect(JSON.parse(pageInit.body as string)).toEqual(JSON.parse(bubbleInit.body as string))
  })
})

describe('#3708.fournisseur — les outils décochés voyagent par identifiant dans le corps du tour', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('envoie les identifiants d’outils exclus', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    await askLaura({
      message: 'Bonjour',
      accountId: null,
      conversationId: 'c-1',
      history: [],
      excludedToolProviders: ['hubspot'],
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string).excludedToolProviders).toEqual(['hubspot'])
  })

  it('sans exclusion, la clé n’est pas envoyée — corps d’avant ce champ', async () => {
    const fetchMock = vi.fn().mockResolvedValue(mockStreamResponse())
    vi.stubGlobal('fetch', fetchMock)
    await askLaura({
      message: 'Bonjour',
      accountId: null,
      conversationId: 'c-1',
      history: [],
      excludedToolProviders: [],
    })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(init.body as string)).not.toHaveProperty('excludedToolProviders')
  })
})

describe('#4540 — un échec côté assistant n’est pas une réponse : il se relance', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function streamOf(event: unknown): Response {
    const frame = `data: ${JSON.stringify(event)}\n\n`
    return new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(frame))
          controller.close()
        },
      }),
      { status: 200 },
    )
  }

  it('le marqueur d’échec du serveur REJETTE (le chemin « Relancer » existant), jamais une bulle d’excuse', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          streamOf({ type: 'done', success: false, data: { reply: 'Désolé…', failure: 'assistant_stream' } }),
        ),
    )
    await expect(
      askLauraStreaming({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] }),
    ).rejects.toMatchObject({ status: 0 })
  })

  it('SAIT DIRE NON : une réponse PARTIELLE (success=false avec texte, sans marqueur) reste rendue', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(streamOf({ type: 'done', success: false, data: { reply: 'Voici ce que j’ai pu lire.' } })),
    )
    const turn = await askLauraStreaming({ message: 'Bonjour', accountId: null, conversationId: 'c-1', history: [] })
    expect(turn.reply).toBe('Voici ce que j’ai pu lire.')
  })
})
