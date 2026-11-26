#!/usr/bin/env node
/**
 * Classe les fichiers de test web qui n'ont PAS besoin du DOM et écrit la liste
 * dans `src/test/tests-node.generated.ts` — le périmètre du projet vitest
 * `node (pur)` (environment node, setup minimal, isolation par fichier).
 *
 * Pourquoi : ~75 % du temps vitest d'un fichier web est le montage de happy-dom
 * + jest-dom + i18n, PAR FICHIER. Un test qui ne touche pas le DOM n'en a pas
 * besoin. Voir `src/test/projects.ts`.
 *
 * Un fichier est candidat si : c'est un `*.test.ts` (jamais `.tsx`), hors
 * `src/architecture` (déjà dans le projet `node`), et
 *   • il n'importe ni testing-library, ni react-dom, ni un module résolu en `.tsx` ;
 *   • il ne cite (hors commentaires et chaînes) ni document, window, screen,
 *     localStorage, sessionStorage, navigator, HTMLElement.
 * L'heuristique ne PROUVE rien : le classement se mesure en lançant le projet
 * (voir la note de `projects.ts`). Un fichier rouge en node mais vert en DOM
 * rejoint EXCLUSIONS_MESUREES, avec sa raison.
 *
 * Usage : node scripts/classer-tests-node.mjs [--check]
 *
 * `--check` est dans le job `quick` de la CI (lot ci/3-web-setup, 31/10/2026) mais SEULEMENT en
 * mode `--check --seulement=<liste des fichiers de la PR>` : retiré le 23/10/2026 en mode strict,
 * parce que sur le commit de fusion d'une PR, main apporte des tests absents de la liste et TOUTE
 * PR rougissait (#4484, ESLint coupé). En mode `--seulement`, la dérive des fichiers que la PR
 * n'a pas touchés n'est qu'un avertissement ; celle des fichiers qu'elle touche (ou de la liste
 * elle-même) fait échouer. Une suite absente de la liste tourne en DOM — plus lente, jamais
 * fausse ; la garde « chaque fichier dans un seul projet » tient. Réglage : `docs/ci.md` §3.
 */
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const WEB_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTPUT = join(WEB_ROOT, 'src/test/tests-node.generated.ts')
const PROJECTS_TS = join(WEB_ROOT, 'src/test/projects.ts')

/**
 * Rouges en projet `node (pur)`, verts en DOM — relevés en LANÇANT le projet.
 * Chaque entrée : chemin + motif court. Mesuré le 22/10/2026 : 41 fichiers sur 802.
 * Trois causes : `setup.ts` charge l'i18n FR (libellés EN en node), des `vi.mock` globaux
 * (`@/lib/api`, socket) que `setup-node.ts` ne charge pas, et l'API navigateur
 * (`FileReader`, `window`, `matchMedia`) que happy-dom fournit.
 */
