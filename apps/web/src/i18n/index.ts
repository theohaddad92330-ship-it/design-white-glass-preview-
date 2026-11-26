/**
 * i18n runtime bootstrap.
 *
 * Importing this module (side effect) initializes the shared i18next singleton
 * used by every `useTranslation()` call. It is imported once from `main.tsx`
 * (app) and from the vitest setup (tests).
 *
 * Design choices:
 * - Resources are bundled statically (resources.ts) → no async backend.
 * - `initAsync: false` makes init synchronous so the very first render already
 *   has translations (no key flashes, no Suspense fallback in tests).
 * - Initial language: `resolveInitialLanguage()` (detect.ts) = explicit stored
 *   choice → browser locale (francophone → FR, else EN) → FR fallback. An
 *   existing user who already picked a language keeps it; a brand-new user gets
 *   FR only if their browser is francophone, EN otherwise.
 * - `caches: ['localStorage']` still persists every switcher toggle, so the
 *   resolved/chosen language survives reloads (and then wins as the stored choice).
 */
import { DEFAULT_BRAND_NAME, DEFAULT_COPILOT_NAME } from '@bellum/contracts'
import i18n from 'i18next'
import LanguageDetector from 'i18next-browser-languagedetector'
import { initReactI18next } from 'react-i18next'
import { DEFAULT_LANGUAGE, DEFAULT_NAMESPACE, LANGUAGE_STORAGE_KEY, NAMESPACES, SUPPORTED_LANGUAGES } from './config'
import { resolveInitialLanguage } from './detect'
import { resources } from './resources'

void i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Explicit initial language wins over the detector's `order`: our resolver
    // (stored choice → browser locale → FR) decides what loads first.
    lng: resolveInitialLanguage(),
    fallbackLng: DEFAULT_LANGUAGE,
    supportedLngs: [...SUPPORTED_LANGUAGES],
    ns: [...NAMESPACES],
    defaultNS: DEFAULT_NAMESPACE,
    load: 'languageOnly',
    initAsync: false,
    detection: {
      // `lng` above sets the initial value; the detector stays only to CACHE
      // every switcher toggle back to localStorage so it persists across reloads.
      order: ['localStorage'],
      lookupLocalStorage: LANGUAGE_STORAGE_KEY,
      caches: ['localStorage'],
    },
    interpolation: {
      // React already escapes values, so i18next must not double-escape.
      escapeValue: false,
      /*
       * LA MARQUE, DISPONIBLE DANS TOUTE CLÉ SANS ÊTRE PASSÉE (marque blanche).
       *
       * `{{brand}}` et `{{copilot}}` apparaissent dans 601 clés de traduction.
       * Les passer à chaque appel voudrait dire toucher 601 `t()` — et en
       * oublier, ce qui afficherait littéralement « {{brand}} » à l'écran d'un
       * client. `defaultVariables` les rend disponibles partout, sans appelant.
       *
       * ⚠️ Ces valeurs sont le REPLI, pas la vérité : elles servent avant que
       * la marque de l'espace soit connue (premier rendu, hors ligne).
       * `BrandProvider` les réécrit dès la première réponse — voir
       * `applyBrandToI18n`.
       */
      defaultVariables: {
        brand: DEFAULT_BRAND_NAME,
        copilot: DEFAULT_COPILOT_NAME,
      },
    },
    returnNull: false,
    react: {
      // Resources are bundled + init is synchronous, so Suspense is unnecessary
      // and would break synchronous test rendering.
      useSuspense: false,
    },
    // #2437.14 — une clé manquante ne doit JAMAIS afficher sa forme technique
    // brute à l'écran (garde préventive : parity.test.ts, build-time seulement ;
    // ceci est le filet à l'exécution, pour une clé construite dynamiquement ou
    // ajoutée dans une langue et oubliée dans l'autre malgré la garde).
    saveMissing: true,
    missingKeyHandler: (lngs, ns, key) => {
      console.warn('[i18n] clé manquante', { lngs, ns, key })
    },
    // Un `defaultValue` fourni par l'appelant reste la réponse (i18next le passe
    // ici quand la clé manque) : seule la forme technique brute est tue.
    parseMissingKeyHandler: (_key: string, defaultValue?: string) => defaultValue ?? '',
  })

export { i18n }

/**
 * Réécrit la marque disponible dans TOUTES les clés de traduction.
 *
 * ⚠️ i18next lit `defaultVariables` à chaque interpolation, pas seulement à
 * l'initialisation : muter l'objet suffit, et évite un `i18n.init()` complet
 * qui reconstruirait les ressources et ferait clignoter l'écran entier.
 *
 * Ce qui NE suffit pas : muter sans rien redessiner. Les composants déjà
 * rendus gardent leur texte tant que React ne les revisite pas — d'où le
 * `emit('languageChanged')` qui suit, le signal que `react-i18next` écoute
 * déjà pour rafraîchir ses abonnés.
 */
export function applyBrandToI18n(brand: { name: string; copilotName: string }): void {
  const interpolation = i18n.options.interpolation
  if (!interpolation) return
  interpolation.defaultVariables = { brand: brand.name, copilot: brand.copilotName }
  i18n.emit('languageChanged', i18n.language)
}
