import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { beforeAll, describe, expect, it } from 'vitest'

import tokensJson from '../../generated/tokens.json'
import type { TokenSet } from '../extract/types'
import { OVERLAYS } from '../spec/overlays'
import { PAGES } from '../spec/pages'
import type { OverlaySpec } from '../spec/types'
import { MODAL_KINDS } from '../spec/validate'
import { buildComponents, buildOverlays, buildTemplates, type BuildContext } from './builders'
import { createFakeFigma, createMemoryLog } from './fake-figma'
import { createFakeScene, descendants, type FakeNode } from './fake-scene'
import { overflows, visibleDescendants } from './layout-probe'
import { overlayFrameName, overlayPageOf, overlayWidths, VIEWPORT_HEIGHT } from './overlays/render'
import { FIGMA_PAGES } from './pages'
import { upsertPages } from './upsert'
import { syncVariables } from './variables'

/**
 * Le rendu des SURCOUCHES (#figma-sync overlays, 25/09/2026) : chaque surcouche est un cadre de la
 * taille de l'écran, sa page parente dessous, un voile LIÉ à une variable (familles modales), et la
 * surcouche placée selon sa famille et le viewport. Des surcouches d'essai couvrent les neuf familles ;
 * le registre complet passe les mêmes gardes.
 */

const tokens = tokensJson as unknown as TokenSet
const WARN_ALLOWLIST = [/introuvable dans les polices installées — repli sur/]

const focusNote = (source: `${string}:${number}`) => [
  { kind: 'decision' as const, text: 'Focus sur le premier champ ; Échap ferme sans rien enregistrer.', source },
]
/** Une confirmation destructive ouvre le focus sur le bouton qui renonce (RUX-23). */
const cancelFocus = (source: `${string}:${number}`) => [
  { kind: 'decision' as const, text: 'Focus sur « Annuler » ; Échap ferme sans rien supprimer.', source },
]

