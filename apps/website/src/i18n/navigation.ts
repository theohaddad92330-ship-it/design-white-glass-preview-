import { createNavigation } from 'next-intl/navigation'
import { routing } from './routing'

/**
 * Locale-aware navigation helpers. Use `Link` from here (not `next/link`) for
 * every INTERNAL route link so the current locale is preserved: on an EN page a
 * link to `/pricing` resolves to `/en/pricing`, on FR it stays `/pricing`.
 * External URLs, `mailto:` and same-page `#anchors` keep a plain `<a>`.
 */
export const { Link, redirect, usePathname, useRouter, getPathname } = createNavigation(routing)
