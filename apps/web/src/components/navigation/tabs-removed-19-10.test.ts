import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NAV_SECTIONS, sectionForPath } from './sections'

/**
 * Décision Louis du 19/10/2026 (call refonte UX + QCM) — renversement ASSUMÉ de
 * l'arbitrage 1 de #4191 (14/10), écrit daté dans `agent_docs/doctrine.md`.
 *
 *  - #4340 — Pistes quitte Affaires : son contenu était monté par Signaux (`/mes-cibles`) — #4545 (25/10) revient
 *    sur ce point : les pistes ouvrent le panneau du Pipe (`/projects?pistes=1`), Signaux ne les porte plus.
 *  - #4341 — Appels d'offres quitte Affaires : l'espace vit DANS le pipe (`/projects?lens=rfp`).
 *  - #4344 — Besoins ouverts quitte Talents : l'écran vit sous Affaires (`/projects/needs`).
 *  - #4349 — Positionnements quitte Talents : Talents = Vivier seul.
 *
 * Rien n'est perdu : chaque contenu va dans l'onglet nommé. La garde LIT les
 * fichiers de route et sait dire NON (témoins fabriqués en fin de fichier).
 */
const ROUTES = join(__dirname, '..', '..', 'routes')
const SRC = join(__dirname, '..', '..')
const read = (file: string) => readFileSync(join(ROUTES, file), 'utf8')
const code = (source: string) => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

/** La cible d'un `throw redirect({ to: … })` lue dans le loader, ou `null`. */
function redirectTarget(source: string): string | null {
  const stripped = code(source)
  if (!/beforeLoad\s*:/.test(stripped) || /component\s*:/.test(stripped)) return null
  return /throw redirect\(\{\s*to:\s*'([^']+)'/.exec(stripped)?.[1] ?? null
}

const tabsOf = (key: string) => NAV_SECTIONS.find(section => section.key === key)?.tabs.map(tab => tab.to) ?? []

describe('19/10 — les onglets retirés d’Affaires et de Talents', () => {
  it('Affaires n’a plus d’onglet : le Pipe seul (#4340, #4341)', () => {
    expect(tabsOf('projects')).toEqual([])
    expect(NAV_SECTIONS.find(section => section.key === 'projects')?.to).toBe('/projects')
  })

  it('Talents n’a plus d’onglet : le Vivier seul (#4344, #4349)', () => {
    expect(tabsOf('talents')).toEqual([])
    expect(NAV_SECTIONS.find(section => section.key === 'talents')?.to).toBe('/consultants')
  })

  // #4545 (Louis 25/10/2026) REVIENT SUR #4340 (19/10) : les pistes ont quitté Signaux. Elles vivent dans le
  // panneau du Pipe (`/projects?pistes=1`), le même `PistesBoard` ; #4197 L6 reste gardé (pas d'onglet, pas d'adresse).
  it('#4545 — Signaux ne monte plus les pistes ; le panneau du Pipe les porte (#4197 L6 gardé, #4359)', () => {
    expect(() => read('projects/pistes.tsx')).toThrow()
    for (const file of [
      'features/signals-library/view/SignalsLibraryPage.tsx',
      'features/target-lists/view/TargetListsContent.tsx',
    ]) {
      const screen = readFileSync(join(SRC, file), 'utf8')
      expect(code(screen), file).not.toMatch(/Pistes(Section|Board|Count)/)
    }
    expect(() => readFileSync(join(SRC, 'features/projects/view/PistesSection.tsx'), 'utf8')).toThrow()
    const page = readFileSync(join(SRC, 'features/projects/view/ProjectsPage.tsx'), 'utf8')
    expect(code(page)).toMatch(/<PistesDrawer\b/)
    const drawer = readFileSync(join(SRC, 'features/projects/pipeline-detections/view/PistesDrawer.tsx'), 'utf8')
    // Refonte Théo (maquette validée) : détections et besoins fusionnés en UN tableau, `PistesBoard`,
    // qui lit les deux mêmes sources que l'ancien bandeau et l'ancienne lentille.
    expect(code(drawer)).toMatch(/<PistesBoard\b/)
    const board = readFileSync(join(SRC, 'features/projects/view/PistesBoard.tsx'), 'utf8')
    expect(code(board)).toMatch(/usePipelineDetections\(\)/)
    expect(code(board)).toMatch(/useAccountNeeds\(\)/)
    expect(code(board)).toMatch(/<ResponsiveTable\b/)
  })

  it('#4341 — l’espace des appels d’offres est monté DANS le pipe, plus d’adresse `/rfp` (#4359)', () => {
    expect(() => read('rfp/index.tsx')).toThrow()
    const pipe = readFileSync(join(SRC, 'features/projects/view/ProjectsPage.tsx'), 'utf8')
    expect(code(pipe)).toMatch(/<RfpWorkspace\b/)
  })

  it('#4344 — les besoins vivent sous Affaires : /projects/needs s’allume sur Affaires', () => {
    expect(sectionForPath('/projects/needs')?.section.key).toBe('projects')
    expect(sectionForPath('/projects/needs/abc-123')?.section.key).toBe('projects')
  })

  // F1-FIX #4344 — recette prod 20/10 : la page existait encore (titre « Besoins ouverts », 17 icônes débordantes).
  it('F1-FIX #4344 — /projects/needs NU redirige vers le Pipe ; seul un lien profond nommé garde l’écran', () => {
    const source = code(read('projects/needs.tsx'))
    expect(source).toMatch(/beforeLoad\s*:/)
    expect(source).toMatch(/throw redirect\(\{\s*to:\s*'\/projects'/)
    expect(source).toMatch(/replace:\s*true/)
    for (const deepLink of ['match', 'q', 'fromRfp', 'account_id']) {
      expect(source, deepLink).toMatch(new RegExp(`search\\.${deepLink}\\b`))
    }
  })

  it('F1-FIX #4341/#4344 — l’entête du Pipe ne porte plus « Besoins à pourvoir » ni « Appels d’offres »', () => {
    const pipe = code(readFileSync(join(SRC, 'features/projects/view/ProjectsPage.tsx'), 'utf8'))
    expect(pipe).not.toMatch(/page\.openNeeds/)
    expect(pipe).not.toMatch(/page\.openRfp/)
    expect(pipe).not.toMatch(/<Link to="\/projects\/needs"/)
  })

  it('F1-FIX #4341 — l’envoi du modèle d’appel d’offres part d’une affaire du pipe', () => {
    const dossier = code(readFileSync(join(SRC, 'features/projects/view/ProjectPropertiesContent.tsx'), 'utf8'))
    expect(dossier).toMatch(/lens:\s*'rfp'/)
    expect(dossier).toMatch(/detail\.answerTender/)
  })

  it('#4349 — les positionnements sont une section du Vivier, plus d’adresse à eux (#4359)', () => {
    expect(() => read('consultants/submissions.tsx')).toThrow()
  })

  it('/talents et /affaires n’ont plus de fichier de route (#4359) : introuvable, sans doublon de table', () => {
    expect(() => read('talents/index.tsx')).toThrow()
    expect(() => read('affaires/index.tsx')).toThrow()
  })

  it('sait dire NON : une route qui rend encore son écran n’a pas de cible', () => {
    const survivor = "export const Route = createFileRoute('/rfp/')({ component: RfpPage })"
    expect(redirectTarget(survivor)).toBeNull()
    const commented =
      "// throw redirect({ to: '/projects' })\nexport const Route = createFileRoute('/x')({ component: X })"
    expect(redirectTarget(commented)).toBeNull()
  })
})
