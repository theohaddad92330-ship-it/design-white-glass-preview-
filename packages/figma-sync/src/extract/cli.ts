import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { format, resolveConfig } from 'prettier'

import { iconsUsed } from '../plugin/components'
import { renderGabaritsDoc } from '../plugin/templates/rules'
import { PAGES } from '../spec/pages'
import { realRoutesOnDisk } from '../spec/route-coverage'
import { renderTokenNames } from '../spec/render-token-names'
import { buildFeed, readCommitsSince, type Feed } from './changelog'
import { extractDemo, loadDemoModule } from './demo'
import { extractIcons } from './icons'
import { extractTokens, readSources, REPO_ROOT } from './tokens'
import { buildVersionStamp, type VersionStamp } from './version'
import { readShortSha } from './version-git'

/**
 * `pnpm --filter @bellum/figma-sync extract` → `generated/tokens.json`,
 * `src/spec/token-names.generated.ts`, `generated/icons.json` (les tracés
 * lucide des icônes que les composants dessinent), `generated/demo.json` (le
 * jeu de démonstration des maquettes) et `docs/gabarits.md` —
 * tous commités, un test les garde à jour.
 */
const set = extractTokens(readSources())
const outDir = resolve(REPO_ROOT, 'packages/figma-sync/generated')
mkdirSync(outDir, { recursive: true })
const outFile = resolve(outDir, 'tokens.json')
// Formaté comme le reste du dépôt : sinon `prettier --check` (CI) rougit à chaque extraction.
const options = (await resolveConfig(outFile)) ?? {}
writeFileSync(outFile, await format(JSON.stringify(set), { ...options, filepath: outFile }))
const namesFile = resolve(REPO_ROOT, 'packages/figma-sync/src/spec/token-names.generated.ts')
writeFileSync(namesFile, await format(renderTokenNames(set), { ...options, filepath: namesFile }))
const iconsFile = resolve(outDir, 'icons.json')
const icons = extractIcons(iconsUsed())
writeFileSync(iconsFile, await format(JSON.stringify(icons), { ...options, filepath: iconsFile }))
// Le jeu de démonstration des maquettes (défaut B, 25/09/2026) : celui que voit un prospect.
const demoFile = resolve(outDir, 'demo.json')
const demo = extractDemo(await loadDemoModule())
writeFileSync(demoFile, await format(JSON.stringify(demo), { ...options, filepath: demoFile }))
const docsDir = resolve(REPO_ROOT, 'packages/figma-sync/docs')
mkdirSync(docsDir, { recursive: true })
const docFile = resolve(docsDir, 'gabarits.md')
writeFileSync(docFile, await format(renderGabaritsDoc(), { ...options, filepath: docFile }))
// Le fil de nouveautés (#point 3) : lu AVANT que le tampon soit écrasé plus
// bas — il ne peut avancer que depuis ce que le DERNIER passage savait
// (sinon les 30 derniers commits, première extraction ou tampon perdu).
const versionFile = resolve(outDir, 'version.json')
const previousVersion: VersionStamp | null = existsSync(versionFile)
  ? (JSON.parse(readFileSync(versionFile, 'utf8')) as VersionStamp)
  : null
const feedFile = resolve(outDir, 'feed.json')
const previousFeed: Feed | null = existsSync(feedFile) ? (JSON.parse(readFileSync(feedFile, 'utf8')) as Feed) : null
const HISTORY_LIMIT = 30
const commits = readCommitsSince(previousVersion?.sha ?? null, HISTORY_LIMIT)
const feed = buildFeed(commits, PAGES, realRoutesOnDisk(), previousFeed)
writeFileSync(feedFile, await format(JSON.stringify(feed), { ...options, filepath: feedFile }))

// Le tampon de version (#point 2) : sha court, date, nombre de specs — la
// seule façon pour le plugin de savoir si le fichier Figma suit encore le code.
const version = buildVersionStamp(PAGES.length, readShortSha())
writeFileSync(versionFile, await format(JSON.stringify(version), { ...options, filepath: versionFile }))

const count = (n: number, label: string): string => `${n} ${label}`
process.stdout.write(
  `${[
    count(set.primitives.length, 'primitives'),
    count(set.colors.length, 'couleurs à modes'),
    count(set.radius.length, 'rayons'),
    count(set.spacing.length, 'espacements'),
    count(set.zIndex.length, 'z-index'),
    count(set.shadows.length, 'ombres'),
    count(set.textStyles.length, 'styles de texte'),
    count(set.motion.ease.length + set.motion.durations.length, 'mouvements'),
    count(Object.keys(icons).length, 'icônes'),
    count(demo.accounts.length + demo.contacts.length + demo.consultants.length, 'fiches de démonstration'),
  ].join(' · ')}\n`,
)
process.stdout.write(`Version ${version.sha} · ${version.date} · ${version.specCount} pages maquettées\n`)
process.stdout.write(`Fil de nouveautés : +${commits.length} commit(s) · ${feed.entries.length} entrée(s) au total\n`)
for (const s of set.skipped) process.stdout.write(`  écarté ${s.cssVar} (${s.source}) — ${s.reason}\n`)
