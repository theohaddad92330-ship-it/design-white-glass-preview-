import { fileURLToPath } from 'node:url'
import { mergeConfig } from 'vitest/config'
import shared from '@bellum/tooling/configs/vitest'

/**
 * Le back-office n'avait AUCUN test — 124 fichiers source, zéro fichier de
 * test, et zéro occurrence de `dashboard-manager` dans `.github/workflows/`.
 * `lint`, `format`, `check-types` et `build` l'atteignaient bien (ils suivent
 * `node=true`, qui se déclenche sur n'importe quel `.ts`/`.tsx`), mais aucune
 * suite ne s'exécutait : la seule chose que la CI savait de cette application,
 * c'est qu'elle compilait.
 *
 * C'est la console qui peut supprimer un compte, créditer un espace et
 * s'authentifier à la place d'un client. Elle est aussi la seule application du
 * dépôt à ne pas déployer avec les autres — son propre projet Vercel — donc
 * celle dont un défaut ne se voit dans aucune recette des autres.
 *
 * `apps/website` est le précédent exact : lui non plus n'avait de tests tant
 * qu'il ne servait que des pages statiques, et il en a reçu le jour où il a
 * porté du code qui DÉCIDE. Même remède, même configuration partagée.
 *
 * Deux écarts avec la configuration partagée, et un seul les motive — les
 * composants du manager sont des `.tsx` :
 *  - `include` couvre `.tsx` en plus de `.ts` ;
 *  - l'alias `@/` de Next, sans lequel un module qui importe `@/lib/…` passe le
 *    typecheck et échoue à l'exécution des tests, c'est-à-dire exactement là où
 *    on se croyait couvert.
 *
 * ⚠️ POURQUOI `.mts` ET PAS `.ts`
 * La configuration partagée est un module ESM, et `apps/dashboard-manager` est
 * la seule application du dépôt sans `"type": "module"` — `apps/website` et
 * `apps/mcp`, qui consomment la même configuration, l'ont. Le lui ajouter
 * changerait l'interprétation de TOUS ses fichiers de configuration Next
 * (`next.config.js`, PostCSS, ESLint) pour un besoin qui n'en concerne qu'un.
 * L'extension `.mts` force l'ESM sur ce seul fichier, et rien d'autre ne bouge.
 *
 * L'environnement reste `node`, comme partout ailleurs dans le dépôt. Ce qui se
 * garde ici est la LOGIQUE et l'ARCHITECTURE ; ce qui se voit à l'écran se
 * recette en direct, parce que jsdom ne met rien en page et qu'un test qui lit
 * des classes au lieu de mesurer un rendu rend un vert qui ne veut rien dire.
 */
export default mergeConfig(shared, {
  test: {
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
