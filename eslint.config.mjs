import base from '@bellum/tooling/eslint/base'
import reactConfig from '@bellum/tooling/eslint/react'

// Le hook `pre-commit` (lint-staged) lance eslint depuis LA RACINE, avec CETTE
// config — jamais celle d'un package. Elle n'enregistrait que `base`, sans le
// plugin `react-hooks` : un `// eslint-disable-next-line
// react-hooks/exhaustive-deps` PRÉ-EXISTANT dans `apps/web` (légitime pour le
// lint AUTORITAIRE de CI, `pnpm --filter @bellum/web lint`, qui charge
// `apps/web/eslint.config.js` → `@bellum/tooling/eslint/react`) devenait une
// règle INCONNUE ici, donc une ERREUR — un commit refusé pour du code déjà
// vert en CI. Mesuré sur `ContactMailboxDialog.tsx` (2026-09-16) ; le même
// défaut est documenté pour `WatchlistPage.tsx`, `useAnalysisStatusSync.ts`,
// `use-document-title.ts`.
//
// Le dernier bloc de `reactConfig` porte les plugins/règles ; on le reprend
// tel quel, borné à `apps/web` (là où ces désactivations vivent), pour ne pas
// changer le lint des autres packages.
const reactRules = reactConfig[reactConfig.length - 1]

export default [...base, { ...reactRules, files: ['apps/web/**/*.{ts,tsx}'] }]
