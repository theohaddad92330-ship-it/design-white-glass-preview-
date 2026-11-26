import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'

/**
 * GA-413 (#4117) — la doc décrite par un fichier de code BOUGE avec lui.
 *
 * Une fiche `agent_docs/*.md` porte un frontmatter `sources:` (globs du code
 * qu'elle décrit). Sur une PR, si un fichier couvert change et que sa fiche ne
 * change pas, `scripts/garde-derive-doc.mjs` sort 1. Une fiche qui décrit un
 * code qui n'est plus celui-là est pire qu'une fiche absente : on s'y fie.
 *
 * Doctrine : un zéro n'est une mesure qu'avec son code de sortie. Plage vide
 * ou rien de couvert = 2 (« RIEN À COMPARER »), base introuvable = 3, glob qui
 * ne désigne aucun fichier = 4 — jamais 0.
 *
 * Une garde protège une règle, elle sait dire NON (faux diff), LIRE (le
 * frontmatter décide, pas une liste écrite ici) et ne pas attraper ce qu'elle
 * ne vise pas (fichier non couvert, fiche sans `sources:`).
 */
const RACINE = resolve(__dirname, '../../../..')
const SCRIPT = join(RACINE, 'scripts/garde-derive-doc.mjs')

const git = (repo: string, ...args: string[]): string =>
  execFileSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
    cwd: repo,
    encoding: 'utf8',
  })

const ecrire = (repo: string, chemin: string, contenu: string): void => {
  mkdirSync(dirname(join(repo, chemin)), { recursive: true })
  writeFileSync(join(repo, chemin), contenu)
}

const FICHE = (sources: string[]): string =>
  `---\nsources:\n${sources.map(s => `  - ${s}`).join('\n')}\n---\n\n# Fiche\n`

const lancer = (repo: string, plage: string): { code: number | null; sortie: string } => {
  const r = spawnSync('node', [SCRIPT, plage, '--repo', repo], { encoding: 'utf8' })
  return { code: r.status, sortie: `${r.stdout}${r.stderr}` }
}

