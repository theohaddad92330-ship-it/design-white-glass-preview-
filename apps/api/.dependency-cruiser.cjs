/**
 * #4118 — garde d'architecture d'apps/api (dependency-cruiser, MIT).
 * Lancer : `pnpm --filter @bellum/api lint:arch`.
 *
 * Règles minimales, écrites d'après l'état réel du code :
 *  - pas de cycle NOUVEAU (les cycles existants sont figés dans `.dependency-cruiser-known-violations.json`,
 *    exceptions NOMMÉES, jamais masquées — on ne les agrandit pas, on les réduit) ;
 *  - aucun import web → api / api → web ;
 *  - le code de production n'importe jamais un `*.spec.ts` / `*.test.ts`.
 * Regénérer la baseline (à n'utiliser QUE pour la réduire) :
 *   npx depcruise src --config .dependency-cruiser.cjs --output-type baseline > .dependency-cruiser-known-violations.json
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      comment: 'Pas de cycle nouveau (les existants sont dans la baseline).',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'api-must-not-import-web',
      comment: "apps/api ne dépend jamais d'apps/web : le contrat passe par packages/*.",
      severity: 'error',
      from: { path: '^src/' },
      to: { path: ['(^|/)apps/web/', '^(\\.\\./)+web/', '^@bellum/web(/|$)'] },
    },
    {
      name: 'no-import-of-spec-from-code',
      comment: 'Un fichier de production ne dépend jamais de ses tests.',
      severity: 'error',
      from: { pathNot: ['\\.(spec|test|e2e-spec)\\.[jt]sx?$', '(^|/)(test|tests|__tests__|__mocks__)/'] },
      to: { path: '\\.(spec|test|e2e-spec)\\.[jt]sx?$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    exclude: { path: '(^|/)(dist|coverage)/' },
  },
}
