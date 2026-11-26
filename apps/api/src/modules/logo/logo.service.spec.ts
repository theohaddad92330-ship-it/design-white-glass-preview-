/// <reference types="jest" />
import { LogoService } from './logo.service'

const APOLLO = 'https://zenprospect-production.s3.amazonaws.com/uploads/pictures/abc/original_logo.png'
/** The shape prod actually serves: no extension, and no `Content-Type` at all. */
const APOLLO_PICTURE = 'https://zenprospect-production.s3.amazonaws.com/uploads/pictures/abc/picture'
const FAVICON = 'https://www.google.com/s2/favicons?domain=vinci.com&sz=128'

/** Real signatures — a sniffer asserted against invented bytes proves nothing. */
const MAGIC = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13],
  jpeg: [0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1],
  gif: [...Buffer.from('GIF89a'), 1, 0, 1, 0, 0, 0],
  webp: [...Buffer.from('RIFF'), 26, 0, 0, 0, ...Buffer.from('WEBPVP8 ')],
  avif: [0, 0, 0, 24, ...Buffer.from('ftypavif'), 0, 0, 0, 0],
  ico: [0x00, 0x00, 0x01, 0x00, 1, 0, 16, 16, 0, 0, 1, 0],
  svg: [...Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>')],
  html: [...Buffer.from('<!DOCTYPE html><html><body>nope')],
  json: [...Buffer.from('{"error":"NoSuchKey"}')],
  mp4: [0, 0, 0, 24, ...Buffer.from('ftypisom'), 0, 0, 0, 0],
}

function pngResponse(bytes = [137, 80, 78, 71], contentType = 'image/png'): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as unknown as Response
}

/** A 200 with NO `content-type` header whatsoever — Apollo's S3, verbatim. */
function headerlessResponse(bytes: number[]): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    arrayBuffer: async () => new Uint8Array(bytes).buffer,
  } as unknown as Response
}

const notFound = (): Response => ({ ok: false, status: 404, headers: new Headers() }) as unknown as Response

function makeService() {
  const fetchMock = jest.fn()
  global.fetch = fetchMock as unknown as typeof fetch
  return { service: new LogoService(), fetchMock }
}

