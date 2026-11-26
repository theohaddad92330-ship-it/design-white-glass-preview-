import { tmpdir } from 'node:os'
import { describe, expect, it } from 'vitest'

import type { PageSpec } from '../spec/types'
import { buildFeed, commitToEntry, parseGitLog, readCommitsSince, RS, FS, type Feed, type RawCommit } from './changelog'

/** Deux pages minimales, juste assez pour exercer le mappage fichier → spec. */
const PAGES: readonly PageSpec[] = [
  {
    id: 'app/projects-detail',
    surface: 'app',
    domain: 'projects',
    route: 'apps/web/src/routes/projects/$id.tsx',
    title: 'Dossier de projet',
    template: 'detail',
    viewports: ['desktop'],
    slots: {},
    states: { loading: [], error: [] },
    uxNotes: [],
  } as PageSpec,
  {
    id: 'app/accounts',
    surface: 'app',
    domain: 'accounts',
    route: 'apps/web/src/routes/accounts/index.tsx',
    title: 'Comptes',
    template: 'list',
    viewports: ['desktop'],
    slots: {},
    states: { empty: [], loading: [], error: [] },
    uxNotes: [],
  } as PageSpec,
]

const REAL_ROUTES = [PAGES[0]!.route, PAGES[1]!.route, 'apps/web/src/routes/__root.tsx']

describe('parseGitLog — le format brut de `git log --name-only`', () => {
  it('découpe plusieurs commits, chacun avec ses fichiers filtrés aux quatre surfaces', () => {
    const raw = [
      `${RS}sha1${FS}2026-09-25T10:00:00+02:00${FS}feat(web): #2801 la fiche projet`,
      'apps/web/src/routes/projects/$id.tsx',
      'apps/web/src/features/projects/view/ProjectDossierPage.tsx',
      'apps/api/src/modules/projects/projects.controller.ts', // hors des 4 surfaces — filtré
      `${RS}sha2${FS}2026-09-24T09:00:00+02:00${FS}fix(web): typo`,
      'apps/web/src/routes/accounts/index.tsx',
    ].join('\n')

    const commits = parseGitLog(raw)
    expect(commits).toEqual([
      {
        sha: 'sha1',
        date: '2026-09-25T10:00:00+02:00',
        subject: 'feat(web): #2801 la fiche projet',
        files: ['apps/web/src/routes/projects/$id.tsx', 'apps/web/src/features/projects/view/ProjectDossierPage.tsx'],
      },
      {
        sha: 'sha2',
        date: '2026-09-24T09:00:00+02:00',
        subject: 'fix(web): typo',
        files: ['apps/web/src/routes/accounts/index.tsx'],
      },
    ])
  })

  it('sait dire NON : une entrée vide (double séparateur) ne produit aucun commit fantôme', () => {
    expect(parseGitLog('')).toEqual([])
    expect(parseGitLog(`${RS}${RS}`)).toEqual([])
  })

  it('un sujet contenant le séparateur de champ ne casse pas le découpage (rejoint tel quel)', () => {
    const raw = `${RS}sha1${FS}2026-09-25T10:00:00+02:00${FS}feat: a${FS}b`
    const [commit] = parseGitLog(raw)
    expect(commit?.subject).toBe(`feat: a${FS}b`)
  })
})

