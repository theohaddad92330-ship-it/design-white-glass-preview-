import type { MarketLegalBasis, MarketLocale, WorkspaceMarket } from '@bellum/contracts'
import { i18n } from '@/i18n'

/**
 * Display copy for the "Marché cible" (target market) selector, resolved from
 * the `settings.market.*` react-i18next keys (FR + EN). Everything is exposed
 * as functions (not module-level constants) so labels are resolved at call
 * time and follow the active language.
 */

/** Section chrome + toasts. Keys: `settings:market.*`. */
export function getMarketSectionLabels() {
  return {
    /** settings.market.title */
    title: i18n.t('settings:market.title'),
    /** settings.market.subtitle */
    subtitle: i18n.t('settings:market.subtitle'),
    /** settings.market.saved */
    saved: i18n.t('settings:market.saved'),
    /** settings.market.error */
    error: i18n.t('settings:market.error'),
    /** settings.market.packActive */
    packActive: i18n.t('settings:market.packActive'),
    /** settings.market.readOnly */
    readOnly: i18n.t('settings:market.readOnly'),
    /** settings.market.consequences.locale */
    localeLabel: i18n.t('settings:market.consequences.locale'),
    /** settings.market.consequences.legal */
    legalLabel: i18n.t('settings:market.consequences.legal'),
    /** settings.market.consequences.sources */
    sourcesLabel: i18n.t('settings:market.consequences.sources'),
  } as const
}

/** Per-market option copy. Keys: `settings:market.options.<code>.{name,sources}`. */
export function getMarketOptionLabels(): Record<WorkspaceMarket, { name: string; sources: string }> {
  // i18n keys: market.options.FR | CH | BE | LU | US | CA (each with .name and .sources)
  const option = (code: WorkspaceMarket) => ({
    name: i18n.t(`settings:market.options.${code}.name`),
    sources: i18n.t(`settings:market.options.${code}.sources`),
  })
  return {
    FR: option('FR'),
    CH: option('CH'),
    BE: option('BE'),
    LU: option('LU'),
    US: option('US'),
    CA: option('CA'),
  }
}

/** Locale display. Keys: `settings:market.locale.<code>`. */
export function getMarketLocaleLabels(): Record<MarketLocale, string> {
  return {
    fr: i18n.t('settings:market.locale.fr'),
    en: i18n.t('settings:market.locale.en'),
    de: i18n.t('settings:market.locale.de'),
  }
}

/** Legal-basis display. Keys: `settings:market.legalBasis.<value>`. */
export function getMarketLegalBasisLabels(): Record<MarketLegalBasis, string> {
  return {
    RGPD: i18n.t('settings:market.legalBasis.RGPD'),
    adéquation: i18n.t('settings:market.legalBasis.adéquation'),
    PIPEDA: i18n.t('settings:market.legalBasis.PIPEDA'),
    CCPA: i18n.t('settings:market.legalBasis.CCPA'),
  }
}
