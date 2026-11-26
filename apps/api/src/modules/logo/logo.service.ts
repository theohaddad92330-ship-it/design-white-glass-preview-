import { Injectable } from '@nestjs/common'
import { isFollowableRedirect, resolveLogoSources, type LogoSourceInput } from './logo-source'

/** Upstream logo hosts are third parties — never let one hang a request. */
const FETCH_TIMEOUT_MS = 4000
/** A company logo/favicon is a few KB. Anything past this is not a logo. */
const MAX_BYTES = 512 * 1024
/** A pinned host needs one hop (Google → gstatic); more means a loop. */
const MAX_REDIRECTS = 3
/** Bounded memo: a public route must not grow a map without a ceiling. */
const MEMO_MAX_ENTRIES = 512

/**
 * Image types we relay — an ALLOW-list of inert bitmap formats, deliberately
 * NOT `image/*`.
 *
 * `image/svg+xml` is the reason. An SVG is a DOCUMENT: opened directly rather
 * than through an `<img>`, its `<script>` runs on the origin that served it —
 * ours, the one carrying the auth cookies. And `src` is caller-supplied, so any
 * object on the allow-listed bucket can be requested: the host tells us nothing
 * about the bytes. Naming the safe formats is the only bound that holds.
 */
const RELAYABLE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/x-icon',
  'image/vnd.microsoft.icon',
] as const

/**
 * The only types this route may ever put on the wire.
 *
 * Typing the sniffer's output with THIS union is what makes "sniffing cannot
 * widen the allow-list" a compile-time fact rather than a comment: adding a
 * signature for a format not listed above stops the build.
 */
type RelayableType = (typeof RELAYABLE_TYPES)[number]

const isRelayableType = (type: string): boolean => (RELAYABLE_TYPES as readonly string[]).includes(type)

const MEMO_TTL_MS = 60 * 60 * 1000

/**
 * Content-Type values that assert NOTHING and must not be taken as a refusal.
 *
 * Apollo's S3 serves its logo objects with an EMPTY `Content-Type` — measured:
 *
 *   curl -I …/uploads/pictures/<id>/picture
 *   HTTP/1.1 200 OK   Content-Type:    Content-Length: 3786
 *
 * …for a perfectly valid 200×200 JPEG. Matching that '' against
 * {@link RELAYABLE_TYPES} rejected every Apollo logo in production, so an
 * account ENRICHED by Apollo showed no logo while an account with no
 * `logo_url` at all fell through to the favicon and rendered fine.
 *
 * An absent or `octet-stream` header is a non-declaration, not a declaration of
 * something unsafe. Only for these do we look at the bytes.
 */
const UNDECLARED_TYPES: readonly string[] = ['', 'application/octet-stream', 'binary/octet-stream']

/**
 * Magic-byte signatures of the INERT bitmap formats — the same set as
 * {@link RELAYABLE_TYPES}, recognised from the payload instead of the header.
 *
 * This is a narrow allow-list, not a general sniffer: it answers "are these
 * bytes definitely one of the formats we already relay?", and anything it does
 * not recognise with certainty is refused. It can therefore never promote an
 * SVG, an HTML error page or a JSON body into an image — those have no entry
 * here and fall through to `null`.
 *
 * `ftyp` is checked with its brand because the box alone is shared with MP4:
 * only the `avif`/`avis` brands are the still image we mean to relay.
 */
const SIGNATURES: readonly { type: RelayableType; match: (b: Buffer) => boolean }[] = [
  {
    type: 'image/png',
    match: b => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])),
  },
  { type: 'image/jpeg', match: b => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/gif', match: b => ['GIF87a', 'GIF89a'].includes(b.subarray(0, 6).toString('latin1')) },
  {
    type: 'image/webp',
    match: b => b.subarray(0, 4).toString('latin1') === 'RIFF' && b.subarray(8, 12).toString('latin1') === 'WEBP',
  },
  {
    type: 'image/avif',
    match: b =>
      b.subarray(4, 8).toString('latin1') === 'ftyp' && ['avif', 'avis'].includes(b.subarray(8, 12).toString('latin1')),
  },
  { type: 'image/x-icon', match: b => b.subarray(0, 4).equals(Buffer.from([0x00, 0x00, 0x01, 0x00])) },
]

/**
 * The real type of `body`, or `null` when it is not certainly an inert bitmap.
 *
 * Deliberately total: no default, no "probably an image". Unrecognised is
 * refused, because the whole point of the allow-list is that an unverified type
 * is never relayed under an immutable cache header.
 */
function sniffImageType(body: Buffer): RelayableType | null {
  if (body.byteLength < 12) return null
  return SIGNATURES.find(s => s.match(body))?.type ?? null
}

/** Not exported: consumed only here — the controller reads it off the return type. */
type FetchedLogo = { body: Buffer; contentType: string }

type MemoEntry = { value: FetchedLogo; expiresAt: number }