const EXCLUSIONS_MESUREES = new Map([
  ['src/features/chat/api/agentChatApi.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/features/chat/api/chat-quota.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/features/chat/api/copilotCardsApi.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/features/chat/voice/voice-api.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/features/contacts/enrich-polling.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/features/memory/api.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/lib/analysis-status-sync.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/lib/analysis-subscription.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/stores/analysisStore.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/stores/onboardingStore.test.ts', 'mocks globaux de setup.ts absents'],
  ['src/features/consultants/lib/fileToBase64.test.ts', 'API navigateur absente en node'],
  ['src/features/context-contract/surface-disclosure.test.ts', 'API navigateur absente en node'],
  ['src/features/feedback/attachments.test.ts', 'API navigateur absente en node'],
  ['src/features/feedback/nextPaint.test.ts', 'API navigateur absente en node'],
  ['src/features/feedback/reportLink.test.ts', 'API navigateur absente en node'],
  ['src/features/feedback/safeUrl.test.ts', 'API navigateur absente en node'],
  ['src/features/mobile/useIsMobile.test.ts', 'API navigateur absente en node'],
  ['src/features/universal-import/lib/file-parts.test.ts', 'API navigateur absente en node'],
  ['src/features/universal-import/lib/sample-file.test.ts', 'API navigateur absente en node'],
  ['src/lib/safe-href.test.ts', 'API navigateur absente en node'],
  ['src/features/accounts/lib/analysisRuns.test.ts', 'singleton i18n (FR) chargé par setup.ts : libellés EN en node'],
  [
    'src/features/accounts/view/account-detail/tabs/evaluation/scoreFactors.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/accounts/view/account-detail/tabs/plan/planViewData.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/accounts/view/account-detail/tabs/sections/strategyPlanAction.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/accounts/view/account-detail/tabs/veille/watchActions.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/action-history/view/actionHistoryEvents.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/action-history/view/actionHistoryStatus.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/billing/model/ledger-view-model.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/chat/view/reply-blocks/plain-text.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/consultants/lib/talentExport.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/contacts/hooks/enrich-error-description.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/contacts/view/contact-detail/contactDerive.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/pilotage/finance/finance-export.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/watchlist/model/watchlist.correctifs.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/signals-library/model/history-filters.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  [
    'src/features/watchlist/model/watchlist.mesCibles.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  ['src/features/watchlist/model/watchlist.test.ts', 'singleton i18n (FR) chargé par setup.ts : libellés EN en node'],
  [
    'src/features/welcome/lib/toWelcomeProfileSummary.test.ts',
    'singleton i18n (FR) chargé par setup.ts : libellés EN en node',
  ],
  ['src/lib/api-extract-error.test.ts', 'singleton i18n (FR) chargé par setup.ts : libellés EN en node'],
  ['src/lib/apolloVocabulary.test.ts', 'singleton i18n (FR) chargé par setup.ts : libellés EN en node'],
  ['src/lib/deadline.test.ts', 'singleton i18n (FR) chargé par setup.ts : libellés EN en node'],
  ['src/lib/locale.test.ts', 'singleton i18n (FR) chargé par setup.ts : libellés EN en node'],
])

const FORBIDDEN_IMPORTS = [/^@testing-library\//, /^react-dom(\/|$)/]
const FORBIDDEN_GLOBALS = /\b(document|window|screen|localStorage|sessionStorage|navigator|HTMLElement)\b/

function walk(dir, found = []) {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist' || entry.startsWith('.')) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, found)
    else found.push(relative(WEB_ROOT, full).split('\\').join('/'))
  }
  return found
}

/** Les chemins déjà réservés par `projects.ts` à d'autres projets (lus dans le texte, ce module est du TS). */
function reservedElsewhere() {
  const text = readFileSync(PROJECTS_TS, 'utf8')
  const reserved = new Set()
  for (const name of ['SUITES_NEEDING_OWN_PROCESS', 'SUITES_NEEDING_REAL_JSDOM', 'SUITES_NEEDING_DOM']) {
    const block = text.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\n?\\]`))
    if (!block) throw new Error(`classer-tests-node: ${name} introuvable dans projects.ts`)
    for (const m of block[1].matchAll(/'([^']+\.test\.tsx?)'/g)) reserved.add(m[1])
  }
  return reserved
}

function stripCommentsAndStrings(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
    .replace(/'(?:[^'\\\n]|\\.)*'|"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\[\s\S])*`/g, "''")
}

