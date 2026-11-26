import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { parsePush, pushVerdict } from '../../../../tools/ci/claude-hook-push.mjs'
import { HOT_FILES, hotFileViolations, isLotBranch } from '../../../../tools/ci/hot-files.mjs'
import { buildPlan, listChangedFiles, touchedPackages } from '../../../../tools/ci/local.mjs'

/**
 * `pnpm ci:local` — la porte locale = l'Étage 1 de la CI (lot `ci/5-process`).
 * Ce qui se décide ici : QUELLES étapes tournent pour un diff donné, et quels
 * fichiers chauds une branche de lot n'a pas le droit de toucher.
 */
const PACKAGES = [
  { dir: 'apps/web', name: '@bellum/web', scripts: { lint: 'eslint .', 'check-types': 'tsc --noEmit' } },
  {
    dir: 'apps/api',
    name: '@bellum/api',
    scripts: { lint: 'eslint', 'check-types': 'tsc', 'check-types:tests': 'tsc -p tsconfig.json' },
  },
  { dir: 'apps/ia', name: '@bellum/ia', scripts: { lint: "echo 'TODO: ruff check'" } },
  { dir: 'packages/contracts', name: '@bellum/contracts', scripts: { lint: 'eslint .', 'check-types': 'tsc --build' } },
]

const ids = (plan: { id: string }[]) => plan.map(s => s.id)

describe('isLotBranch — seules les branches de lot sont bridées', () => {
  it('reconnaît claude/lot*', () => {
    expect(isLotBranch('claude/lot-630')).toBe(true)
    expect(isLotBranch('claude/lot42-divers')).toBe(true)
  })
  it("laisse passer l'intégration et le reste", () => {
    expect(isLotBranch('integration/30-10')).toBe(false)
    expect(isLotBranch('ci/5-process')).toBe(false)
    expect(isLotBranch('claude/integration-lot-630')).toBe(false)
  })
})

describe('hotFileViolations — les fichiers chauds sont refusés sur une branche de lot', () => {
  const chauds = [
    'packages/contracts/src/changelog/labels.fr.ts',
    'packages/contracts/src/changelog/entries.ts',
    'apps/api/src/modules/demo/demo-coverage.ts',
    'agent_docs/demo-mode.md',
    'agent_docs/chantiers-livres.md',
  ]
  it('nomme chaque fichier chaud touché par un lot', () => {
    expect(hotFileViolations('claude/lot-1', [...chauds, 'apps/web/src/x.ts'])).toEqual([...chauds].sort())
  })
  it("n'attrape pas ce qu'elle ne vise pas", () => {
    expect(
      hotFileViolations('claude/lot-1', [
        'apps/api/src/modules/demo/demo-dataset.ts',
        'agent_docs/demo-mode-old.md',
        'changes/lot-1.yml',
        'packages/contracts/src/schemas/changelog.ts',
      ]),
    ).toEqual([])
  })
  it("ne bride pas l'intégrateur", () => {
    expect(hotFileViolations('integration/31-10', chauds)).toEqual([])
  })
  it('déclare exactement les quatre familles du contrat', () => {
    expect(HOT_FILES).toHaveLength(4)
  })
})

describe('touchedPackages', () => {
  it('rattache un fichier à son paquet, et rien hors paquet', () => {
    const got = touchedPackages(['apps/web/src/a.ts', 'apps/web/b.json', 'docs/ci.md', 'tools/ci/x.mjs'], PACKAGES)
    expect(got.map(p => p.name)).toEqual(['@bellum/web'])
  })
  it('ne confond pas apps/web et apps/website', () => {
    expect(touchedPackages(['apps/website/src/a.ts'], PACKAGES)).toEqual([])
  })
})

