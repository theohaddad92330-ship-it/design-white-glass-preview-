import { execFileSync } from 'node:child_process'

import type { PageSpec } from '../spec/types'
import { REPO_ROOT } from './tokens'

/**
 * LE FIL DE NOUVEAUTÉS (point 3) — `generated/feed.json`, ce que la page
 * Figma « Nouveautés » affiche. La CI ne peut pas écrire dans Figma, donc ce
 * module ne fait que PRÉPARER la donnée ; le plugin la dessine (voir
 * `plugin/foundations.ts`, `drawChangelog`).
 *
 * Deux couches, comme `version.ts` :
 * - des fonctions PURES (`parseGitLog`, `commitToEntry`, `buildFeed`),
 *   testables sur un corpus fabriqué sans dépendre du disque ni de git ;
 * - `readCommitsSince`, la seule à parler à `git`, jamais testée sur sa
 *   sortie exacte (elle varie à chaque commit du dépôt), seulement sur sa
 *   FORME et sur ses cas « sait dire NON ».
 */

const SURFACE_DIRS = ['apps/web', 'apps/website', 'apps/dashboard-manager', 'packages/ui'] as const
const SPEC_FILE_PREFIX = 'packages/figma-sync/src/spec/pages/'

/** Séparateurs de champ (`%x1f`) et d'enregistrement (`%x1e`) du format `git log` — jamais du texte français. */
export const FS = '\x1f'
export const RS = '\x1e'

export interface RawCommit {
  /** Sha complet du commit. */
  sha: string
  /** Date ISO 8601 telle que rendue par `%cI` (date de commit, fuseau d'origine). */
  date: string
  subject: string
  /** Fichiers touchés, DÉJÀ filtrés aux quatre surfaces maquettées. */
  files: readonly string[]
}

/** Une spec impactée par un commit : la route touchée, et si sa spec a suivi dans le MÊME commit. */
interface FeedSpecImpact {
  specId: string
  route: string
  /** `true` = la route a changé sans que son fichier de spec bouge avec elle — à remaquetter. */
  needsMockup: boolean
}

interface FeedEntry {
  sha: string
  date: string
  subject: string
  specs: FeedSpecImpact[]
}

/** `entries` est TOUJOURS plus récent en tête ; `buildFeed` ne fait qu'ajouter en tête, jamais retirer. */
export interface Feed {
  entries: FeedEntry[]
}

/**
 * `git log --name-only --pretty=format:"<RS>%H<FS>%cI<FS>%s"` → chaque
 * commit commence par `RS` (posé AVANT l'en-tête, jamais après : les
 * fichiers de `--name-only` s'ajoutent APRÈS la ligne d'en-tête, un
 * séparateur posé après le sujet finirait entre l'en-tête d'un commit et les
 * fichiers du SUIVANT). Un sujet qui contiendrait `FS` (jamais en pratique)
 * est rejoint tel quel plutôt que tronqué.
 */
export function parseGitLog(raw: string, surfaceDirs: readonly string[] = SURFACE_DIRS): RawCommit[] {
  return raw
    .split(RS)
    .map(block => block.trim())
    .filter(block => block.length > 0)
    .map(block => {
      const lines = block.split('\n').filter(line => line.length > 0)
      const [header, ...files] = lines
      const [sha = '', date = '', ...subjectParts] = (header ?? '').split(FS)
      return {
        sha,
        date,
        subject: subjectParts.join(FS),
        files: files.filter(f => surfaceDirs.some(dir => f.startsWith(`${dir}/`))),
      }
    })
}

/** Le fichier de spec attendu pour un id `<surface>/<slug>`, par convention de dossier (`pages/<surface>/<slug>.ts`). */
function specFileFor(specId: string): string {
  return `${SPEC_FILE_PREFIX}${specId}.ts`
}

/**
 * Un commit → l'entrée de fil. `specs` ne cite QUE les routes RÉELLEMENT
 * touchées (fichier présent dans `realRoutes`, exactement `PageSpec.route`)
 * — jamais une association devinée par dossier ou par domaine (doctrine
 * « jamais de donnée fictive » appliquée au mappage fichier → spec). Un
 * fichier de feature touché sans que la route elle-même bouge ne produit
 * donc aucune spec : c'est la route, pas la fonctionnalité, qui est le signal.
 */
export function commitToEntry(commit: RawCommit, pages: readonly PageSpec[], realRoutes: readonly string[]): FeedEntry {
  const pageByRoute = new Map(pages.map(p => [p.route, p]))
  const touchedRoutes = commit.files.filter(f => realRoutes.includes(f))
  const seen = new Set<string>()
  const specs: FeedSpecImpact[] = []
  for (const route of touchedRoutes) {
    const page = pageByRoute.get(route)
    if (!page || seen.has(page.id)) continue
    seen.add(page.id)
    specs.push({ specId: page.id, route, needsMockup: !commit.files.includes(specFileFor(page.id)) })
  }
  specs.sort((a, b) => a.specId.localeCompare(b.specId))
  return { sha: commit.sha, date: commit.date, subject: commit.subject, specs }
}

/**
 * Ajoute EN TÊTE les commits pas encore dans `previous` (dédoublonnés par
 * sha) — jamais une entrée retirée, jamais réordonnée : rejouer avec les
 * mêmes commits est un no-op (idempotence de la doc du chantier).
 */
export function buildFeed(
  commits: readonly RawCommit[],
  pages: readonly PageSpec[],
  realRoutes: readonly string[],
  previous: Feed | null,
): Feed {
  const known = new Set((previous?.entries ?? []).map(e => e.sha))
  const newEntries = commits.filter(c => !known.has(c.sha)).map(c => commitToEntry(c, pages, realRoutes))
  return { entries: [...newEntries, ...(previous?.entries ?? [])] }
}

/**
 * Les commits `git log` (sans fusion) touchant les quatre surfaces, depuis
 * `sinceSha` (exclu) jusqu'à `HEAD`, ou les `limit` derniers si `sinceSha`
 * est `null` ou `inconnu` (première extraction, pas de tampon précédent).
 * Ni exception ni liste inventée si `git` échoue (dossier hors dépôt, sha
 * introuvable après un rebase/squash) : une liste vide, le fil n'avance
 * simplement pas ce coup-ci.
 */
export function readCommitsSince(sinceSha: string | null, limit: number, root: string = REPO_ROOT): RawCommit[] {
  const range = sinceSha && sinceSha !== 'inconnu' ? [`${sinceSha}..HEAD`] : ['-n', String(limit), 'HEAD']
  try {
    const raw = execFileSync(
      'git',
      ['log', '--no-merges', '--name-only', `--pretty=format:${RS}%H${FS}%cI${FS}%s`, ...range, '--', ...SURFACE_DIRS],
      { cwd: root, encoding: 'utf8', stdio: 'pipe' },
    )
    return parseGitLog(raw)
  } catch {
    return []
  }
}
