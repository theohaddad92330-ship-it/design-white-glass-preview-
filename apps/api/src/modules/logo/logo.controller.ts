import { Controller, Get, Header, Query, Res, StreamableFile } from '@nestjs/common'
import type { Response } from 'express'
import { LogoService } from './logo.service'

/**
 * Public, unauthenticated relay for company logos — NO guard, same precedent as
 * `banners.public.controller.ts`. What it serves is already public (a company's
 * own logo or the favicon its site serves to anyone), and it reads no database
 * row, so there is nothing to authorise and no account id to enumerate. The
 * global `ThrottlerGuard` rate-limits it like every other route.
 *
 * The whole point is the `Cache-Control` below: the upstream (Apollo's S3)
 * sends none, so browsers revalidated every logo on every page load. Relayed
 * through our own origin under an immutable month, the browser fetches each
 * logo ONCE and serves every later mount from disk.
 *
 * The SSRF surface — this endpoint fetches a caller-influenced URL — is closed
 * in `logo-source.ts` (host allow-list) and `logo.service.ts` (no redirects,
 * timeout, image-only, size cap).
 */
@Controller('logo')
export class LogoController {
  constructor(private readonly logos: LogoService) {}

  @Get()
  @Header('Cache-Control', 'public, max-age=2592000, immutable')
  // Ceinture et bretelles autour du type relayé (déjà restreint à une liste
  // blanche de bitmaps inertes côté service) : `nosniff` interdit au navigateur
  // de re-deviner un type exécutable à partir des octets, et la CSP neutralise
  // tout script/objet si cette réponse était malgré tout rendue comme document.
  // Ce qui se joue ici, c'est l'origine de l'API — celle qui porte les cookies.
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
  async get(
    @Res({ passthrough: true }) res: Response,
    @Query('src') src?: string,
    @Query('domain') domain?: string,
  ): Promise<StreamableFile | undefined> {
    const logo = await this.logos.fetchLogo({ src, domain }).catch(() => null)

    if (!logo) {
      // A miss must NOT inherit the immutable month above — a transient upstream
      // blip would otherwise stick in every browser for 30 days. Short and
      // retryable instead. 404 (not 500) is what makes the `<img>` fail cleanly
      // so the avatar falls back to its initials.
      res.setHeader('Cache-Control', 'public, max-age=300')
      res.status(404)
      return undefined
    }

    // StreamableFile (not a bare Buffer): Nest JSON-serialises a returned
    // Buffer into `{"type":"Buffer","data":[…]}`, which is not an image.
    return new StreamableFile(logo.body, {
      type: logo.contentType,
      length: logo.body.byteLength,
    })
  }
}
