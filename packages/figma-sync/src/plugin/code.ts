import feedJson from '../../generated/feed.json'
import tokensJson from '../../generated/tokens.json'
import versionJson from '../../generated/version.json'
import type { Feed } from '../extract/changelog'
import type { TokenSet } from '../extract/types'
import type { VersionStamp } from '../extract/version'
import { OVERLAYS } from '../spec/overlays'
import { PAGES } from '../spec/pages'
import type { Log, SyncApi } from './api'
import { buildComponents, buildOverlays, buildPages, buildTemplates } from './builders'
import { drawChangelog, drawCover, drawFoundations, drawGettingStarted } from './foundations'
import { FIGMA_PAGES } from './pages'
import { logSkippedTokens } from './skipped-log'
import { syncEffectStyles, syncTextStyles } from './styles'
import { upsertPages } from './upsert'
import { readVariableIndex, syncVariables, type VariableIndex } from './variables'

/**
 * Point d'entrée du plugin. Il ne lit AUCUN fichier et n'appelle aucun
 * réseau : tokens.json et les specs sont EMBARQUÉS par esbuild au build.
 * Pour changer ce que Figma montre, on change le code puis on rebâtit.
 */

const tokens = tokensJson as unknown as TokenSet
const version = versionJson as VersionStamp
const feed = feedJson as unknown as Feed

/** Le vrai `figma` satisfait le sous-ensemble étroit que la logique testée consomme. */
const api: SyncApi = figma

type Step =
  | 'tokens'
  | 'styles'
  | 'foundations'
  | 'components'
  | 'templates'
  | 'pages-app'
  | 'pages-site'
  | 'pages-dm'
  | 'overlays-app'
  | 'overlays-site'
  | 'overlays-dm'

interface SyncMessage {
  type: 'sync'
  steps: Step[]
  /** Les largeurs cochées pour les pages (px) ; vide = largeurs par défaut de chaque surface. */
  widths?: number[]
}

const post = (level: 'info' | 'warn' | 'error', text: string): void =>
  figma.ui.postMessage({ type: 'log', level, text })
const log: Log = {
  info: text => post('info', text),
  warn: text => post('warn', text),
  error: text => post('error', text),
}

async function run(steps: Step[], widths: readonly number[]): Promise<void> {
  const want = (s: Step): boolean => steps.includes(s)
  logSkippedTokens(tokens.skipped, log)

  let variables: VariableIndex | null = null
  if (want('tokens')) variables = await syncVariables(api, tokens, log)
  else variables = await readVariableIndex(api, tokens)

  if (want('styles')) {
    await syncTextStyles(api, tokens, log)
    await syncEffectStyles(api, tokens, log)
  }

  const pages = upsertPages(api, FIGMA_PAGES) as Map<string, PageNode>
  if (want('foundations')) {
    const cover = pages.get('Cover')
    const changelog = pages.get('Nouveautés')
    const start = pages.get('Getting Started')
    const foundations = pages.get('Foundations')
    if (cover) await drawCover(cover, tokens, variables, version, log)
    if (changelog) await drawChangelog(changelog, feed, variables, log)
    if (start) await drawGettingStarted(start, log)
    if (!variables) log.error('Fondations : aucune variable dans le fichier — cocher « Tokens » d’abord.')
    else if (foundations) await drawFoundations(foundations, tokens, variables, log)
  }

  const ctx = { tokens, variables, log, draw: figma, widths }
  // Défaut M (25/09/2026) : une étape qui lève n'emporte plus les suivantes (les pages DM manquaient
  // après « Site ») — l'erreur est journalisée, l'étape suivante part quand même.
  const step = async (name: Step, work: () => Promise<void>): Promise<void> => {
    if (!want(name)) return
    try {
      await work()
    } catch (e) {
      log.error(`Étape ${name} interrompue : ${e instanceof Error ? e.message : String(e)} — étape suivante`)
    }
  }
  await step('components', () => buildComponents(ctx))
  await step('templates', () => buildTemplates(ctx))
  await step('pages-app', () => buildPages(ctx, 'app', PAGES))
  await step('pages-site', () => buildPages(ctx, 'site', PAGES))
  await step('pages-dm', () => buildPages(ctx, 'dm', PAGES))
  await step('overlays-app', () => buildOverlays(ctx, 'app', OVERLAYS, PAGES))
  await step('overlays-site', () => buildOverlays(ctx, 'site', OVERLAYS, PAGES))
  await step('overlays-dm', () => buildOverlays(ctx, 'dm', OVERLAYS, PAGES))
}

figma.showUI(__html__, { width: 380, height: 560, themeColors: true })
// Le tampon de version dans l'UI : affiché tel quel, la comparaison au tampon
// PRÉSENT dans le fichier (cadre « Version » de Cover) se fait au dessin, pas ici.
figma.ui.postMessage({ type: 'version', sha: version.sha, date: version.date, specCount: version.specCount })

figma.ui.onmessage = async (msg: SyncMessage) => {
  if (msg.type !== 'sync') return
  try {
    await run(msg.steps, msg.widths ?? [])
    figma.ui.postMessage({ type: 'done', ok: true })
  } catch (e) {
    log.error(`Synchronisation interrompue : ${e instanceof Error ? e.message : String(e)}`)
    figma.ui.postMessage({ type: 'done', ok: false })
  }
}