describe('LogoService', () => {
  afterEach(() => jest.restoreAllMocks())

  it('returns the upstream bytes and content type', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockResolvedValue(pngResponse())
    const out = await service.fetchLogo({ src: APOLLO })
    expect(out).not.toBeNull()
    expect(out?.contentType).toBe('image/png')
    expect(Array.from(out!.body)).toEqual([137, 80, 78, 71])
  })

  it.each(['image/svg+xml', 'image/svg+xml; charset=utf-8', 'IMAGE/SVG+XML'])(
    'refuse un SVG (%s) : script exécutable sur NOTRE origine',
    async contentType => {
      // Un SVG est un DOCUMENT, pas seulement une image : ouvert directement,
      // son `<script>` s'exécute sur l'origine de l'API — celle qui porte les
      // cookies d'auth. `src` étant fourni par le client, tout objet du bucket
      // autorisé est demandable, donc le type ne se déduit pas de l'hôte.
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(pngResponse([60, 115, 118, 103], contentType))

      expect(await service.fetchLogo({ src: APOLLO })).toBeNull()
    },
  )

  it.each(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/x-icon', 'image/avif'])(
    'accepte un format bitmap inerte (%s)',
    async contentType => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(pngResponse([1, 2, 3], contentType))

      expect(await service.fetchLogo({ src: APOLLO })).not.toBeNull()
    },
  )

  describe('en-tête absent ou générique — on lit les OCTETS (régression prod)', () => {
    // Apollo sert ses objets S3 avec un `Content-Type` VIDE :
    //   curl -I .../uploads/pictures/<id>/picture
    //   HTTP/1.1 200 OK   Content-Type:    Content-Length: 3786
    // …pour un vrai JPEG 200×200. La liste blanche testait l'en-tête, donc ''
    // était refusé et AUCUN compte enrichi par Apollo n'affichait son logo.
    // Les tests d'origine ne l'ont pas vu : ils utilisaient `original_logo.png`
    // avec un type correct, une URL que la prod ne sert jamais.

    it.each([
      ['png', MAGIC.png, 'image/png'],
      ['jpeg', MAGIC.jpeg, 'image/jpeg'],
      ['gif', MAGIC.gif, 'image/gif'],
      ['webp', MAGIC.webp, 'image/webp'],
      ['avif', MAGIC.avif, 'image/avif'],
      ['ico', MAGIC.ico, 'image/x-icon'],
    ])('relaie un %s identifié par sa signature malgré un en-tête vide', async (_name, bytes, expected) => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(headerlessResponse(bytes))

      const out = await service.fetchLogo({ src: APOLLO_PICTURE })

      expect(out).not.toBeNull()
      // Le type annoncé au navigateur vient des OCTETS, jamais de l'en-tête —
      // relayer un type non vérifié serait exactement le trou qu'on ferme.
      expect(out?.contentType).toBe(expected)
    })

    it.each(['application/octet-stream', 'binary/octet-stream'])(
      'considère %s comme une non-déclaration et renifle aussi',
      async contentType => {
        const { service, fetchMock } = makeService()
        fetchMock.mockResolvedValue(pngResponse(MAGIC.png, contentType))

        const out = await service.fetchLogo({ src: APOLLO_PICTURE })

        expect(out?.contentType).toBe('image/png')
      },
    )

    it.each([
      ['un SVG', MAGIC.svg],
      ['du HTML', MAGIC.html],
      ['du JSON', MAGIC.json],
      ['une vidéo MP4 (ftyp non-avif)', MAGIC.mp4],
      ['des octets non identifiables', [1, 2, 3, 4, 5, 6, 7, 8]],
    ])('refuse %s : le reniflage n’autorise QUE des bitmaps inertes reconnus', async (_name, bytes) => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(headerlessResponse(bytes))

      expect(await service.fetchLogo({ src: APOLLO_PICTURE })).toBeNull()
    })

    it.each(['image/svg+xml', 'text/html', 'application/json', 'image/svg+xml; charset=utf-8'])(
      'refuse SANS renifler quand l’en-tête déclare explicitement %s',
      async contentType => {
        // Un en-tête explicite est une DÉCLARATION : on ne la contourne pas.
        // Même avec des octets PNG parfaits, un `text/html` reste refusé — sinon
        // il suffirait de préfixer 8 octets à une page pour la faire relayer.
        const { service, fetchMock } = makeService()
        fetchMock.mockResolvedValue(pngResponse(MAGIC.png, contentType))

        expect(await service.fetchLogo({ src: APOLLO_PICTURE })).toBeNull()
      },
    )

    it('ne relaie pas un corps vide même avec un en-tête correct', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(pngResponse([], 'image/png'))

      expect(await service.fetchLogo({ src: APOLLO })).toBeNull()
    })
  })

  describe('repli src → domain (régression prod : le domaine seul marchait)', () => {
    // `resolveLogoSource` connaissait déjà la précédence src → domain, mais
    // seulement en RÉSOLUTION : le service ne tentait que la première source et
    // abandonnait. D'où l'effet pervers : un compte enrichi par Apollo
    // n'affichait aucun logo, là où un compte SANS `logo_url` retombait sur le
    // favicon et s'affichait. Plus la donnée était riche, moins ça marchait.

    it('retombe sur le favicon du domaine quand src répond 404', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValueOnce(notFound()).mockResolvedValueOnce(pngResponse(MAGIC.png))

      const out = await service.fetchLogo({ src: APOLLO, domain: 'vinci.com' })

      expect(out).not.toBeNull()
      expect(fetchMock.mock.calls[0]![0]).toBe(APOLLO)
      expect(fetchMock.mock.calls[1]![0]).toBe(FAVICON)
    })

    it('retombe sur le favicon quand le type de src est refusé', async () => {
      const { service, fetchMock } = makeService()
      fetchMock
        .mockResolvedValueOnce(pngResponse(MAGIC.svg, 'image/svg+xml'))
        .mockResolvedValueOnce(pngResponse(MAGIC.png))

      expect(await service.fetchLogo({ src: APOLLO, domain: 'vinci.com' })).not.toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('retombe sur le favicon quand src expire (timeout)', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockRejectedValueOnce(new Error('ETIMEDOUT')).mockResolvedValueOnce(pngResponse(MAGIC.png))

      expect(await service.fetchLogo({ src: APOLLO, domain: 'vinci.com' })).not.toBeNull()
    })

    it('n’essaie PAS le favicon quand src a réussi — une seule requête sortante', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(pngResponse(MAGIC.png))

      await service.fetchLogo({ src: APOLLO, domain: 'vinci.com' })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]![0]).toBe(APOLLO)
    })

    it('rend 404 quand les DEUX sources échouent — l’initiale est la réponse honnête', async () => {
      // Cas réel : edf.fr, dont le favicon Google répond 404. On n'invente pas
      // de placeholder, on laisse l'avatar afficher son initiale.
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(notFound())

      expect(await service.fetchLogo({ src: APOLLO, domain: 'edf.fr' })).toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('ne tente jamais une source hors liste blanche, même en repli', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(pngResponse(MAGIC.png))

      await service.fetchLogo({ src: 'https://evil.example.com/x.png', domain: 'vinci.com' })

      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(fetchMock.mock.calls[0]![0]).toBe(FAVICON)
    })

    it('sert le repli depuis le memo sans rappeler le réseau', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValueOnce(notFound()).mockResolvedValueOnce(pngResponse(MAGIC.png))
      await service.fetchLogo({ src: APOLLO, domain: 'vinci.com' })
      fetchMock.mockClear()

      // Le favicon est mémoïsé ; src reste un échec, donc non mémoïsé — mais il
      // ne doit pas être retenté indéfiniment au point de coûter une requête à
      // chaque montage : le memo du favicon court-circuite dès le second appel.
      const out = await service.fetchLogo({ domain: 'vinci.com' })

      expect(out).not.toBeNull()
      expect(fetchMock).not.toHaveBeenCalled()
    })
  })

  describe('redirections (régression prod : plus aucun logo)', () => {
    // `www.google.com/s2/favicons` répond 301 vers `t3.gstatic.com/faviconV2`.
    // Refuser toute redirection tuait donc TOUTE la branche favicon : chaque
    // avatar retombait sur son initiale. On suit, mais on re-valide chaque saut.
    const redirect = (location: string): Response =>
      ({ ok: false, status: 301, headers: new Headers({ location }) }) as unknown as Response

    const GSTATIC = 'https://t3.gstatic.com/faviconV2?client=SOCIAL&url=http://vinci.com&size=128'

    it('suit la redirection de Google vers gstatic et rend l’image', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValueOnce(redirect(GSTATIC)).mockResolvedValueOnce(pngResponse([1, 2, 3]))

      const out = await service.fetchLogo({ domain: 'vinci.com' })

      expect(out).not.toBeNull()
      expect(fetchMock.mock.calls[1]![0]).toBe(GSTATIC)
    })

    it.each([
      ['http://t3.gstatic.com/x.png', 'http (rétrogradation)'],
      ['https://t3.gstatic.com:8443/x.png', 'port explicite'],
      ['https://user:pw@t3.gstatic.com/x.png', 'identifiants'],
      ['https://169.254.169.254/latest/meta-data', 'métadonnées cloud'],
      ['https://127.0.0.1/x.png', 'boucle locale'],
      ['https://t3.gstatic.com.evil.com/x.png', 'suffixe trompeur'],
      ['https://evil.com/t3.gstatic.com', 'hôte dans le chemin'],
    ])('refuse une redirection vers %s (%s)', async location => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValueOnce(redirect(location)).mockResolvedValue(pngResponse())

      expect(await service.fetchLogo({ domain: 'vinci.com' })).toBeNull()
      // Le saut interdit ne doit JAMAIS être émis.
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('borne le nombre de sauts au lieu de boucler', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(redirect(GSTATIC))

      expect(await service.fetchLogo({ domain: 'vinci.com' })).toBeNull()
      expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(4)
    })

    it('refuse une redirection sans en-tête Location', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValueOnce({ ok: false, status: 302, headers: new Headers() } as unknown as Response)

      expect(await service.fetchLogo({ domain: 'vinci.com' })).toBeNull()
    })

    it('ne rend pas le globe générique que Google sert en 404', async () => {
      // Un placeholder n'est pas le logo de CETTE entreprise : l'initiale est
      // la réponse honnête.
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 404,
        headers: new Headers({ 'content-type': 'image/png' }),
        arrayBuffer: async () => new Uint8Array([1]).buffer,
      } as unknown as Response)

      expect(await service.fetchLogo({ domain: 'edf.fr' })).toBeNull()
    })
  })

  it('fetches the resolved allow-listed URL, never the raw input', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockResolvedValue(pngResponse())
    await service.fetchLogo({ src: 'https://evil.example.com/x.png', domain: 'vinci.com' })
    const [url] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://www.google.com/s2/favicons?domain=vinci.com&sz=128')
  })

  it('never follows redirects — that is how a pinned host reaches a private range', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockResolvedValue(pngResponse())
    await service.fetchLogo({ src: APOLLO })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.redirect).toBe('manual')
  })

  it('bounds the upstream call with a timeout signal', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockResolvedValue(pngResponse())
    await service.fetchLogo({ src: APOLLO })
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(init.signal).toBeInstanceOf(AbortSignal)
  })

  it('does not call the network at all when nothing resolves', async () => {
    const { service, fetchMock } = makeService()
    const out = await service.fetchLogo({ src: 'https://evil.example.com/x.png' })
    expect(out).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('degrades to null on a 404 rather than throwing', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockResolvedValue({ ok: false, status: 404, headers: new Headers() } as unknown as Response)
    await expect(service.fetchLogo({ src: APOLLO })).resolves.toBeNull()
  })

  it('degrades to null on a redirect response (manual redirect surfaces as 3xx)', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockResolvedValue({
      ok: false,
      status: 302,
      headers: new Headers({ location: 'http://169.254.169.254/' }),
    } as unknown as Response)
    await expect(service.fetchLogo({ src: APOLLO })).resolves.toBeNull()
  })

  it('degrades to null when the upstream throws or times out', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockRejectedValue(new Error('ETIMEDOUT'))
    await expect(service.fetchLogo({ src: APOLLO })).resolves.toBeNull()
  })

  it('refuses a non-image upstream payload — this endpoint only relays images', async () => {
    const { service, fetchMock } = makeService()
    fetchMock.mockResolvedValue(pngResponse([1, 2], 'text/html'))
    await expect(service.fetchLogo({ src: APOLLO })).resolves.toBeNull()
  })

  it('refuses an oversized payload', async () => {
    const { service, fetchMock } = makeService()
    const huge = new Uint8Array(3 * 1024 * 1024)
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'image/png' }),
      arrayBuffer: async () => huge.buffer,
    } as unknown as Response)
    await expect(service.fetchLogo({ src: APOLLO })).resolves.toBeNull()
  })

  describe('server-side memo', () => {
    it('serves a repeat hit without touching the network', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(pngResponse())
      const first = await service.fetchLogo({ src: APOLLO })
      const second = await service.fetchLogo({ src: APOLLO })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      expect(second).toEqual(first)
    })

    it('keys the memo on the resolved URL, not on the request shape', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(pngResponse())
      await service.fetchLogo({ domain: 'vinci.com' })
      await service.fetchLogo({ domain: 'https://www.vinci.com/fr' })
      expect(fetchMock).toHaveBeenCalledTimes(1)
    })

    it('never memoises a failure — a transient upstream blip must be retried', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockRejectedValueOnce(new Error('boom')).mockResolvedValue(pngResponse())
      await expect(service.fetchLogo({ src: APOLLO })).resolves.toBeNull()
      await expect(service.fetchLogo({ src: APOLLO })).resolves.not.toBeNull()
      expect(fetchMock).toHaveBeenCalledTimes(2)
    })

    it('stays bounded — an unbounded map on a public route is a memory leak', async () => {
      const { service, fetchMock } = makeService()
      fetchMock.mockResolvedValue(pngResponse())
      for (let i = 0; i < 600; i++) await service.fetchLogo({ domain: `c${i}.com` })
      expect(service.memoSize()).toBeLessThanOrEqual(512)
    })
  })
})
