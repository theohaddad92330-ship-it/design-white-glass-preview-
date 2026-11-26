import type { Metadata } from 'next'
import { routing, type Locale } from '@/i18n/routing'
import { SITE_URL } from './app-url'

/**
 * Absolute URL of a route for a given locale. FR (default) is prefix-less;
 * every other locale lives under its `/<locale>` prefix.
 *
 * @param path Route path with a leading slash, or `''` for the home page.
 */
export function localeUrl(locale: Locale, path: string): string {
  const clean = path === '/' ? '' : path
  const prefix = locale === routing.defaultLocale ? '' : `/${locale}`
  return `${SITE_URL}${prefix}${clean}` || SITE_URL
}

/**
 * Canonical URL + `hreflang` alternates for a route, across ALL locales.
 * FR (default) is prefix-less; `x-default` points at FR.
 */
export function buildAlternates(locale: Locale, path: string): NonNullable<Metadata['alternates']> {
  const languages: Record<string, string> = Object.fromEntries(routing.locales.map(l => [l, localeUrl(l, path)]))
  languages['x-default'] = localeUrl(routing.defaultLocale, path)
  return {
    canonical: localeUrl(locale, path),
    languages,
  }
}

const OG_LOCALES: Record<Locale, string> = {
  fr: 'fr_FR',
  en: 'en_US',
  de: 'de_DE',
  nl: 'nl_BE',
}

/** OpenGraph `locale` value for a given app locale. */
export function ogLocale(locale: Locale): string {
  return OG_LOCALES[locale] ?? OG_LOCALES[routing.defaultLocale]
}
