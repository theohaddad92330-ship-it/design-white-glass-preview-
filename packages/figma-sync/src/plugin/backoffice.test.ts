import { beforeAll, describe, expect, it } from 'vitest'

import tokensJson from '../../generated/tokens.json'
import type { TokenSet } from '../extract/types'
import { DEFAULT_PAGE_WIDTHS } from '../spec/catalog'
import { OVERLAYS } from '../spec/overlays'
import { PAGES } from '../spec/pages'
import { buildComponents, buildOverlays, buildPages, buildTemplates, type BuildContext } from './builders'
import { createFakeFigma, createMemoryLog } from './fake-figma'
import { createFakeScene, descendants, type FakeNode } from './fake-scene'
import { fontSizeOf, overflows, visibleDescendants } from './layout-probe'
import { overlayFrameName, overlayPageOf } from './overlays/render'
import { FIGMA_PAGES } from './pages'
import { filterSheetFrameName, frameName } from './pages/render'
import { backofficeSetName, templateSetName } from './templates/layout'
import { LAYOUTS } from './templates/rules'
import { upsertPages } from './upsert'
import { syncVariables } from './variables'

/**
 * Le DM est un PRODUIT MOBILE complet (Q7, arbitrage de Louis du 25/09/2026, `docs/revue-ux.md` §6) :
 * sa coque est la sienne (`backoffice`, RUX-08 révisé), ses tableaux ont des rôles mobiles, chaque page
 * est dessinée à 390 et 360, et ses surcouches à 390. Toutes les gardes tournent sur la synchronisation
 * complète du DM (faux figma) — et les deux premières savent dire NON sur l'app.
 */

const tokens = tokensJson as unknown as TokenSet
const DM_PAGES = PAGES.filter(p => p.surface === 'dm')
const DM_OVERLAYS = OVERLAYS.filter(o => o.surface === 'dm')
const WARN_ALLOWLIST = [/introuvable dans les polices installées — repli sur/]

const widthOf = (f: FakeNode): number => Number(f.name.split(' · ')[1])
const isInstance = (n: FakeNode, name: string): boolean => n.type === 'INSTANCE' && n.name === name