function specifiers(source) {
  const found = []
  const re =
    /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*|vi\.(?:mock|importActual|importMock|doMock)\s*\(\s*)(['"])([^'"\n]+)\1/g
  for (const m of source.matchAll(re)) found.push(m[2])
  return found
}

function resolvesToTsx(file, spec) {
  let base
  if (spec.startsWith('.')) base = resolve(dirname(join(WEB_ROOT, file)), spec)
  else if (spec.startsWith('@/')) base = join(WEB_ROOT, 'src', spec.slice(2))
  else return false
  const bare = base.replace(/\.(tsx?|jsx?)$/, '')
  return [`${base}.tsx`, `${bare}.tsx`, join(base, 'index.tsx')].some(p => existsSync(p))
}

function isPure(file, reserved) {
  if (reserved.has(file) || EXCLUSIONS_MESUREES.has(file)) return false
  const source = readFileSync(join(WEB_ROOT, file), 'utf8')
  for (const spec of specifiers(source)) {
    if (FORBIDDEN_IMPORTS.some(re => re.test(spec))) return false
    if (resolvesToTsx(file, spec)) return false
  }
  return !FORBIDDEN_GLOBALS.test(stripCommentsAndStrings(source))
}

function classify() {
  const reserved = reservedElsewhere()
  return walk(WEB_ROOT)
    .filter(f => /\.test\.ts$/.test(f))
    .filter(f => f.startsWith('src/') || f.startsWith('vite-plugins/'))
    .filter(f => !f.startsWith('src/architecture/'))
    .filter(f => isPure(f, reserved))
    .sort()
}

function render(files) {
  return [
    '// GÉNÉRÉ par `node scripts/classer-tests-node.mjs` — ne pas éditer à la main.',
    '// Une suite absente d’ici tourne en DOM (plus lente, jamais fausse). Voir `projects.ts`.',
    '',
    '/** Les suites web sans DOM : le périmètre du projet vitest `node (pur)`. */',
    'export const NODE_PUR_INCLUDE: string[] = [',
    ...files.map(f => `  '${f}',`),
    ']',
    '',
  ].join('\n')
}

const files = classify()
const expected = render(files)
if (process.argv.includes('--check')) {
  const actual = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : ''
  if (actual !== expected) {
    // `--seulement=<fichier>` (une liste de chemins, un par ligne, relatifs à la racine du dépôt ou
    // à apps/web) : on ne rougit que pour la dérive qui touche CES fichiers — ceux de la PR. La
    // dérive des autres fichiers (main a bougé sous la PR, #4484) est signalée, jamais bloquante.
    const seulement = process.argv.find(a => a.startsWith('--seulement='))?.slice('--seulement='.length)
    const listed = new Set([...actual.matchAll(/^ {2}'([^']+)',$/gm)].map(m => m[1]))
    const derive = [...new Set([...files, ...listed])].filter(f => files.includes(f) !== listed.has(f)).sort()
    if (seulement) {
      const touches = new Set(
        readFileSync(seulement, 'utf8')
          .split('\n')
          .map(l => l.trim().replace(/^apps\/web\//, ''))
          .filter(Boolean),
      )
      touches.add('src/test/tests-node.generated.ts')
      touches.add('scripts/classer-tests-node.mjs')
      const siennes = derive.filter(f => touches.has(f))
      const lesAutres = derive.filter(f => !touches.has(f))
      if (lesAutres.length > 0)
        console.warn(
          `tests-node.generated.ts : ${lesAutres.length} fichier(s) hors PR à reclasser : ${lesAutres.join(', ')}`,
        )
      if (siennes.length === 0) {
        console.log('tests-node.generated.ts : aucune dérive sur les fichiers de la PR')
        process.exit(0)
      }
      console.error(
        `tests-node.generated.ts n’est pas à jour pour : ${siennes.join(', ')} — lancer : node scripts/classer-tests-node.mjs`,
      )
      process.exit(1)
    }
    console.error('tests-node.generated.ts n’est pas à jour — lancer : node scripts/classer-tests-node.mjs')
    if (derive.length > 0) console.error(`dérive (${derive.length}) : ${derive.join(', ')}`)
    process.exit(1)
  }
  console.log('tests-node.generated.ts est à jour')
} else {
  writeFileSync(OUTPUT, expected)
  console.log(`tests-node.generated.ts : ${files.length} fichiers`)
}