const FIXTURES: OverlaySpec[] = [
  {
    id: 'app/overlays/essai-confirm',
    surface: 'app',
    kind: 'confirm',
    parent: { page: 'app/accounts' },
    source: 'packages/ui/src/components/dialog.tsx:80',
    title: 'Supprimer ce compte ?',
    description: 'Le compte part aux archives ; ses analyses restent consultables.',
    destructive: true,
    viewports: ['desktop', 'mobile'],
    actions: [{ label: 'Annuler' }, { label: 'Supprimer le compte', variant: 'destructive' }],
    uxNotes: cancelFocus('packages/ui/src/components/dialog.tsx:80'),
  },
  {
    id: 'app/overlays/essai-dialog',
    surface: 'app',
    kind: 'dialog',
    parent: { template: 'settings' },
    source: 'packages/ui/src/components/dialog.tsx:80',
    title: 'Inviter un membre',
    description: 'Il reçoit un lien valable sept jours.',
    destructive: false,
    viewports: ['desktop', 'mobile'],
    body: [
      { type: 'component', component: 'Input', props: { content: { label: 'E-mail', placeholder: 'nom@esn.fr' } } },
      { type: 'component', component: 'Select', props: { content: { label: 'Rôle', value: 'Commercial' } } },
    ],
    actions: [{ label: 'Annuler' }, { label: 'Envoyer l’invitation', variant: 'default' }],
    uxNotes: focusNote('packages/ui/src/components/dialog.tsx:80'),
  },
  {
    id: 'app/overlays/essai-sheet',
    surface: 'app',
    kind: 'sheet',
    parent: { page: 'app/contacts' },
    source: 'packages/ui/src/components/sheet.tsx:115',
    title: 'Détail du contact',
    destructive: false,
    viewports: ['desktop', 'mobile'],
    body: [{ type: 'text', text: 'Directrice des achats IT', style: 'body' }],
    actions: [{ label: 'Fermer' }, { label: 'Ouvrir la fiche', variant: 'default' }],
    uxNotes: focusNote('packages/ui/src/components/sheet.tsx:115'),
  },
  {
    id: 'app/overlays/essai-menu',
    surface: 'app',
    kind: 'dropdown',
    parent: { page: 'app/accounts' },
    source: 'packages/ui/src/components/dropdown-menu.tsx:1',
    title: 'Actions du compte',
    destructive: false,
    viewports: ['desktop', 'mobile'],
    trigger: 'Actions',
    items: ['Relancer l’analyse', 'Exporter', 'Archiver le compte'],
    uxNotes: [],
  },
  {
    id: 'app/overlays/essai-toast',
    surface: 'app',
    kind: 'toast',
    parent: { page: 'app/accounts' },
    source: 'packages/ui/src/components/toast.tsx:1',
    title: 'Analyse lancée',
    description: 'Le dossier sera prêt dans quelques minutes.',
    destructive: false,
    viewports: ['desktop', 'mobile'],
    uxNotes: [],
  },
  {
    id: 'app/overlays/essai-tooltip',
    surface: 'app',
    kind: 'tooltip',
    parent: { page: 'app/accounts' },
    source: 'packages/ui/src/components/tooltip.tsx:1',
    title: 'Score sur 10, axes nommés',
    destructive: false,
    viewports: ['desktop'],
    uxNotes: [],
  },
  {
    id: 'app/overlays/essai-popover',
    surface: 'app',
    kind: 'popover',
    parent: { page: 'app/accounts' },
    source: 'packages/ui/src/components/popover.tsx:1',
    title: 'Filtrer par secteur',
    destructive: false,
    viewports: ['desktop', 'mobile'],
    body: [{ type: 'component', component: 'Checkbox', props: { content: { label: 'Banque' } } }],
    uxNotes: [],
  },
  {
    id: 'app/overlays/essai-palette',
    surface: 'app',
    kind: 'command',
    parent: { page: 'app/dashboard' },
    source: 'apps/dashboard-manager/src/app/_components/global-search.tsx:183',
    title: 'Rechercher',
    destructive: false,
    viewports: ['desktop', 'mobile'],
    body: [
      { type: 'component', component: 'SearchInput', props: { content: { placeholder: 'Un compte, une page…' } } },
    ],
    uxNotes: focusNote('apps/dashboard-manager/src/app/_components/global-search.tsx:183'),
  },
  {
    id: 'app/overlays/essai-long',
    surface: 'app',
    kind: 'dialog',
    parent: { page: 'app/contacts' },
    source: 'apps/web/src/features/crm-core/view/CreateContactDialog.tsx:164',
    title: 'Ajouter un contact',
    destructive: false,
    viewports: ['desktop', 'mobile'],
    body: ['Nom', 'Fonction', 'Entité', 'E-mail', 'Téléphone'].map(label => ({
      type: 'component' as const,
      component: 'Input' as const,
      props: { content: { label } },
    })),
    actions: [{ label: 'Annuler' }, { label: 'Créer le contact', variant: 'default' }],
    uxNotes: focusNote('apps/web/src/features/crm-core/view/CreateContactDialog.tsx:164'),
  },
  {
    id: 'dm/overlays/essai-dm',
    surface: 'dm',
    kind: 'confirm',
    parent: { page: 'dm/users' },
    source: 'packages/ui/src/components/dialog.tsx:80',
    title: 'Révoquer l’accès ?',
    description: 'La personne est déconnectée de tous ses appareils.',
    destructive: true,
    viewports: ['desktop'],
    actions: [{ label: 'Annuler' }, { label: 'Révoquer l’accès', variant: 'destructive' }],
    uxNotes: cancelFocus('packages/ui/src/components/dialog.tsx:80'),
  },
]

async function setup() {
  const vars = createFakeFigma()
  const variables = await syncVariables(vars.api, tokens, createMemoryLog())
  const scene = createFakeScene()
  upsertPages(scene.api as never, FIGMA_PAGES)
  const log = createMemoryLog()
  const ctx: BuildContext = { tokens, variables, log, draw: scene.api }
  await buildComponents(ctx)
  await buildTemplates(ctx)
  return { ctx, scene, log, variables, variableIds: new Set(vars.variables.map(v => v.id)) }
}

type Env = Awaited<ReturnType<typeof setup>>