describe('commitToEntry — fichiers → specs, exact sur `PageSpec.route`', () => {
  const base: RawCommit = { sha: 'abc1234', date: '2026-09-25T10:00:00Z', subject: 'feat(web): #2801', files: [] }

  it('un commit qui touche une route ET son fichier de spec : pas de badge « à maquetter »', () => {
    const commit: RawCommit = {
      ...base,
      files: ['apps/web/src/routes/projects/$id.tsx', 'packages/figma-sync/src/spec/pages/app/projects-detail.ts'],
    }
    const entry = commitToEntry(commit, PAGES, REAL_ROUTES)
    expect(entry.specs).toEqual([
      { specId: 'app/projects-detail', route: 'apps/web/src/routes/projects/$id.tsx', needsMockup: false },
    ])
  })

  it('sait dire NON : une route touchée SANS son fichier de spec porte le badge « à maquetter »', () => {
    const commit: RawCommit = { ...base, files: ['apps/web/src/routes/projects/$id.tsx'] }
    const entry = commitToEntry(commit, PAGES, REAL_ROUTES)
    expect(entry.specs).toEqual([
      { specId: 'app/projects-detail', route: 'apps/web/src/routes/projects/$id.tsx', needsMockup: true },
    ])
  })

  it('un fichier de feature touché (pas la route elle-même) ne produit AUCUNE spec — jamais d’association devinée', () => {
    const commit: RawCommit = { ...base, files: ['apps/web/src/features/projects/view/ProjectDossierPage.tsx'] }
    const entry = commitToEntry(commit, PAGES, REAL_ROUTES)
    expect(entry.specs).toEqual([])
  })

  it('une route réelle sans spec (exception ou registre incomplet) n’apparaît pas dans `specs`', () => {
    const commit: RawCommit = { ...base, files: ['apps/web/src/routes/__root.tsx'] }
    const entry = commitToEntry(commit, PAGES, REAL_ROUTES)
    expect(entry.specs).toEqual([])
  })

  it('deux routes touchées dans le même commit : une entrée par spec, triées par id', () => {
    const commit: RawCommit = {
      ...base,
      files: ['apps/web/src/routes/accounts/index.tsx', 'apps/web/src/routes/projects/$id.tsx'],
    }
    const entry = commitToEntry(commit, PAGES, REAL_ROUTES)
    expect(entry.specs.map(s => s.specId)).toEqual(['app/accounts', 'app/projects-detail'])
  })
})

describe('buildFeed — plus récent en haut, APPEND-ONLY, idempotent', () => {
  const commits: RawCommit[] = [
    { sha: 'new2', date: '2026-09-26T10:00:00Z', subject: 'feat: b', files: [] },
    { sha: 'new1', date: '2026-09-25T10:00:00Z', subject: 'feat: a', files: [] },
  ]
  const previous: Feed = {
    entries: [{ sha: 'old1', date: '2026-09-20T10:00:00Z', subject: 'feat: ancien', specs: [] }],
  }

  it('sans tampon précédent : toutes les entrées, plus récente en tête', () => {
    const feed = buildFeed(commits, PAGES, REAL_ROUTES, null)
    expect(feed.entries.map(e => e.sha)).toEqual(['new2', 'new1'])
  })

  it('avec un tampon précédent : les nouvelles entrées PRÉCÈDENT les anciennes, aucune n’est retirée', () => {
    const feed = buildFeed(commits, PAGES, REAL_ROUTES, previous)
    expect(feed.entries.map(e => e.sha)).toEqual(['new2', 'new1', 'old1'])
  })

  it('sait dire NON : rejouer avec les MÊMES commits ne duplique rien (idempotent par sha)', () => {
    const once = buildFeed(commits, PAGES, REAL_ROUTES, previous)
    const twice = buildFeed(commits, PAGES, REAL_ROUTES, once)
    expect(twice.entries.map(e => e.sha)).toEqual(['new2', 'new1', 'old1'])
  })
})

describe('readCommitsSince — lit le vrai dépôt', () => {
  it('avec une limite, rend au plus `limit` commits touchant les quatre surfaces', () => {
    const commits = readCommitsSince(null, 5)
    expect(commits.length).toBeLessThanOrEqual(5)
    for (const c of commits) expect(c.sha).toMatch(/^[0-9a-f]{7,40}$/)
  })

  it('sait dire NON : un dossier sans dépôt git rend une liste vide, jamais une exception', () => {
    expect(readCommitsSince(null, 5, tmpdir())).toEqual([])
  })

  it('sait dire NON : un sha de départ introuvable rend une liste vide plutôt que de lever', () => {
    expect(readCommitsSince('0000000000000000000000000000000000000f', 5)).toEqual([])
  })
})
