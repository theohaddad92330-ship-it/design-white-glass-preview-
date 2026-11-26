import { defineConfig, type PluginOption } from 'vite'
import react from '@vitejs/plugin-react-swc'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import { exec } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { sourceTag } from './vite-plugins/source-tag'
import { sentrySourcemapsConfig } from './vite-plugins/sentry-sourcemaps'

const execAsync = promisify(exec)

/**
 * Resolve the build's version ID. Honors `VITE_CODE_VERSION_ID` from the
 * environment first (lets CI/Vercel override), otherwise shells out to
 * `tools/get-version.sh package` which produces `YY.MM.DD-tsUNIX+gitSHA10`.
 * Falls back to `'dev'` when neither is available so local dev never breaks.
 */
async function getCodeVersionId(): Promise<string> {
  const fromEnv = process.env['VITE_CODE_VERSION_ID']
  if (fromEnv && fromEnv.length > 0) return fromEnv
  try {
    const { stdout } = await execAsync('../../tools/get-version.sh package')
    return stdout.trim() || 'dev'
  } catch {
    return 'dev'
  }
}

/**
 * Vite plugin that drops `latest-version.json` next to the rest of the build
 * output. The deployed app polls that manifest from `useApplicationUpdate` to
 * decide whether to surface the "new version available" toast.
 */
function seedGenerateLatestVersionManifest({ version }: { version: string }): PluginOption {
  return {
    name: 'seed-generate-latest-version-manifest',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'latest-version.json',
        source: JSON.stringify({ v: 1, latestVersion: version }),
      })
    },
  }
}

export default defineConfig(async () => {
  const codeVersionId = await getCodeVersionId()
  // S.2 (décision 19/10/2026) — source maps Sentry, actives seulement avec SENTRY_AUTH_TOKEN.
  const sentry = await sentrySourcemapsConfig(process.env)

  return {
    define: {
      __CODE_VERSION_ID__: JSON.stringify(codeVersionId),
      ...sentry.define,
    },
    plugins: [
      // Must run BEFORE react() so the generated routeTree.gen.ts is picked up
      // by the react transformer.
      tanstackRouter({
        target: 'react',
        autoCodeSplitting: true,
      }),
      // Stamps host JSX with its source location so the in-app bug reporter can
      // point at a line of code. Opt out with VITE_SOURCE_TAGS=false.
      sourceTag({
        root: path.resolve(__dirname, '../..'),
        enabled: process.env['VITE_SOURCE_TAGS'] !== 'false',
      }),
      react(),
      seedGenerateLatestVersionManifest({ version: codeVersionId }),
      // Dernier : l'upload se fait après la génération des chunks.
      ...sentry.plugins,
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src'),
      },
    },
    server: {
      port: 5173,
    },
    // Keeps component function names through minification so the bug reporter
    // can print a readable React component stack in production builds.
    esbuild: {
      keepNames: true,
    },
    build: {
      chunkSizeWarningLimit: 600,
      ...sentry.build,
    },
  }
})