const framesOf = (env: Env, surface: 'app' | 'site' | 'dm'): FakeNode[] =>
  env.scene.pages
    .find(p => p.name === overlayPageOf(surface))
    ?.children.filter(c => c.type === 'FRAME' && !c.name.startsWith('UX — ')) ?? []

const frameOf = (env: Env, id: string, width: number): FakeNode => {
  const surface = id.split('/')[0] as 'app' | 'site' | 'dm'
  const f = framesOf(env, surface).find(n => n.name === overlayFrameName(id, width))
  if (!f) throw new Error(`cadre ${id} · ${width} absent`)
  return f
}
const panelOf = (frame: FakeNode): FakeNode => frame.children.find(c => c.name === 'overlay') as FakeNode

describe('surcouches — rendu des surcouches d’essai (faux figma)', { timeout: 120_000 }, () => {
  let env: Env
  let firstCount = 0
  beforeAll(async () => {
    env = await setup()
    for (const surface of ['app', 'dm'] as const) await buildOverlays(env.ctx, surface, FIXTURES, PAGES)
    firstCount = env.scene.pages.flatMap(descendants).length
  }, 120_000)

  it('une page « Overlays » par surface ; un cadre par surcouche × largeur (1440, 390 ; DM : 1440 seul)', () => {
    expect(overlayPageOf('app')).toBe('Overlays — App')
    expect(overlayPageOf('dm')).toBe('Overlays — DM')
    const app = framesOf(env, 'app').map(f => f.name)
    for (const o of FIXTURES.filter(x => x.surface === 'app'))
      for (const w of overlayWidths(o)) expect(app).toContain(overlayFrameName(o.id, w))
    expect(overlayWidths(FIXTURES.find(o => o.kind === 'tooltip') as OverlaySpec)).toEqual([1440])
    expect(framesOf(env, 'dm').map(f => f.name)).toEqual([overlayFrameName('dm/overlays/essai-dm', 1440)])
  })

  it('chaque cadre a la taille de l’écran, rogné ; la page parente dessous', () => {
    for (const o of FIXTURES)
      for (const w of overlayWidths(o)) {
        const f = frameOf(env, o.id, w)
        expect([f.width, f.height, f.clipsContent]).toEqual([w, VIEWPORT_HEIGHT[w < 768 ? 'mobile' : 'desktop'], true])
        expect(f.children[0]?.name).toBe('parent')
        // La page parente est bien dessinée (ses textes), pas un cadre vide.
        expect(descendants(f.children[0] as FakeNode).filter(n => n.type === 'TEXT').length).toBeGreaterThan(3)
      }
  })

  it('le voile : familles modales seules, pleine taille, rempli par la variable guide/veil', () => {
    const veil = env.variables.byName.get('guide/veil')?.id
    for (const o of FIXTURES)
      for (const w of overlayWidths(o)) {
        const f = frameOf(env, o.id, w)
        const scrim = f.children.find(c => c.name === 'scrim')
        if (!MODAL_KINDS.includes(o.kind)) {
          expect(scrim, o.id).toBeUndefined()
          continue
        }
        expect(scrim, o.id).toBeDefined()
        expect([scrim?.width, scrim?.height]).toEqual([f.width, f.height])
        const fill = scrim?.fills[0] as { boundVariables?: { color?: { id: string } } } | undefined
        expect(fill?.boundVariables?.color?.id).toBe(veil)
        expect(f.children.map(c => c.name)).toEqual(['parent', 'scrim', 'overlay'])
      }
  })

  it('bureau : une modale est centrée ; un panneau latéral (480, RUX-24) est collé à droite, pleine hauteur moins 12 px', () => {
    const dialog = panelOf(frameOf(env, 'app/overlays/essai-dialog', 1440))
    expect(dialog.width).toBe(512)
    expect(dialog.x).toBe((1440 - 512) / 2)
    const sheet = panelOf(frameOf(env, 'app/overlays/essai-sheet', 1440))
    expect([sheet.width, sheet.x, sheet.y, sheet.height]).toEqual([480, 1440 - 480 - 12, 12, 900 - 24])
    expect(descendants(sheet).some(n => n.name === 'Sheet')).toBe(true)
  })

  it('bureau : la palette de commandes est un Dialog centré de 640 px (RUX-07)', () => {
    const palette = panelOf(frameOf(env, 'app/overlays/essai-palette', 1440))
    expect([palette.width, palette.x]).toEqual([640, (1440 - 640) / 2])
  })

  it('mobile : au-delà de 4 champs, le panneau bas prend toute la hauteur de l’écran (RUX-24)', () => {
    const long = panelOf(frameOf(env, 'app/overlays/essai-long', 390))
    expect([long.x, long.y, long.width, long.height]).toEqual([0, 0, 390, 844])
    // Au plus 4 champs : le panneau garde sa hauteur de contenu.
    const court = panelOf(frameOf(env, 'app/overlays/essai-dialog', 390))
    expect(court.height).toBeLessThan(844)
  })

  it('toast : en bas à droite en bureau, EN HAUT sous 768 (RUX-25)', () => {
    const desktop = panelOf(frameOf(env, 'app/overlays/essai-toast', 1440))
    expect(desktop.y + desktop.height).toBe(900 - 24)
    expect(desktop.x + desktop.width).toBe(1440 - 24)
    const mobile = panelOf(frameOf(env, 'app/overlays/essai-toast', 390))
    expect([mobile.x, mobile.y, mobile.width]).toEqual([16, 16, 390 - 32])
  })

  it('mobile : toute famille modale est un panneau BAS pleine largeur (Sheet), jamais une modale centrée', () => {
    for (const o of FIXTURES.filter(x => MODAL_KINDS.includes(x.kind) && x.viewports.includes('mobile'))) {
      const panel = panelOf(frameOf(env, o.id, 390))
      expect([panel.x, panel.width, panel.y + panel.height], o.id).toEqual([0, 390, 844])
      const surface = panel.children[0] as FakeNode
      expect(surface.name, o.id).toBe('Sheet')
      expect(surface.layoutSizingHorizontal).toBe('FILL')
      // Le pied en colonne, primaire EN HAUT, chaque bouton pleine largeur (cible ≥ 44 px).
      const buttons = descendants(panel).filter(n => n.type === 'INSTANCE' && n.name === 'Button')
      expect(buttons.length, o.id).toBe(o.actions?.length ?? 0)
      for (const b of buttons) expect([b.layoutSizingHorizontal, Number(b.minHeight) >= 44]).toEqual(['FILL', true])
      const labels = buttons.map(b => descendants(b).find(n => n.name === 'label')?.characters)
      if (o.actions?.length) expect(labels[0]).toBe(o.actions.at(-1)?.label)
    }
  })

  it('destructif : le bouton primaire est un Button `destructive` qui porte le verbe de la spec', () => {
    for (const w of [1440, 390]) {
      const panel = panelOf(frameOf(env, 'app/overlays/essai-confirm', w))
      const texts = descendants(panel)
        .filter(n => n.type === 'TEXT' && n.visible)
        .map(n => n.characters)
      expect(texts).toEqual(expect.arrayContaining(['Supprimer ce compte ?', 'Supprimer le compte', 'Annuler']))
      const destructive = descendants(panel).filter(
        n =>
          n.type === 'INSTANCE' &&
          `${n.mainComponent?.parent?.name} ${n.mainComponent?.name}`.includes('variant=destructive'),
      )
      expect(destructive.length, String(w)).toBe(1)
    }
  })

  it('menu, info-bulle, toast et popover : aucun voile, posés dans l’écran', () => {
    for (const id of ['essai-menu', 'essai-toast', 'essai-tooltip', 'essai-popover']) {
      const o = FIXTURES.find(x => x.id.endsWith(id)) as OverlaySpec
      for (const w of overlayWidths(o)) {
        const panel = panelOf(frameOf(env, o.id, w))
        expect(panel.x, `${id} ${w}`).toBeGreaterThanOrEqual(0)
        expect(panel.x + panel.width, `${id} ${w}`).toBeLessThanOrEqual(w)
        expect(panel.y + panel.height, `${id} ${w}`).toBeLessThanOrEqual(w < 768 ? 844 : 900)
      }
    }
    const menu = panelOf(frameOf(env, 'app/overlays/essai-menu', 1440))
    expect(
      descendants(menu)
        .filter(n => n.type === 'TEXT' && n.visible)
        .map(n => n.characters),
    ).toEqual(expect.arrayContaining(['Actions', 'Relancer l’analyse', 'Archiver le compte']))
  })

  it('aucun remplissage ni trait sans variable liée, sur les pages Overlays', () => {
    const unbound: string[] = []
    for (const p of env.scene.pages.filter(x => x.name.startsWith('Overlays — ')))
      for (const n of descendants(p))
        for (const field of ['fills', 'strokes'] as const)
          for (const paint of (n[field] ?? []) as (Paint & { boundVariables?: { color?: { id: string } } })[])
            if (paint.type === 'SOLID' && !env.variableIds.has(paint.boundVariables?.color?.id ?? ''))
              unbound.push(`${n.name}.${field}`)
    expect(unbound).toEqual([])
  })

  it('aucun débordement dans une surcouche', () => {
    const problems: string[] = []
    for (const o of FIXTURES)
      for (const w of overlayWidths(o)) problems.push(...overflows(panelOf(frameOf(env, o.id, w))))
    expect(problems.join('\n')).toBe('')
  })

  it('aucun avertissement ni erreur au journal', () => {
    const warns = env.log.lines
      .filter(l => l.level !== 'info')
      .map(l => l.text)
      .filter(t => !WARN_ALLOWLIST.some(r => r.test(t)))
    expect([...new Set(warns)]).toEqual([])
  })

  it('idempotence : relancer ne duplique rien', async () => {
    for (const surface of ['app', 'dm'] as const) await buildOverlays(env.ctx, surface, FIXTURES, PAGES)
    expect(env.scene.pages.flatMap(descendants).length).toBe(firstCount)
  })
})