/**
 * Fetches a company logo from an ALLOW-LISTED upstream and hands the bytes back
 * for the controller to relay under an immutable cache header.
 *
 * Why this exists: `accounts.logo_url` points at Apollo's S3, which serves no
 * `Cache-Control`, so the browser revalidated the image on every document load
 * — and Radix `AvatarImage` builds a fresh `new Image()` on every mount, so
 * every remount re-issued the request. Relaying through our own origin lets us
 * state the caching policy ourselves and gives the browser ONE stable URL it
 * can keep on disk.
 *
 * Failure is always graceful: every path returns `null` rather than throwing,
 * so a dead upstream degrades to the initials avatar instead of a 500 storm.
 */
@Injectable()
export class LogoService {
  private readonly memo = new Map<string, MemoEntry>()

  /** Test seam: proves the memo stays bounded. */
  memoSize(): number {
    return this.memo.size
  }

  /**
   * The best logo the allow-listed upstreams can actually produce, or `null`.
   *
   * Candidates are tried IN ORDER and the first real image wins: when the
   * persisted Apollo logo fails — 404, refused type, timeout, anything — the
   * site's own favicon still gets its chance. Resolution already knew that
   * precedence; before this loop, execution did not, and a single bad upstream
   * meant no logo at all. Bounded by construction: `resolveLogoSources` yields
   * at most two URLs, so the worst case is two outbound calls.
   */
  async fetchLogo(input: LogoSourceInput): Promise<FetchedLogo | null> {
    for (const url of resolveLogoSources(input)) {
      const hit = this.memo.get(url)
      if (hit && hit.expiresAt > Date.now()) return hit.value
      if (hit) this.memo.delete(url)

      const fetched = await this.fetchUpstream(url)
      // Only successes are memoised — caching a transient blip would pin the
      // failure for an hour across every user of that logo.
      if (fetched) {
        this.remember(url, fetched)
        return fetched
      }
    }
    // Nothing resolved or every candidate failed. 404 is the honest answer and
    // the avatar renders its initials — we never fabricate a placeholder.
    return null
  }

  private async fetchUpstream(startUrl: string): Promise<FetchedLogo | null> {
    try {
      let url = startUrl
      let res!: Response

      // `www.google.com/s2/favicons` answers 301 → `t3.gstatic.com`, so refusing
      // redirects outright killed the entire favicon branch. We follow them
      // OURSELVES — `redirect: 'manual'` stays on, and every hop is re-validated
      // against the allow-list before we make the next call. Blind following is
      // how a pinned host bounces you into a private range; this keeps the door
      // exactly as narrow as the front one, and the hop budget bounds a loop.
      for (let hop = 0; ; hop++) {
        res = await fetch(url, {
          redirect: 'manual',
          signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
          headers: { accept: 'image/*' },
        })
        if (res.status < 300 || res.status > 399) break
        if (hop >= MAX_REDIRECTS) return null
        const location = res.headers.get('location')
        if (!location || !isFollowableRedirect(location, url)) return null
        url = new URL(location, url).toString()
      }

      // Google answers 404 + a generic globe PNG for a domain it has no favicon
      // for. A placeholder is not this company's logo — the initials avatar is
      // the honest answer, so a non-2xx never becomes an image.
      if (!res.ok) return null

      const declared = (res.headers.get('content-type') ?? '').split(';')[0]!.trim().toLowerCase()

      // This route relays inert bitmaps and nothing else — an HTML error page, a
      // JSON body, or an executable SVG must not be echoed back under an
      // immutable cache header. See {@link RELAYABLE_TYPES}.
      //
      // An EXPLICIT header is a declaration and we take it at its word, in both
      // directions: `image/svg+xml` is refused here and never reaches the
      // sniffer. Otherwise prefixing eight PNG bytes to a document would be
      // enough to get it relayed — sniffing must widen the allow-list, never
      // override a stated type.
      const undeclared = UNDECLARED_TYPES.includes(declared)
      if (!undeclared && !isRelayableType(declared)) return null

      const body = Buffer.from(await res.arrayBuffer())
      if (body.byteLength === 0 || body.byteLength > MAX_BYTES) return null

      // No usable header (Apollo's S3 sends none): fall back to the bytes. What
      // we hand the browser is the type we IDENTIFIED — never the empty or
      // generic header, which would mean relaying an unverified type.
      const contentType = undeclared ? sniffImageType(body) : declared
      if (!contentType) return null

      return { body, contentType }
    } catch {
      // Timeout, DNS failure, connection reset, aborted body — all degrade to
      // the initials avatar. Nothing here is worth an error page.
      return null
    }
  }

  private remember(url: string, value: FetchedLogo): void {
    if (this.memo.size >= MEMO_MAX_ENTRIES) {
      // Cheap FIFO eviction — insertion order is Map's iteration order. A true
      // LRU would not buy anything at this size.
      const oldest = this.memo.keys().next()
      if (!oldest.done) this.memo.delete(oldest.value)
    }
    this.memo.set(url, { value, expiresAt: Date.now() + MEMO_TTL_MS })
  }
}
