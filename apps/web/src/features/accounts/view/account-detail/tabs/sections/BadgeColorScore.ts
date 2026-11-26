import { ACCOUNT_VERDICT_COLOR } from '@bellum/contracts'

/**
 * #2143.26 (épopée #2924) — trouvaille en écrivant la garde « une page dérivée
 * ne recrée jamais un score » : `ring` recopiait ses QUATRE couleurs en dur,
 * dérivées de `ACCOUNT_VERDICT_COLOR` (`account-score.ts`) à sa création, mais
 * plus JAMAIS tenues en synchronisation — `NO-GO` avait dérivé à `#FF5E57`
 * pendant que la source canonique disait `#EF4444` : trois écrans dérivés
 * (`AccountVerdictSummary`, `ScoreSummaryCard`, `BellumReadCard`) pouvaient
 * donc rendre un anneau d'une teinte légèrement différente du badge/donut
 * canonique pour le MÊME verdict. `ring` LIT désormais la source unique
 * (GA-26) ; `badge` reste la classe Tailwind propre à CET habillage (le
 * traitement visuel, pas le verdict lui-même).
 */
export const BADGE_COLORS = {
  GO: { ring: ACCOUNT_VERDICT_COLOR.GO, badge: 'bg-emerald-100 text-black dark:bg-emerald-500' },
  PRUDENT: { ring: ACCOUNT_VERDICT_COLOR.PRUDENT, badge: 'bg-amber-100 text-black dark:bg-amber-500' },
  'NO-GO': { ring: ACCOUNT_VERDICT_COLOR['NO-GO'], badge: 'bg-rose-100 text-black dark:bg-rose-500' },
  // EXPLORER (annexe méthodo p25) : potentiel mais données manquantes → collecter.
  EXPLORER: { ring: ACCOUNT_VERDICT_COLOR.EXPLORER, badge: 'bg-indigo-100 text-black dark:bg-indigo-500' },
} as const