describe('backoffice (DM) — produit mobile (faux figma)', { timeout: 120_000 }, () => {
  const scene = createFakeScene()
  const log = createMemoryLog()
  const variableIds = new Set<string>()
  const dmFrames: FakeNode[] = []
  const appFrames: FakeNode[] = []

  beforeAll(async () => {
    const vars = createFakeFigma()
    const variables = await syncVariables(vars.api, tokens, createMemoryLog())
    for (const v of vars.variables) variableIds.add(v.id)
    upsertPages(scene.api as never, FIGMA_PAGES)
    const ctx: BuildContext = { tokens, variables, log, draw: scene.api }
    await buildComponents(ctx)
    await buildTemplates(ctx)
    await buildPages(ctx, 'dm', PAGES)
    await buildPages(
      ctx,
      'app',
      PAGES.filter(p => p.id === 'app/accounts'),
    )
    await buildOverlays(ctx, 'dm', OVERLAYS, PAGES)
    for (const p of scene.pages) {
      if (p.name.startsWith('DM — ')) dmFrames.push(...p.children)
      if (p.name.startsWith('App — ')) appFrames.push(...p.children)
    }
  }, 240_000)

  const pageFrames = (): FakeNode[] => dmFrames.filter(f => !f.name.endsWith(' · filtres'))
  const mobileFrames = (): FakeNode[] => pageFrames().filter(f => widthOf(f) < 768)

  it('les largeurs par défaut du DM comprennent 390 et 360', () => {
    expect(DEFAULT_PAGE_WIDTHS.dm).toEqual(expect.arrayContaining([390, 360]))
  })

  it('chaque page DM a un cadre à 390 et à 360 (état par défaut)', () => {
    const names = new Set(dmFrames.map(f => f.name))
    const missing = DM_PAGES.flatMap(p => [390, 360].map(w => frameName(p.id, w, 'default')).filter(n => !names.has(n)))
    expect(DM_PAGES.length).toBeGreaterThan(40)
    expect(missing).toEqual([])
  })

  it('la coque du DM n’est plus celle de l’app : ni Sidebar ni MobileTabBar, le rail et la barre du backoffice', () => {
    const wrong: string[] = []
    for (const f of pageFrames()) {
      const kids = f.children.filter(c => c.visible)
      const auth = DM_PAGES.find(p => f.name.startsWith(`${p.id} · `))?.template === 'auth'
      if (visibleDescendants(f).some(n => isInstance(n, 'Sidebar') || isInstance(n, 'MobileTabBar')))
        wrong.push(`${f.name} : coque de l’app`)
      if (auth) continue
      const w = widthOf(f)
      if (w >= 768) {
        const rail = kids.find(c => isInstance(c, 'BackofficeRail'))
        const state = w < 1024 ? 'collapsed' : 'expanded'
        if (rail?.mainComponent?.name !== `state=${state}`) wrong.push(`${f.name} : rail ${state} attendu`)
      } else if (!isInstance(kids[0] as FakeNode, 'BackofficeTopBar')) wrong.push(`${f.name} : barre du haut absente`)
    }
    expect(wrong.slice(0, 20)).toEqual([])
    // La garde sait dire NON : la page de l'app porte bien la coque de l'app.
    const app = appFrames.find(f => f.name === 'app/accounts · 390') as FakeNode
    expect(visibleDescendants(app).some(n => isInstance(n, 'MobileTabBar'))).toBe(true)
    expect(visibleDescendants(app).some(n => isInstance(n, 'BackofficeTopBar'))).toBe(false)
  })

  it('les gabarits : admin-table a la coque backoffice ; chaque gabarit à coque d’app a sa variante backoffice', () => {
    const templates = scene.pages.find(p => p.name === 'Templates') as FakeNode
    const at = (set: string, w: number): FakeNode =>
      (templates.children.find(n => n.name === set) as FakeNode).children.find(c => c.name === `width=${w}`) as FakeNode
    expect(LAYOUTS['admin-table'].shell).toBe('backoffice')
    expect(at(templateSetName('admin-table'), 390).children[0]?.name).toBe('BackofficeTopBar')
    expect(at(templateSetName('admin-table'), 1440).children[0]?.name).toBe('BackofficeRail')
    for (const [id, layout] of Object.entries(LAYOUTS)) {
      if (layout.shell !== 'app') continue
      expect(at(backofficeSetName(id), 360).children[0]?.name, id).toBe('BackofficeTopBar')
      expect(at(backofficeSetName(id), 768).children[0]?.name, id).toBe('BackofficeRail')
      // La variante de l'app reste celle de l'app.
      expect(at(templateSetName(id), 1440).children[0]?.name, id).toBe('Sidebar')
    }
  })

  it('la barre du haut mobile : menu, environnement, recherche ⌘K — cibles ≥ 44 px, pleine largeur, en haut', () => {
    for (const f of mobileFrames()) {
      const bar = f.children[0] as FakeNode
      if (!isInstance(bar, 'BackofficeTopBar')) continue
      expect(bar.layoutSizingHorizontal, f.name).toBe('FILL')
      for (const name of ['menu', 'search']) {
        const target = descendants(bar).find(n => n.name === name) as FakeNode
        expect(target.width, `${f.name} ${name}`).toBeGreaterThanOrEqual(44)
        expect(target.height, `${f.name} ${name}`).toBeGreaterThanOrEqual(44)
      }
      expect(descendants(bar).some(n => n.characters === 'PROD')).toBe(true)
    }
  })

  it('0 débordement, à toutes les largeurs de chaque page DM (feuilles de filtres comprises)', () => {
    const problems = dmFrames.flatMap(f => overflows(f))
    expect(problems.slice(0, 20)).toEqual([])
  })

  it('aucun texte visible sous 12 px dans le DM (densité, D80 / RUX-26)', () => {
    const small = new Set<string>()
    for (const f of dmFrames)
      for (const n of visibleDescendants(f))
        if (n.type === 'TEXT' && fontSizeOf(n) < 12) small.add(`${f.name.split(' · ')[0]} « ${n.characters} »`)
    expect([...small].slice(0, 20)).toEqual([])
  })

  it('mobile : chaque bouton (hors lien) est une cible tactile ≥ 44 px', () => {
    const low = new Set<string>()
    for (const f of [...mobileFrames(), ...dmFrames.filter(x => x.name.endsWith(' · filtres'))])
      for (const n of visibleDescendants(f)) {
        if (!isInstance(n, 'Button') || String(n.mainComponent?.parent?.name).includes('variant=link')) continue
        if (String(n.mainComponent?.name).includes('variant=link')) continue
        if (Number(n.minHeight ?? 0) < 44)
          low.add(`${f.name} « ${descendants(n).find(x => x.type === 'TEXT')?.characters} »`)
      }
    expect([...low].slice(0, 20)).toEqual([])
  })

  it('aucun remplissage ni trait sans variable liée, sur les pages DM et « Overlays — DM »', () => {
    const loose = new Set<string>()
    const roots = scene.pages.filter(p => p.name.startsWith('DM — ') || p.name === overlayPageOf('dm'))
    for (const p of roots)
      for (const n of descendants(p))
        for (const field of ['fills', 'strokes'] as const)
          for (const paint of (n[field] ?? []) as (Paint & { boundVariables?: { color?: { id: string } } })[])
            if (paint.type === 'SOLID' && !variableIds.has(paint.boundVariables?.color?.id ?? ''))
              loose.add(`${p.name} ${n.name}.${field}`)
    expect([...loose].slice(0, 20)).toEqual([])
  })

  it('tableau à rôles mobiles : aucun Table sous 768, titre + statut + action visibles, le reste dans la fiche dépliée', () => {
    const wrong: string[] = []
    let lists = 0
    for (const f of mobileFrames()) {
      const nodes = visibleDescendants(f)
      if (nodes.some(n => isInstance(n, 'Table'))) wrong.push(`${f.name} : Table défilant`)
      for (const list of nodes.filter(n => n.name === 'MobileRoleTable')) {
        lists++
        const rows = list.children.filter(c => c.visible && /^role-row\/\d+$/.test(c.name))
        if (rows.length === 0) wrong.push(`${f.name} : liste vide`)
        const first = rows[0] as FakeNode
        const title = descendants(first).find(n => n.name === 'title')
        if (!title?.characters) wrong.push(`${f.name} : ligne sans titre`)
        // Une seule fiche dépliée (la première) ; les autres lignes se déplient par leur chevron (44 px).
        const expanded = rows.filter(r => descendants(r).some(n => n.name === 'details' && n.visible))
        if (expanded.length > 1) wrong.push(`${f.name} : ${expanded.length} fiches dépliées`)
        for (const r of rows) {
          const toggle = descendants(r).find(n => n.name === 'toggle')
          if (toggle && (toggle.width < 44 || toggle.height < 44)) wrong.push(`${f.name} : chevron < 44`)
        }
      }
    }
    expect(lists).toBeGreaterThan(10)
    expect(wrong.slice(0, 20)).toEqual([])
  })

  it('rôles : le statut et l’action restent sur la ligne (dm/esn-detail, membres : Email · Rôle · Retirer)', () => {
    const f = dmFrames.find(x => x.name === 'dm/esn-detail · 390') as FakeNode
    const list = visibleDescendants(f).find(
      n => n.name === 'MobileRoleTable' && descendants(n).some(d => d.name === 'action'),
    ) as FakeNode
    expect(list).toBeDefined()
    const lines = list.children.map(r => r.children.find(c => c.name === 'line') as FakeNode)
    const names = (line: FakeNode): string[] => line.children.filter(c => c.visible).map(c => c.name)
    // Le propriétaire n'a pas d'action « Retirer » : sa ligne n'en montre pas (on n'affiche pas ce qu'on n'a pas).
    expect(names(lines[0] as FakeNode)).toEqual(['title', 'status', 'toggle'])
    expect(names(lines[1] as FakeNode)).toEqual(['title', 'status', 'action', 'toggle'])
    const title = descendants(lines[1] as FakeNode).find(n => n.name === 'title') as FakeNode
    expect(title.characters).toContain('@wavestone-consulting.fr')
    // Nom et « Depuis » passent dans la fiche de la ligne, en étiquette / valeur.
    const details = (list.children[1] as FakeNode).children.find(c => c.name === 'details') as FakeNode
    expect(details.visible).toBe(false)
    expect(details.children.map(c => descendants(c).find(n => n.name === 'label')?.characters)).toEqual([
      'Nom',
      'Depuis',
    ])
  })

  it('filtres : sous 768, en feuille basse — la recherche reste, un bouton « Filtres » ouvre la feuille', () => {
    const withSheet = DM_PAGES.filter(p => dmFrames.some(f => f.name === filterSheetFrameName(p.id, 390)))
    expect(withSheet.length).toBeGreaterThan(3)
    for (const p of withSheet) {
      const page = dmFrames.find(f => f.name === frameName(p.id, 390, 'default')) as FakeNode
      const filters = visibleDescendants(page).find(n => n.name === 'filters' && n.type === 'FRAME') as FakeNode
      const labels = visibleDescendants(filters)
        .filter(n => n.type === 'TEXT')
        .map(n => n.characters)
      expect(
        labels.some(l => l.startsWith('Filtres')),
        p.id,
      ).toBe(true)
      expect(
        visibleDescendants(filters).some(n => isInstance(n, 'FilterChips')),
        p.id,
      ).toBe(false)
      const sheet = dmFrames.find(f => f.name === filterSheetFrameName(p.id, 390)) as FakeNode
      const panel = sheet.children.find(c => c.name === 'overlay') as FakeNode
      expect([sheet.width, sheet.height]).toEqual([390, 844])
      expect(panel.width).toBe(390)
      expect(panel.y + panel.height).toBe(844)
      // Le Sheet porte des enfants : détaché (Figma ne remplit pas un cadre d'instance), il garde son nom.
      expect(visibleDescendants(panel)[0]?.name).toBe('Sheet')
    }
  })

  it('les 5 surcouches DM sont dessinées aussi à 390, en feuille basse pleine largeur ; la recherche ⌘K en plein écran', () => {
    const page = scene.pages.find(p => p.name === overlayPageOf('dm')) as FakeNode
    expect(DM_OVERLAYS.length).toBe(5)
    for (const o of DM_OVERLAYS) {
      const f = page.children.find(n => n.name === overlayFrameName(o.id, 390)) as FakeNode
      expect(f, o.id).toBeDefined()
      const panel = f.children.find(c => c.name === 'overlay') as FakeNode
      expect(panel.width, o.id).toBe(390)
      expect(panel.x, o.id).toBe(0)
      expect(visibleDescendants(panel)[0]?.name, o.id).toBe('Sheet')
      expect(overflows(panel), o.id).toEqual([])
      if (o.kind === 'command') expect([panel.y, panel.height], o.id).toEqual([0, 844])
      else expect(panel.y + panel.height, o.id).toBe(844)
    }
  })

  it('aucun avertissement ni erreur au journal', () => {
    const warns = log.lines
      .filter(l => l.level !== 'info')
      .map(l => l.text)
      .filter(t => !WARN_ALLOWLIST.some(r => r.test(t)))
    expect([...new Set(warns)].slice(0, 20)).toEqual([])
  })
})
