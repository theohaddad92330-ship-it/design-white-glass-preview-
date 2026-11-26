import type { PluginOption } from 'vite'

/**
 * Décision Louis 19/10/2026 : les source maps du web sont envoyées à Sentry.
 *
 * Tout est conditionné à `SENTRY_AUTH_TOKEN` : absent, la config rendue est
 * VIDE (ni plugin, ni `sourcemap`, ni `define`) — le build est byte-identique
 * à celui d'avant. Présent (Vercel), les maps sont générées « hidden » (aucun
 * `//# sourceMappingURL` dans le bundle, donc la CSP n'est pas touchée),
 * uploadées sous la release = SHA du commit, puis SUPPRIMÉES du dossier servi.
 */
export type SentrySourcemapsConfig = {
  active: boolean
  release: string | undefined
  plugins: PluginOption[]
  build: { sourcemap: 'hidden' } | Record<string, never>
  define: Record<string, string>
}

type Env = Record<string, string | undefined>

export function sentrySourcemapsActive(env: Env): boolean {
  return Boolean(env['SENTRY_AUTH_TOKEN'])
}

export async function sentrySourcemapsConfig(env: Env): Promise<SentrySourcemapsConfig> {
  const release = env['VERCEL_GIT_COMMIT_SHA'] || env['SENTRY_RELEASE'] || undefined
  if (!sentrySourcemapsActive(env)) {
    // #4618 — la RELEASE est un simple tag : elle n'a pas besoin du jeton d'upload. Sans elle, toute erreur du
    // web remontait sans `release` (tri Sentry inexploitable). Ni plugin ni option de build : seul le `define`
    // porte le SHA ; hors Vercel (aucun SHA) la config reste vide, build byte-identique.
    return {
      active: false,
      release,
      plugins: [],
      build: {},
      define: release ? { __SENTRY_RELEASE__: JSON.stringify(release) } : {},
    }
  }
  const { sentryVitePlugin } = await import('@sentry/vite-plugin')
  return {
    active: true,
    release,
    plugins: [
      sentryVitePlugin({
        authToken: env['SENTRY_AUTH_TOKEN'],
        org: env['SENTRY_ORG'] || 'bellumai',
        project: env['SENTRY_PROJECT_WEB'] || env['SENTRY_PROJECT'],
        url: env['SENTRY_URL'] || 'https://de.sentry.io',
        release: release ? { name: release } : undefined,
        sourcemaps: { filesToDeleteAfterUpload: ['./dist/**/*.map'] },
        telemetry: false,
      }),
    ],
    build: { sourcemap: 'hidden' },
    define: release ? { __SENTRY_RELEASE__: JSON.stringify(release) } : {},
  }
}
