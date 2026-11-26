import createMiddleware from 'next-intl/middleware'
import { routing } from './i18n/routing'

export default createMiddleware(routing)

export const config = {
  // Run on everything except API routes, Next internals, the root OG image
  // handler and any file with an extension (favicon.ico, sitemap.xml, robots.txt,
  // images…). Those must not be locale-rewritten.
  matcher: ['/((?!api|_next|_vercel|opengraph-image|.*\\..*).*)'],
}