describe('surcouches — le registre complet (faux figma)', { timeout: 240_000 }, () => {
  let env: Env
  beforeAll(async () => {
    env = await setup()
    for (const surface of ['app', 'site', 'dm'] as const) await buildOverlays(env.ctx, surface, OVERLAYS, PAGES)
  }, 240_000)

  it('chaque surcouche du registre est dessinée à chacune de ses largeurs', () => {
    const missing: string[] = []
    for (const o of OVERLAYS)
      for (const w of overlayWidths(o)) {
        const f = framesOf(env, o.surface).find(n => n.name === overlayFrameName(o.id, w))
        if (!f || !panelOf(f) || visibleDescendants(panelOf(f)).length < 2) missing.push(`${o.id} · ${w}`)
      }
    expect(missing).toEqual([])
  })

  it('0 débordement, 0 remplissage sans variable, 0 avertissement', () => {
    const problems: string[] = []
    for (const o of OVERLAYS)
      for (const w of overlayWidths(o)) {
        const f = framesOf(env, o.surface).find(n => n.name === overlayFrameName(o.id, w))
        if (f) problems.push(...overflows(panelOf(f)).map(p => `${o.id} ${p}`))
      }
    for (const p of env.scene.pages.filter(x => x.name.startsWith('Overlays — ')))
      for (const n of descendants(p))
        for (const field of ['fills', 'strokes'] as const)
          for (const paint of (n[field] ?? []) as (Paint & { boundVariables?: { color?: { id: string } } })[])
            if (paint.type === 'SOLID' && !env.variableIds.has(paint.boundVariables?.color?.id ?? ''))
              problems.push(`${n.name}.${field} sans variable`)
    const warns = env.log.lines
      .filter(l => l.level !== 'info')
      .map(l => l.text)
      .filter(t => !WARN_ALLOWLIST.some(r => r.test(t)))
    expect([...problems, ...new Set(warns)]).toEqual([])
  })
})

describe('surcouches — l’interface du plugin', () => {
  it('chaque surface a sa case « Overlays », et le point d’entrée connaît l’étape', () => {
    const ui = readFileSync(resolve(__dirname, 'ui.html'), 'utf8')
    const code = readFileSync(resolve(__dirname, 'code.ts'), 'utf8')
    for (const surface of ['app', 'site', 'dm']) {
      expect(ui).toContain(`value="overlays-${surface}"`)
      expect(code).toContain(`'overlays-${surface}'`)
    }
  })
})
