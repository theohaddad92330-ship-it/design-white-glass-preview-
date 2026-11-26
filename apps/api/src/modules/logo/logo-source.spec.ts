/// <reference types="jest" />
import { GOOGLE_FAVICON_HOST, resolveLogoSources } from './logo-source'

/**
 * The resolver now returns EVERY allowed candidate, best first, so the service
 * can actually fall back. These cases are about WHICH hosts may be contacted at
 * all, so they read the preferred one; the ordering and the fallback itself get
 * their own block at the bottom.
 */
const resolveLogoSource = (input: Parameters<typeof resolveLogoSources>[0]): string | null =>
  resolveLogoSources(input)[0] ?? null

describe('resolveLogoSource — pinned allow-list (anti-SSRF)', () => {
  describe('the persisted Apollo logo (`src`)', () => {
    it('accepts the Apollo S3 host the column actually carries', () => {
      const src = 'https://zenprospect-production.s3.amazonaws.com/uploads/pictures/abc/original_logo.png'
      expect(resolveLogoSource({ src })).toBe(src)
    })

    it('is host-pinned: any other host is refused, even over https', () => {
      expect(resolveLogoSource({ src: 'https://evil.example.com/logo.png' })).toBeNull()
      expect(resolveLogoSource({ src: 'https://s3.amazonaws.com/logo.png' })).toBeNull()
      // Suffix smuggling — the pinned host must be the WHOLE host, not a prefix.
      expect(resolveLogoSource({ src: 'https://zenprospect-production.s3.amazonaws.com.evil.com/x.png' })).toBeNull()
      // …and not a subdomain of an attacker-owned parent either.
      expect(resolveLogoSource({ src: 'https://evil.com/zenprospect-production.s3.amazonaws.com' })).toBeNull()
    })

    it('refuses everything that is not plain https on the default port', () => {
      expect(resolveLogoSource({ src: 'http://zenprospect-production.s3.amazonaws.com/l.png' })).toBeNull()
      expect(resolveLogoSource({ src: 'file:///etc/passwd' })).toBeNull()
      expect(resolveLogoSource({ src: 'data:image/png;base64,AAAA' })).toBeNull()
      expect(resolveLogoSource({ src: 'gopher://zenprospect-production.s3.amazonaws.com/' })).toBeNull()
      // An explicit port would let a pinned host be pointed at an odd service.
      expect(resolveLogoSource({ src: 'https://zenprospect-production.s3.amazonaws.com:22/l.png' })).toBeNull()
    })

    it('refuses embedded credentials that make the real host hard to read', () => {
      expect(resolveLogoSource({ src: 'https://zenprospect-production.s3.amazonaws.com@127.0.0.1/l.png' })).toBeNull()
      expect(resolveLogoSource({ src: 'https://user:pass@zenprospect-production.s3.amazonaws.com/l.png' })).toBeNull()
    })

    it('refuses direct private / loopback / link-local targets', () => {
      expect(resolveLogoSource({ src: 'https://127.0.0.1/l.png' })).toBeNull()
      expect(resolveLogoSource({ src: 'https://localhost/l.png' })).toBeNull()
      expect(resolveLogoSource({ src: 'https://169.254.169.254/latest/meta-data/' })).toBeNull()
      expect(resolveLogoSource({ src: 'https://10.0.0.1/l.png' })).toBeNull()
      expect(resolveLogoSource({ src: 'https://[::1]/l.png' })).toBeNull()
    })

    it('ignores junk instead of throwing', () => {
      expect(resolveLogoSource({ src: 'not a url' })).toBeNull()
      expect(resolveLogoSource({ src: '' })).toBeNull()
      expect(resolveLogoSource({})).toBeNull()
    })
  })

  describe('la photo d’un contact (`src`) — le même relais', () => {
    it('accepte le CDN d’images du réseau professionnel, où vivent les photos de membre', () => {
      // Sans cette entrée le relais répondait 404 sur CHAQUE photo, l'avatar
      // retombait proprement sur l'initiale, et à l'écran c'était exactement le
      // défaut signalé en bêta : « il manque les photos de profil ».
      const src = 'https://media.licdn.com/dms/image/v2/D4E03AQ/profile-displayphoto/0/1700000000000?e=1'
      expect(resolveLogoSource({ src })).toBe(src)
    })

    it('refuse le CDN d’ACTIFS, qui ne sert que la silhouette « aucune photo »', () => {
      expect(resolveLogoSource({ src: 'https://static.licdn.com/aero-v1/sc/h/9c8pery4andzj6ohjkjp54ma2' })).toBeNull()
    })

    it('reste épinglé à l’hôte : aucun voisin ne passe', () => {
      expect(resolveLogoSource({ src: 'https://media.licdn.com.evil.example/x.png' })).toBeNull()
      expect(resolveLogoSource({ src: 'https://licdn.com/x.png' })).toBeNull()
      expect(resolveLogoSource({ src: 'http://media.licdn.com/x.png' })).toBeNull()
    })
  })

  describe('the favicon fallback (`domain`)', () => {
    it('builds the Google favicon URL the client used to build itself', () => {
      expect(resolveLogoSource({ domain: 'vinci.com' })).toBe(
        `https://${GOOGLE_FAVICON_HOST}/s2/favicons?domain=vinci.com&sz=128`,
      )
    })

    it('normalises the way the front-end helper does (scheme, www, path, case)', () => {
      const expected = `https://${GOOGLE_FAVICON_HOST}/s2/favicons?domain=vinci.com&sz=128`
      expect(resolveLogoSource({ domain: 'https://www.vinci.com/fr' })).toBe(expected)
      expect(resolveLogoSource({ domain: 'WWW.VINCI.COM' })).toBe(expected)
      expect(resolveLogoSource({ domain: '  vinci.com  ' })).toBe(expected)
    })

    it('can never point the fetch anywhere but Google — the host is a constant', () => {
      // Whatever the caller injects, the resolved URL either is null or starts
      // with the pinned Google origin. This is the property that makes the
      // `domain` branch structurally SSRF-proof.
      for (const hostile of [
        'evil.com',
        '127.0.0.1',
        'foo.com/../../admin',
        'foo.com?x=1#y',
        'foo.com&sz=1',
        'a.com nasty',
      ]) {
        const out = resolveLogoSource({ domain: hostile })
        if (out !== null) expect(out.startsWith(`https://${GOOGLE_FAVICON_HOST}/`)).toBe(true)
      }
    })

    it('refuses IP literals and hostless junk (no favicon exists for those)', () => {
      expect(resolveLogoSource({ domain: '127.0.0.1' })).toBeNull()
      expect(resolveLogoSource({ domain: '169.254.169.254' })).toBeNull()
      expect(resolveLogoSource({ domain: 'localhost' })).toBeNull()
      expect(resolveLogoSource({ domain: '' })).toBeNull()
      expect(resolveLogoSource({ domain: 'nodot' })).toBeNull()
      expect(resolveLogoSource({ domain: 'a.com:8080' })).toBeNull()
      expect(resolveLogoSource({ domain: 'user@a.com' })).toBeNull()
    })

    it('escapes the domain into the query string', () => {
      expect(resolveLogoSource({ domain: 'foo.com&sz=1' })).toBeNull()
    })
  })

  describe('precedence', () => {
    it('prefers the persisted Apollo logo over the favicon — same order as the client', () => {
      const src = 'https://zenprospect-production.s3.amazonaws.com/uploads/pictures/abc/original_logo.png'
      expect(resolveLogoSource({ src, domain: 'vinci.com' })).toBe(src)
    })

    it('falls back to the favicon when the persisted logo is refused or absent', () => {
      const expected = `https://${GOOGLE_FAVICON_HOST}/s2/favicons?domain=vinci.com&sz=128`
      expect(resolveLogoSource({ src: 'https://evil.example.com/l.png', domain: 'vinci.com' })).toBe(expected)
      expect(resolveLogoSource({ src: undefined, domain: 'vinci.com' })).toBe(expected)
    })

    it('returns null when nothing is resolvable — the caller must 404, not guess', () => {
      expect(resolveLogoSource({})).toBeNull()
      expect(resolveLogoSource({ src: 'https://evil.example.com/l.png', domain: '127.0.0.1' })).toBeNull()
    })
  })

  describe('candidate list — the fallback the service executes', () => {
    const APOLLO = 'https://zenprospect-production.s3.amazonaws.com/uploads/pictures/abc/picture'
    const FAVICON = `https://${GOOGLE_FAVICON_HOST}/s2/favicons?domain=vinci.com&sz=128`

    it('offers BOTH sources, Apollo first, so a failing logo can still fall back', () => {
      // The whole prod bug: this used to be a single URL, so a src that failed
      // ended the story — even when the favicon right behind it worked.
      expect(resolveLogoSources({ src: APOLLO, domain: 'vinci.com' })).toEqual([APOLLO, FAVICON])
    })

    it('drops a refused src instead of keeping a hole in the list', () => {
      expect(resolveLogoSources({ src: 'https://evil.example.com/l.png', domain: 'vinci.com' })).toEqual([FAVICON])
    })

    it('offers only what exists', () => {
      expect(resolveLogoSources({ src: APOLLO })).toEqual([APOLLO])
      expect(resolveLogoSources({ domain: 'vinci.com' })).toEqual([FAVICON])
    })

    it('is empty — never a guess — when neither source is usable', () => {
      expect(resolveLogoSources({})).toEqual([])
      expect(resolveLogoSources({ src: 'https://evil.example.com/l.png', domain: 'localhost' })).toEqual([])
    })

    it('never yields a candidate outside the pinned origins', () => {
      for (const src of ['https://169.254.169.254/x', 'https://evil.com/x.png', 'file:///etc/passwd']) {
        for (const url of resolveLogoSources({ src, domain: 'vinci.com' })) {
          expect(url.startsWith(`https://${GOOGLE_FAVICON_HOST}/`)).toBe(true)
        }
      }
    })
  })
})
