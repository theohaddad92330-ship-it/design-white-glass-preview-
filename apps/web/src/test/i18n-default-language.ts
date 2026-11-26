/**
 * Pin the initial UI language to FR for the test suite.
 *
 * `@/i18n` now resolves its initial language from localStorage → browser locale
 * → FR fallback (see `i18n/detect.ts`). jsdom reports `navigator.language =
 * 'en-US'`, so with no stored preference the resolver would legitimately pick
 * EN — flipping the historical FR default and every FR-expecting component test.
 *
 * Seeding an explicit FR choice keeps tests on the product default (FR). The
 * real browser-locale detection is covered directly by `i18n/detect.test.ts`,
 * which drives the pure resolver with explicit inputs.
 *
 * MUST be imported before `@/i18n` in `setup.ts`: the resolver reads
 * localStorage once, at init.
 */
import { LANGUAGE_STORAGE_KEY } from '@/i18n/config'

if (typeof window !== 'undefined') {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, 'fr')
}
