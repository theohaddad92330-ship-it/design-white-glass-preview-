import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

/**
 * Playwright smoke-test harness for the BellumAI monorepo.
 *
 * Two independent tiers, one project each:
 * - `website` — apps/website (Next.js marketing site), production build served
 *   by `next start`. No backend, no secret, fully deterministic.
 *
 *   ⚠️ « Deterministic » a été FAUX pendant des mois, et c'est le smoke
 *   `/pricing` qui l'a révélé (#1152). Le site lit `API_URL` AU BUILD pour
 *   afficher le catalogue tarifaire vivant ; `e2e:build` ne neutralisait que
 *   `VITE_API_URL` (le SPA). Deux raisons se cumulaient : la variable n'était
 *   pas posée, et `turbo.json` ne la DÉCLARAIT pas — or Turbo 2 est en mode
 *   `strict`, donc une variable non déclarée n'atteint jamais la tâche. Le
 *   build retombait sur `https://api.bellum-ai.com` et le test lisait la base
 *   de PRODUCTION : il annonçait 249 € tant que la nouvelle grille n'y était
 *   pas déployée, c'est-à-dire tant que la PR n'était pas mergée. Un test qui
 *   ne peut pas être vert avant le merge ne garde rien.
 *
 *   Les deux variables pointent désormais sur le port mort 4599 : le fetch
 *   échoue, la page retombe sur ses catalogues de messages, et le test vérifie
 *   ce que la PAGE promet — pas l'état de la base de production.
 * - `web` — apps/web (React SPA), production build served by `vite preview`.
 *   The SPA is built with VITE_API_URL pointing at a dead port (4599) so the
 *   session boot deterministically resolves to "anonymous" — only the
 *   unauthenticated shell (login, i18n, auth redirects) is tested. See
 *   e2e/README.md for the tier-3 (authenticated journeys) roadmap.
 * - `web-mobile` — LA PREUVE MOBILE (décision Louis 22/09/2026, #2639.1).
 *   Même serveur `web` (production build, `vite preview`), viewport RÉEL
 *   375×812 : `resize_window` du navigateur piloté répond « Successfully
 *   resized » mais `window.innerWidth` mesuré reste bloqué à 1512 (mesuré les
 *   21 et 22/09) — la famille « bouton de reprise / mobile / Windows 125-150 %
 *   / portable 13″ » est prouvée ici, pas au navigateur piloté. Voir
 *   `tests/web-mobile/screen-reach.spec.ts`.
 *
 * `pnpm e2e` (root) builds both apps through turbo BEFORE playwright runs, so
 * the webServer commands below only start pre-built servers (fast + no build
 * race between the two servers).
 */

const repoRoot = path.resolve(fileURLToPath(new URL('.', import.meta.url)), '..')

const WEBSITE_PORT = 4310
const WEB_PORT = 4311
// The website is addressed via `localhost` on purpose: `next start` proxies
// middleware rewrites internally through localhost, so binding/addressing the
// server on 127.0.0.1 only breaks next-intl rendering (500s + redirect loops).
const WEBSITE_URL = `http://localhost:${WEBSITE_PORT}`
const WEB_URL = `http://127.0.0.1:${WEB_PORT}`

export default defineConfig({
  testDir: './tests',
  // Smoke tests are read-only and independent — safe to parallelize.
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  // No retries anywhere: a flaky smoke test is a bug to fix, not to mask.
  retries: 0,
  // En local, Playwright prend un worker par demi-cœur (6 ici) et chacun porte un
  // navigateur — plusieurs sessions Claude peuvent lancer une suite en même temps.
  //
  // ⚠️ « En CI, rien ne change : le runner est seul sur sa machine » — c'était
  // vrai sur `ubuntu-latest`, et c'est FAUX depuis les runners auto-hébergés
  // partagés (même bascule que documentée pour jest/vitest, `.claude/projet.md`
  // §4) : `os.cpus()` rend les cœurs de l'HÔTE, Playwright en déduit un worker
  // par cœur et lance UN CHROMIUM PAR TEST en même temps — mesuré : « Running 22
  // tests using 22 workers » puis `browserType.launch: Target page, context or
  // browser has been closed` / `signal=SIGABRT` en cascade, y compris sur `main`
  // en exécution nocturne (aucune PR en jeu, donc pas un défaut de produit).
  //
  // `PW_MAX_WORKERS` est posé par le pas « Plafond de workers » de
  // `e2e-nightly.yml`, lu dans le cgroup du conteneur comme pour jest/vitest.
  // Le défaut de 2 (prudent, pas mesuré comme le sont les plafonds jest/vitest)
  // couvre le cas où ce pas n'a pas tourné — jamais `os.cpus()` en CI.
  workers: process.env.CI ? Number(process.env.PW_MAX_WORKERS) || 2 : 2,
  reporter: [['list'], ['html', { outputFolder: 'playwright-report', open: 'never' }]],
  use: {
    // Force a French browser so next-intl's Accept-Language detection never
    // redirects `/` to `/en` — FR is asserted as the default locale.
    locale: 'fr-FR',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'website',
      testDir: './tests/website',
      use: { ...devices['Desktop Chrome'], baseURL: WEBSITE_URL },
    },
    {
      name: 'web',
      testDir: './tests/web',
      use: { ...devices['Desktop Chrome'], baseURL: WEB_URL },
    },
    {
      // LA PREUVE MOBILE — voir la note de tête de fichier. Viewport RÉEL,
      // jamais un `resize_window` de navigateur piloté (mesuré inopérant les
      // 21 et 22/09 : `window.innerWidth` reste à 1512).
      name: 'web-mobile',
      testDir: './tests/web-mobile',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: WEB_URL,
        viewport: { width: 375, height: 812 },
        // `isMobile`/`hasTouch` activent `@media (pointer: coarse)` — c'est CE
        // média qui porte le plancher tactile de 44 px (`pointer-coarse:min-h-11`,
        // `packages/ui/src/components/button.tsx`). Sans eux Chromium reste en
        // pointeur FIN malgré le viewport réduit, et le test mesurerait la
        // hauteur DESKTOP (36 px) sous un habillage mobile — un faux vert.
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
  // Readiness is port-based (not URL-based) on purpose: the website's
  // next-intl middleware 307-redirects probes that carry no Accept-Language
  // header, which turns a URL health check into a redirect loop. Both servers
  // only start listening once they are actually ready to serve.
  webServer: [
    {
      // Serves the production build created by `pnpm run e2e:build`. No `-H`:
      // Next must stay reachable on localhost for its internal middleware
      // proxying (see WEBSITE_URL note above).
      command: `pnpm --filter @bellum/website exec next start -p ${WEBSITE_PORT}`,
      cwd: repoRoot,
      port: WEBSITE_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: `pnpm --filter @bellum/web exec vite preview --host 127.0.0.1 --port ${WEB_PORT} --strictPort`,
      cwd: repoRoot,
      port: WEB_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
})
