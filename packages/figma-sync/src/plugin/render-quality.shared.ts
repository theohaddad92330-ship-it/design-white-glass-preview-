import { beforeAll, describe, expect, it } from 'vitest'

import tokensJson from '../../generated/tokens.json'
import type { TokenSet } from '../extract/types'
import { COMPONENTS, TEMPLATES } from '../spec/catalog'
import { PAGES } from '../spec/pages'
import type { Block, Surface } from '../spec/types'
import type { SyncApi } from './api'
import { buildComponents, buildPages, buildTemplates, type BuildContext } from './builders'
import { RECIPES } from './components'
import { combinations } from './components/engine'
import { type Part, REAL_COPY } from './components/recipe'
import { createFakeFigma, createMemoryLog } from './fake-figma'
import { createFakeScene, type FakeNode } from './fake-scene'
import { charsPerLine, fontSizeOf, labelShortfall, visibleDescendants } from './layout-probe'
import { FIGMA_PAGES } from './pages'
import { frameName, pageWidths } from './pages/render'
import { upsertPages } from './upsert'
import { syncVariables } from './variables'

/**
 * Les gardes du RENDU tel que Louis l'a vu dans Figma le 25/09/2026 (« dégueu ») :
 * textes de démonstration qui fuient, textes cassés lettre à lettre, cartes dans
 * des cartes, cadres coupés à 900 px, journal plein d'avertissements. Chacune
 * tourne sur la synchronisation COMPLÈTE du registre (faux figma) d'une SURFACE —
 * découpées par surface (app/site/dm, `render-quality-<surface>.test.ts`) pour que
 * vitest les parallélise, chaque fichier restant sous 30 s.
 */

const tokens = tokensJson as unknown as TokenSet

/** Ce qui dépend du VRAI Figma (police absente du poste) : seul avertissement admis. */
const WARN_ALLOWLIST = [/introuvable dans les polices installées — repli sur/]

/** Les textes d'AUTEUR des recettes (valeur par défaut d'une propriété TEXT, contenu d'un conteneur vide). */
function demoTexts(): Set<string> {
  const out = new Set<string>()
  for (const [id, recipe] of Object.entries(RECIPES)) {
    const axes = (COMPONENTS as Record<string, { variants: Record<string, readonly string[]> }>)[id]?.variants ?? {}
    for (const combo of combinations(axes)) {
      const visit = (p: Part): void => {
        if (p.kind === 'text' && (p.prop || p.name === 'placeholder') && p.value.length > 1 && !REAL_COPY.has(p.value))
          out.add(p.value)
        if (p.kind === 'box') p.children.forEach(visit)
      }
      visit(recipe.draw(combo))
    }
  }
  return out
}

/** Un libellé d'entrée générique d'une recette (« Vue 1 », « Section 3 »…) : jamais dans une page. */
const GENERIC_ITEM = /^(Vue|Mode|Onglet|Groupe|Statut|Section|Niveau|Colonne|Option|Choix|Filtre|Entrée) \d+$/

const isPageFrame = (pageName: string): boolean =>
  pageName === 'Site' || pageName.startsWith('App — ') || pageName.startsWith('DM — ')

/**
 * La feuille basse de filtres d'une page du backoffice sous 768 (Q7) : un ÉCRAN de 844 px, rogné, voilé
 * par `guide/veil` — une surcouche posée à côté de la page, pas une page qui défile. Ses gardes (taille,
 * débordement, variables liées) sont dans `backoffice.test.ts`.
 */
const isFilterSheet = (frame: FakeNode): boolean => frame.name.endsWith(' · filtres')

/** « Thales » et les graphes n'existent que sur ces surfaces (settings-mcp, a-integrations, dashboards…). */
const THALES_SURFACES: readonly Surface[] = ['app', 'dm']
const REAL_ACCOUNT_NAMES: ReadonlySet<string> = new Set(['Thales', 'Société Générale'])
const CHART_SURFACES: readonly Surface[] = ['app', 'dm']

/**
 * Enregistre les 10 gardes du rendu pour la synchronisation COMPLÈTE d'un jeu de surfaces (une seule en
 * pratique, un fichier par surface). Aucune garde n'est retirée par le découpage : celles qui ne visent
 * qu'une surface absente du jeu lisent un registre où elle n'apparaît simplement pas (site sans DM, etc.) ;
 * celles qui exigent qu'une famille existe quelque part (Thales, graphes) le vérifient seulement quand la
 * surface qui la porte est dans le jeu, pour ne pas exiger d'une surface un texte qu'elle ne dessine jamais.
 */