describe('buildPlan — les étapes de l’Étage 1 selon le diff', () => {
  const base = { packages: PACKAGES, iaTests: ['apps/ia/tests/test_foo.py'], readSource: () => '' }

  it('tourne TOUJOURS : taille de CLAUDE.md, format, doc ↔ code', () => {
    const plan = buildPlan({ ...base, changed: ['README.md'] })
    expect(ids(plan)).toEqual(['claude-md', 'format', 'doc'])
  })

  it('un fichier web : lint et types du paquet, knip, tests web concernés', () => {
    const plan = buildPlan({ ...base, changed: ['apps/web/src/a.ts'] })
    expect(ids(plan)).toEqual([
      'claude-md',
      'format',
      'lint:@bellum/web',
      'knip',
      'types:@bellum/web',
      'doc',
      'tests:web',
    ])
    const lint = plan.find(s => s.id === 'lint:@bellum/web')
    expect(lint?.args).toContain('src/a.ts')
  })

  it('le lint ne reçoit pas un fichier SUPPRIMÉ par la branche (L7 31/10 : push cloud refusé)', () => {
    const plan = buildPlan({
      ...base,
      changed: ['apps/web/src/a.ts', 'apps/web/src/gone.test.tsx'],
      exists: f => f !== 'apps/web/src/gone.test.tsx',
    })
    const lint = plan.find(s => s.id === 'lint:@bellum/web')
    expect(lint?.args).toContain('src/a.ts')
    expect(lint?.args).not.toContain('src/gone.test.tsx')
    const onlyGone = buildPlan({ ...base, changed: ['apps/web/src/gone.tsx'], exists: () => false })
    expect(ids(onlyGone)).not.toContain('lint:@bellum/web')
  })

  it("le lint ne reçoit que des sources qu'ESLint lit", () => {
    const plan = buildPlan({ ...base, changed: ['apps/web/src/a.ts', 'apps/web/src/b.css', 'apps/web/c.json'] })
    const lint = plan.find(s => s.id === 'lint:@bellum/web')
    expect(lint?.args.filter(a => a.startsWith('src/') || a.endsWith('.json'))).toEqual(['src/a.ts'])
  })

  it('le lint ne reçoit jamais un fichier supprimé par le diff', () => {
    const plan = buildPlan({
      ...base,
      changed: ['apps/web/src/a.ts', 'apps/web/src/gone.ts'],
      exists: f => !f.endsWith('gone.ts'),
    })
    const lint = plan.find(s => s.id === 'lint:@bellum/web')
    expect(lint?.args).toContain('src/a.ts')
    expect(lint?.args).not.toContain('src/gone.ts')
  })

  it("l'API ajoute le typecheck de ses tests, et les tests API", () => {
    const got = ids(buildPlan({ ...base, changed: ['apps/api/src/a.ts'] }))
    expect(got).toContain('types:@bellum/api')
    expect(got).toContain('types-tests:@bellum/api')
    expect(got).toContain('tests:api')
    expect(got).not.toContain('tests:web')
  })

  it("l'IA : pytest sur les tests du module touché, et les deux portes d'éval", () => {
    const plan = buildPlan({ ...base, changed: ['apps/ia/app/foo.py'] })
    const pytest = plan.find(s => s.id === 'pytest:ia')
    expect(pytest?.args).toEqual(['-m', 'pytest', '-q', 'tests/test_foo.py'])
    expect(ids(plan)).toEqual(expect.arrayContaining(['eval:ia', 'eval-chat:ia']))
    // `lint` de l'IA est un `echo` : pas une garde, on ne le lance pas.
    expect(ids(plan)).not.toContain('lint:@bellum/ia')
  })

  it("un prompt IA : la suite IA entière est laissée à la CI, et c'est DIT", () => {
    const plan = buildPlan({ ...base, changed: ['apps/ia/app/prompts/x.py'] })
    const pytest = plan.find(s => s.id === 'pytest:ia')
    expect(pytest?.skip).toMatch(/CI/)
  })

  it('machine cloud : les tests et les évals sont laissés à la CI GitHub, et c’est DIT (Louis 31/10)', () => {
    const changed = ['apps/web/src/a.ts', 'apps/api/src/a.ts', 'apps/ia/app/foo.py', 'tools/issues/fusion_fragments.py']
    const plan = buildPlan({ ...base, changed, cloud: true })
    const heavy = plan.filter(s => /^(tests:|pytest:|eval)/.test(s.id))
    expect(heavy.length).toBeGreaterThanOrEqual(6)
    for (const s of heavy) expect(s.skip).toMatch(/cloud.*CI/)
    // Le rapide reste joué : format, lint, types, doc ne sont JAMAIS sautés.
    for (const id of ['format', 'lint:@bellum/web', 'types:@bellum/api', 'doc'])
      expect(plan.find(s => s.id === id)?.skip).toBeUndefined()
  })

  it('hors cloud : rien de sauté de plus (la garde sait dire NON)', () => {
    const plan = buildPlan({ ...base, changed: ['apps/web/src/a.ts', 'apps/ia/app/foo.py'] })
    expect(plan.filter(s => s.skip)).toEqual([])
  })

  it('un outil Python du dépôt : les pytest de tools/ (job quick)', () => {
    const plan = buildPlan({ ...base, changed: ['tools/issues/fusion_fragments.py'] })
    const step = plan.find(s => s.id === 'pytest:tools')
    expect(step?.args).toContain('tools/issues/test_fusion_fragments.py')
  })

  it('un registre touché : la cohérence des registres', () => {
    const got = ids(buildPlan({ ...base, changed: ['.claude/notes/registre-2026-10-31-x.md'] }))
    expect(got).toContain('registres')
  })
})

