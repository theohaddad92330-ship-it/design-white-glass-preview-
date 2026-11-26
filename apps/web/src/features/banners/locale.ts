type BannerLocale = 'fr' | 'en'

/**
 * Normalise the app's active i18n language (from `useTranslation().i18n`) to the
 * two locales banner content is stored in. FR is the product default, so any
 * non-English language falls back to French. This keeps the banner in step with
 * the in-app language switcher rather than guessing from the browser.
 */
export function normalizeBannerLocale(lang: string | null | undefined): BannerLocale {
  return (lang ?? '').toLowerCase().startsWith('en') ? 'en' : 'fr'
}