export function registerRenderQualityGuards(surfaces: readonly Surface[]): void {
  const pages = PAGES.filter(p => surfaces.includes(p.surface))

  describe(`rendu — ${surfaces.join('/')} (faux figma)`, { timeout: 60_000 }, () => {
    const scene = createFakeScene()
    const log = createMemoryLog()
    const frames: { page: string; frame: FakeNode }[] = []
    const guides = new Set<string>()

    beforeAll(async () => {
      const vars = createFakeFigma()
      const variables = await syncVariables(vars.api, tokens, createMemoryLog())
      for (const name of ['guide/veil', 'guide/halo']) guides.add(variables.byName.get(name)?.id ?? name)
      upsertPages(scene.api as unknown as SyncApi, FIGMA_PAGES)
      const ctx: BuildContext = { tokens, variables, log, draw: scene.api }
      await buildComponents(ctx)
      await buildTemplates(ctx)
      for (const surface of surfaces) {
        await buildPages(ctx, surface, PAGES)
        // Rend la main à la boucle d'événements entre deux surfaces : un `await` sur une promesse déjà
        // résolue ne suffit pas (elle vide la file des microtâches, pas celle des macrotâches) — c'est la
        // file des macrotâches qui porte le heartbeat RPC du worker vitest (« onTaskUpdate »).
        await new Promise(r => setImmediate(r))
      }
      for (const p of scene.pages.filter(x => isPageFrame(x.name)))
        for (const frame of p.children) frames.push({ page: p.name, frame })
    }, 240_000)

    it('aucun avertissement hors de la liste nommée (police du poste)', () => {
      const warns = log.lines
        .filter(l => l.level !== 'info')
        .map(l => l.text)
        .filter(t => !WARN_ALLOWLIST.some(r => r.test(t)))
      expect([...new Set(warns)]).toEqual([])
    })

    it('aucun texte de démonstration du catalogue dans une page rendue (« Libellé », « Description »…)', () => {
      const demo = demoTexts()
      for (const must of ['Libellé', 'Description', 'Une phrase de description.']) expect(demo.has(must)).toBe(true)
      const leaks = new Map<string, number>()
      for (const { frame } of frames) {
        for (const n of visibleDescendants(frame)) {
          if (n.type !== 'TEXT') continue
          // Un texte lié à une propriété et resté à sa valeur d'auteur, ou une entrée générique d'une recette.
          const key = n.componentPropertyReferences?.characters
          let owner = n.parent
          while (owner && !owner.explicitProperties && owner !== frame) owner = owner.parent
          const given = key !== undefined && key in ((owner?.explicitProperties as object | undefined) ?? {})
          const bound = key !== undefined && !given
          if ((bound && demo.has(n.characters)) || GENERIC_ITEM.test(n.characters)) {
            const key = `${frame.name.split(' · ')[0]} « ${n.characters} »`
            leaks.set(key, (leaks.get(key) ?? 0) + 1)
          }
        }
      }
      expect([...leaks.keys()]).toEqual([])
    })

    it('aucun texte replié à moins de 12 caractères par ligne', () => {
      const narrow = new Set<string>()
      for (const { frame } of frames) {
        const memo = new Map<FakeNode, number>()
        for (const n of visibleDescendants(frame)) {
          if (n.type !== 'TEXT' || n.maxLines === 1) continue
          // 12 caractères par ligne au moins. Un titre de 24 px et plus (un téléphone n'en loge pas 12) : aucun
          // MOT coupé — la ligne loge au moins son mot le plus long (« 25/09/2026 », « mesuré »).
          const cpl = charsPerLine(n, memo)
          const longestWord = Math.max(...n.characters.split(/\s+/).map(w => w.length))
          const floor = fontSizeOf(n) >= 24 ? Math.min(12, longestWord) : 12
          if (cpl < floor && n.characters.length > cpl)
            narrow.add(`${frame.name} ${n.parent?.name}/${n.name} « ${n.characters.slice(0, 24)} » ${cpl.toFixed(1)}`)
        }
      }
      expect([...narrow]).toEqual([])
    })

    it('aucune carte (ni liste bordée) posée dans une carte', () => {
      const CARDS = new Set(['Card', 'SectionCard', 'SettingsGroup', 'DataList', 'DangerZone'])
      const bordered = (n: FakeNode): boolean => CARDS.has(n.name) && n.strokes.length > 0
      const nested = new Set<string>()
      for (const { frame } of frames) {
        for (const n of visibleDescendants(frame)) {
          if (!bordered(n)) continue
          let up = n.parent
          while (up && up !== frame) {
            if (bordered(up)) nested.add(`${frame.name.split(' · ')[0]} : ${n.name} dans ${up.name}`)
            up = up.parent
          }
        }
      }
      expect([...nested]).toEqual([])
    })

    it('aucune page coupée : cadre HUG en hauteur (≥ 900 / 844), aucune hauteur fixe entre le cadre et ses slots', () => {
      const cut: string[] = []
      const fixedHeight = (n: FakeNode): boolean => {
        if (n.type === 'TEXT' || n.layoutSizingVertical === 'FILL') return false
        const mode = n.layoutMode as string | undefined
        if (!mode || mode === 'NONE') return false
        return mode === 'VERTICAL' ? n.primaryAxisSizingMode === 'FIXED' : n.counterAxisSizingMode === 'FIXED'
      }
      for (const { frame } of frames) {
        if (isFilterSheet(frame)) continue
        const mobile = Number(frame.name.split(' · ')[1]) < 768
        if (fixedHeight(frame)) cut.push(`${frame.name} : hauteur fixe`)
        if (Number(frame.minHeight ?? 0) < (mobile ? 844 : 900))
          cut.push(`${frame.name} : minHeight ${frame.minHeight}`)
        // La coque entre le cadre et les slots (main, content, rangées de zones) : aucune hauteur fixe.
        for (const n of frame.children.flatMap(c => [c, ...c.children.flatMap(d => [d, ...d.children])]))
          if (/^(main|content|zone\/\d+|column\/.+)$/.test(n.name) && fixedHeight(n))
            cut.push(`${frame.name} : ${n.name} hauteur fixe`)
        // La barre d'onglets mobile est le DERNIER enfant du cadre (collée en bas) ; la Sidebar s'étire en hauteur.
        const bar = frame.children.find(c => c.name === 'MobileTabBar')
        if (bar && frame.children.at(-1) !== bar) cut.push(`${frame.name} : MobileTabBar pas en bas`)
        const side = frame.children.find(c => c.name === 'Sidebar')
        if (side && side.layoutSizingVertical !== 'FILL') cut.push(`${frame.name} : Sidebar non étirée`)
        // Dans la rangée du bureau, `main` donne la hauteur : s'il était FILL, rien ne la donnerait (900 px, bas coupé).
        const main = frame.children.find(c => c.name === 'main')
        if (side && main && main.layoutSizingVertical !== 'HUG')
          cut.push(`${frame.name} : main ne donne pas la hauteur`)
      }
      expect(cut.slice(0, 20)).toEqual([])
    })

    // Défaut H (25/09/2026) : segmentés et ModeTabs tronqués à 1440 — un groupe d'options HUG, qui ne
    // défile que s'il ne tient pas (téléphone, colonne étroite).
    it('à ≥ 1440, aucun libellé de segment, d’onglet ou de mode coupé', () => {
      const SEGMENTED = new Set(['Tabs', 'ModeTabs', 'FilterChips'])
      const cut = new Set<string>()
      for (const { frame } of frames) {
        if (Number(frame.name.split(' · ')[1]) < 1440) continue
        const memo = new Map<FakeNode, number>()
        for (const n of visibleDescendants(frame)) {
          if (n.type !== 'TEXT') continue
          let owner = n.parent
          while (owner && owner !== frame && !SEGMENTED.has(owner.name)) owner = owner.parent
          if (!owner || owner === frame) continue
          const short = labelShortfall(n, memo)
          if (short < -1) cut.add(`${frame.name} ${owner.name} « ${n.characters} » ${short.toFixed(0)} px`)
        }
      }
      expect([...cut].slice(0, 20)).toEqual([])
    })

    // Défaut I (25/09/2026) : sur téléphone, la recherche et l'action principale côte à côte écrasaient la
    // recherche. Sous 768 : les deux pleine largeur, empilées.
    it('sous 768, une recherche ne partage jamais sa rangée : pleine largeur, empilée', () => {
      const squeezed = new Set<string>()
      for (const { frame } of frames) {
        if (Number(frame.name.split(' · ')[1]) >= 768) continue
        for (const n of visibleDescendants(frame)) {
          if (n.name !== 'SearchInput') continue
          const row = n.parent?.layoutMode === 'HORIZONTAL' && n.parent.children.filter(c => c.visible).length > 1
          if (row || n.layoutSizingHorizontal !== 'FILL') squeezed.add(frame.name.split(' · ')[0] ?? frame.name)
        }
      }
      expect([...squeezed]).toEqual([])
    })

    // Défaut D (25/09/2026) : sur le site, l'en-tête montrait des pastilles d'onglets et le pied de page
    // partait de x=0. En-tête = logo + liens texte + « Se connecter » + bouton ; en-tête et pied de page
    // dans le MÊME conteneur borné et centré que le contenu.
    it('site : en-tête et pied de page dans un conteneur borné et centré, liens en texte', () => {
      const bad = new Set<string>()
      for (const { page, frame } of frames) {
        if (page !== 'Site') continue
        for (const slot of ['nav', 'footer']) {
          const f = visibleDescendants(frame).find(n => n.name === slot && n.type === 'FRAME')
          if (!f) continue
          const band = f.parent
          const centered = band?.layoutMode === 'VERTICAL' && band.counterAxisAlignItems === 'CENTER'
          if (!centered || typeof f.maxWidth !== 'number' || f.maxWidth > 1280)
            bad.add(`${frame.name} : ${slot} non borné`)
          if (slot === 'nav' && visibleDescendants(f).some(n => n.name === 'TabNav')) bad.add(`${frame.name} : onglets`)
        }
      }
      expect([...bad].slice(0, 10)).toEqual([])
    })

    // Défaut F (25/09/2026) : des rectangles gris en pointillés (#a0a0a0) à la place des graphes. Un graphe
    // est un composant du catalogue ; ce qui reste (carte, organigramme, image) est une surface token.
    it('aucun emplacement gris en pointillés dans une page : les graphes sont des composants', () => {
      const grey = new Set<string>()
      const bound = (paints: unknown): boolean =>
        ((paints ?? []) as { boundVariables?: { color?: { id: string } } }[]).some(p =>
          guides.has(p.boundVariables?.color?.id ?? ''),
        )
      for (const { frame } of frames.filter(f => !isFilterSheet(f.frame)))
        for (const n of visibleDescendants(frame))
          // Un pointillé de GRAPHE (valeur non mesurée, repère) est légitime ; celui d'un emplacement ne l'est pas.
          if (bound(n.fills) || bound(n.strokes) || (/^placeholder\//.test(n.name) && n.strokes.length > 0))
            grey.add(`${frame.name.split(' · ')[0]} : ${n.name}`)
      expect([...grey].slice(0, 20)).toEqual([])
      // Les graphes ne sont dessinés que sur les surfaces qui en portent (app, dm) : un jeu site-only n'en a aucun.
      if (surfaces.some(s => CHART_SURFACES.includes(s))) {
        const charts = frames.flatMap(({ frame }) => visibleDescendants(frame)).filter(n => /^chart\//.test(n.name))
        expect(charts.length).toBeGreaterThan(0)
      }
    })

    // Défaut B (25/09/2026) : « Compte exemple 1 » et « — » partout. Les emplacements sont remplis par le
    // jeu de démonstration : aucun « <Entité> exemple N » ne reste visible, et les vrais comptes y sont.
    it('aucun emplacement « Compte exemple 1 » visible : les maquettes montrent le jeu de démonstration', () => {
      const left = new Set<string>()
      let realAccounts = 0
      for (const { frame } of frames)
        for (const n of visibleDescendants(frame)) {
          if (n.type !== 'TEXT') continue
          if (/^(Compte|Entreprise|Client|Contact|Talent|Consultant|Mission|Membre) exemple( \d+)?$/.test(n.characters))
            left.add(`${frame.name.split(' · ')[0]} « ${n.characters} »`)
          if (REAL_ACCOUNT_NAMES.has(n.characters)) realAccounts++
        }
      expect([...left].slice(0, 20)).toEqual([])
      // Un vrai compte nommé n'apparaît que sur les surfaces qui en citent un : le jeu de démonstration
      // (app — Société Générale en tête depuis la salle à six comptes du 01/10/2026) et la spec des
      // intégrations (dm/a-integrations, qui illustre avec Thales).
      if (surfaces.some(s => THALES_SURFACES.includes(s))) expect(realAccounts).toBeGreaterThan(0)
      if (surfaces.includes('app')) {
        const accounts = frames.find(f => f.frame.name === 'app/accounts · 1440')?.frame
        const rows = accounts ? visibleDescendants(accounts).filter(n => /^row\/\d+$/.test(n.name)) : []
        expect(rows.length).toBe(6)
      }
    })

    it('chaque bloc de chaque slot de la spec produit un nœud visible dans le cadre rendu', () => {
      const missing: string[] = []
      for (const spec of pages) {
        const pageNode = scene.pages.find(p =>
          p.children.some(f => f.name === frameName(spec.id, pageWidths(spec)[0] ?? 1440, 'default')),
        )
        const width = pageWidths(spec)[0]
        if (!pageNode || width === undefined) {
          missing.push(`${spec.id} : aucun cadre`)
          continue
        }
        const frame = pageNode.children.find(f => f.name === frameName(spec.id, width, 'default')) as FakeNode
        const slots = spec.slots as Partial<Record<string, Block[]>>
        for (const slot of TEMPLATES[spec.template].slots as readonly string[]) {
          const blocks = slots[slot] ?? []
          if (!blocks.length) continue
          const f = visibleDescendants(frame).find(
            n => n.name === slot && n.type === 'FRAME' && n.parent?.type !== 'INSTANCE',
          )
          const rendered = f ? f.children.filter(c => c.visible).length : 0
          if (rendered !== blocks.length) missing.push(`${spec.id}/${slot} : ${rendered}/${blocks.length}`)
        }
      }
      expect(missing).toEqual([])
    })
  })
}