describe('hook PreToolUse — pas de push sans témoin ci:local au SHA courant', () => {
  it('reconnaît un git push, y compris avec -C, et ignore le reste', () => {
    expect(parsePush('git push -u origin HEAD:refs/heads/x')).toEqual({ dir: null })
    expect(parsePush('git -C /w/x push --no-verify -u origin HEAD:refs/heads/x')).toEqual({ dir: '/w/x' })
    expect(parsePush('git status')).toBeNull()
    expect(parsePush('echo git push')).toBeNull()
    expect(parsePush('git log --grep=push')).toBeNull()
  })
  it('exempte la suppression de branche et les tags', () => {
    expect(parsePush('git push origin --delete x')).toBeNull()
    expect(parsePush('git push origin :x')).toBeNull()
    expect(parsePush('git push --tags')).toBeNull()
  })
  it('bloque sans témoin ou sur un témoin périmé, laisse passer au SHA courant', () => {
    expect(pushVerdict({ head: 'abc', witness: null }).allow).toBe(false)
    expect(pushVerdict({ head: 'abc', witness: 'def' }).allow).toBe(false)
    expect(pushVerdict({ head: 'abc', witness: 'def' }).message).toMatch(/pnpm ci:local/)
    expect(pushVerdict({ head: 'abc', witness: 'abc' }).allow).toBe(true)
  })
})

describe('listChangedFiles — la porte ne juge que ce que git suit', () => {
  const repo = mkdtempSync(join(tmpdir(), 'porte-suivis-'))
  const git = (...args: string[]) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
  afterAll(() => rmSync(repo, { recursive: true, force: true }))

  git('init', '-q')
  git('config', 'user.email', 't@t.t')
  git('config', 'user.name', 't')
  git('config', 'commit.gpgsign', 'false')
  writeFileSync(join(repo, 'suivi.md'), '# ok\n')
  git('add', '.')
  git('commit', '-q', '-m', 'base')
  const base = git('rev-parse', 'HEAD')
  mkdirSync(join(repo, 'src'))
  writeFileSync(join(repo, 'suivi.md'), '#   mal   formaté\n')
  writeFileSync(join(repo, '.git-pr-body.md'), '#   brouillon\n')
  writeFileSync(join(repo, 'src', 'ajoute.ts'), 'const  a=1\n')
  git('add', 'src/ajoute.ts')

  it('un fichier non suivi (brouillon) n’est pas jugé', () => {
    const { changed, changedAcmr } = listChangedFiles(base, repo)
    expect(changed).not.toContain('.git-pr-body.md')
    expect(changedAcmr).not.toContain('.git-pr-body.md')
  })
  it('un fichier suivi modifié reste jugé (non-régression)', () => {
    const { changed, changedAcmr } = listChangedFiles(base, repo)
    expect(changed).toContain('suivi.md')
    expect(changedAcmr).toContain('suivi.md')
  })
  it('un fichier non suivi mais `git add`é est jugé', () => {
    const { changedAcmr } = listChangedFiles(base, repo)
    expect(changedAcmr).toContain('src/ajoute.ts')
    expect(changedAcmr).toEqual(['src/ajoute.ts', 'suivi.md'])
  })
})
