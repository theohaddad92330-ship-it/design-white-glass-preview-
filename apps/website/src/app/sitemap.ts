import type { MetadataRoute } from 'next'
import { routing } from '@/i18n/routing'
import { localeUrl } from '@/lib/metadata'

type Entry = { path: string; priority: number; changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency'] }

const ENTRIES: Entry[] = [
  { path: '', priority: 1, changeFrequency: 'weekly' },
  { path: '/beta', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/webinar', priority: 0.9, changeFrequency: 'weekly' },
  { path: '/product', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/use-cases', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/pricing', priority: 0.8, changeFrequency: 'weekly' },
  { path: '/about', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/demo', priority: 0.7, changeFrequency: 'monthly' },
  { path: '/legal', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/privacy', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cgu', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cgv', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/cookies', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/dpa', priority: 0.3, changeFrequency: 'yearly' },
  { path: '/status', priority: 0.3, changeFrequency: 'daily' },
]

/**
 * Every locale is listed. Each URL carries `hreflang` alternates (fr / en / de /
 * nl / x-default) so search engines serve the right language and never treat the
 * versions as duplicate content. FR (default) keeps its prefix-less URLs.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date()

  return ENTRIES.flatMap(({ path, priority, changeFrequency }) => {
    const languages: Record<string, string> = Object.fromEntries(
      routing.locales.map(locale => [locale, localeUrl(locale, path)]),
    )
    languages['x-default'] = localeUrl(routing.defaultLocale, path)

    return routing.locales.map(locale => ({
      url: localeUrl(locale, path),
      lastModified,
      changeFrequency,
      priority: locale === routing.defaultLocale ? priority : Math.max(priority - 0.1, 0.1),
      alternates: { languages },
    }))
  })
}