describe('GA-413 — la doc suit le code (garde de dérive doc↔code)', () => {
  let repo: string

  beforeEach(() => {
    repo = mkdtempSync(join(tmpdir(), 'ga413-'))
    git(repo, 'init', '-q', '-b', 'main')
    ecrire(repo, 'agent_docs/pipeline.md', FICHE(['src/pipeline/*.py']))
    ecrire(repo, 'agent_docs/libre.md', '# Sans frontmatter\n')
    ecrire(repo, 'src/pipeline/a.py', 'a = 1\n')
    ecrire(repo, 'src/autre/b.py', 'b = 1\n')
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', 'base')
    git(repo, 'checkout', '-q', '-b', 'pr')
  })

  afterEach(() => rmSync(repo, { recursive: true, force: true }))

  const commit = (message: string): void => {
    git(repo, 'add', '.')
    git(repo, 'commit', '-q', '-m', message)
  }

  it('NON : code couvert modifié, fiche inchangée → sortie 1 avec « fiche → fichiers »', () => {
    ecrire(repo, 'src/pipeline/a.py', 'a = 2\n')
    commit('feat: change le pipeline')
    const r = lancer(repo, 'main...HEAD')
    expect(r.code).toBe(1)
    expect(r.sortie).toContain('agent_docs/pipeline.md')
    expect(r.sortie).toContain('src/pipeline/a.py')
  })

  it('OUI : code couvert ET fiche modifiés → sortie 0', () => {
    ecrire(repo, 'src/pipeline/a.py', 'a = 2\n')
    ecrire(repo, 'agent_docs/pipeline.md', `${FICHE(['src/pipeline/*.py'])}\nmise à jour\n`)
    commit('feat: pipeline + doc')
    expect(lancer(repo, 'main...HEAD').code).toBe(0)
  })

  it('NE VISE PAS : un fichier non couvert modifié → 2 (rien à comparer), jamais 1 ni 0', () => {
    ecrire(repo, 'src/autre/b.py', 'b = 2\n')
    commit('feat: autre chose')
    const r = lancer(repo, 'main...HEAD')
    expect(r.code).toBe(2)
    expect(r.sortie).toContain('RIEN À COMPARER')
  })

  it('plage vide → 2, « pas un vert »', () => {
    const r = lancer(repo, 'main...HEAD')
    expect(r.code).toBe(2)
    expect(r.sortie).toContain('pas un vert')
  })

  it('base introuvable → 3 (distinct)', () => {
    ecrire(repo, 'src/pipeline/a.py', 'a = 2\n')
    commit('x')
    expect(lancer(repo, 'origin/inexistante...HEAD').code).toBe(3)
  })

  it('LIT le frontmatter : changer ses globs change le verdict', () => {
    ecrire(repo, 'agent_docs/pipeline.md', FICHE(['src/autre/*.py']))
    commit('doc: la fiche décrit désormais autre/')
    // La fiche a bougé : tout va bien pour ce commit. On repart d'une base neuve.
    git(repo, 'checkout', '-q', 'main')
    git(repo, 'merge', '-q', '--ff-only', 'pr')
    git(repo, 'checkout', '-q', '-b', 'pr2')
    ecrire(repo, 'src/pipeline/a.py', 'a = 3\n')
    commit('feat: pipeline, plus couvert')
    expect(lancer(repo, 'main...HEAD').code).toBe(2)
    ecrire(repo, 'src/autre/b.py', 'b = 3\n')
    commit('feat: autre, désormais couvert')
    expect(lancer(repo, 'main...HEAD').code).toBe(1)
  })

  it('un glob qui ne désigne aucun fichier → 4, explicite', () => {
    ecrire(repo, 'agent_docs/pipeline.md', FICHE(['src/fantome/*.py']))
    commit('doc: glob mort')
    const r = lancer(repo, 'main...HEAD')
    expect(r.code).toBe(4)
    expect(r.sortie).toContain('src/fantome/*.py')
  })

  it('échappatoire tracée : « Doc-inchangée: <fiche> — <raison> » dans un commit → 0', () => {
    ecrire(repo, 'src/pipeline/a.py', 'a = 2\n')
    commit('refactor: renommage interne\n\nDoc-inchangée: agent_docs/pipeline.md — aucun comportement décrit ne change')
    const r = lancer(repo, 'main...HEAD')
    expect(r.code).toBe(0)
    expect(r.sortie).toContain('aucun comportement décrit ne change')
  })

  it('l’échappatoire exige une raison (sans raison → 1)', () => {
    ecrire(repo, 'src/pipeline/a.py', 'a = 2\n')
    commit('refactor: x\n\nDoc-inchangée: agent_docs/pipeline.md —')
    expect(lancer(repo, 'main...HEAD').code).toBe(1)
  })

  describe('le dépôt réel', () => {
    const cible = RACINE

    it('lit un corpus réel : au moins 5 fiches portent `sources:` et leurs globs désignent des fichiers', () => {
      const fiches = ['pipeline', 'agent-contract', 'env-reference', 'database_schema', 'prompts', 'demo-mode']
      for (const f of fiches) {
        expect(readFileSync(join(cible, `agent_docs/${f}.md`), 'utf8')).toMatch(/^---\nsources:\n {2}- /)
      }
      // Plage HEAD...HEAD : vide donc 2 — mais la validation des globs (4 sinon) a eu lieu AVANT.
      const r = spawnSync('node', [SCRIPT, 'HEAD...HEAD', '--repo', cible], { encoding: 'utf8' })
      expect(r.status).toBe(2)
    })
  })

  it('est branchée en CI : job dans `needs` ET dans les résultats de ci-status', () => {
    const ci = readFileSync(join(RACINE, '.github/workflows/ci.yml'), 'utf8')
    expect(ci).toContain('scripts/garde-derive-doc.mjs')
    expect(ci).toMatch(/needs:\s*\[[^\]]*doc-suit-le-code/)
    expect(ci).toContain('needs.doc-suit-le-code.result')
  })
})
